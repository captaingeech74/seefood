/**
 * Corpus persistence (PRD §5.1). Supabase Postgres holds all menu/photo
 * *metadata* — image bytes live in R2 (see storage.ts). This is the permanent
 * store the 24h in-memory cache used to be a throwaway substitute for.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { DataSource, DishPhoto, MenuItemData, Restaurant } from "./types";
import { dedupeToPrimary } from "./dishGrouping";
import type { AnalyticsEventName } from "./analytics";
import type { WebsiteExtractResult } from "./menuSources";
import { normalizePhotoAuthor, trustLabel, withPhotoSignals } from "./photoSignals";
import {
  canReactivateQuarantinedPhoto,
  shouldActivatePhotoObservation,
} from "./photoFingerprint";
import {
  pendingKnownDishPhotoState,
  terminalContributionReview,
} from "./contributionFunnel";
import { interpretContributionGoldContract } from "./contributionContract.mjs";
import { normalizeMerchantItems, type MerchantProvider } from "./merchantProviders";
import { restaurantSearchMatches, restaurantSearchTerms } from "./restaurantSearch";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// How long corpus data is considered fresh enough to skip the live pipeline
// entirely. Coarse single knob for Phase 1; PRD's per-source freshness
// (menus weekly, photos monthly) can split this later once volume warrants it.
const CORPUS_FRESH_HOURS = 24;

export interface CorpusSnapshot {
  photos: DishPhoto[];
  popularDishes: string[];
  isFresh: boolean;
}

interface PhotoRow {
  id: number;
  restaurant_id?: string;
  storage_url: string | null;
  origin_url: string | null;
  source: string;
  attribution: string;
  is_orderable: boolean;
  tier: number | null;
  width: number | null;
  height: number | null;
  gemini_label: string | null;
  menu_item_id: number | null;
  love_count: number | null;
  primary_votes: number | null;
  source_platform: string | null;
  photo_author_type: string | null;
  trust_label: string | null;
  photo_quality_score: number | null;
  dish_popularity_score: number | null;
  is_hero_candidate: boolean | null;
  is_storefront: boolean | null;
  is_menu_photo: boolean | null;
  comparison_ready: boolean | null;
  contributor_id: string | null;
  submitted_at: string | null;
  moderation_status: string | null;
  duplicate_hash: string | null;
  content_hash: string | null;
  perceptual_hash: string | null;
  abuse_flags: string[] | null;
  active?: boolean | null;
}

interface MenuItemRow {
  id: number;
  name: string;
  description: string | null;
}

function rowToDishPhoto(p: PhotoRow, menuItem?: MenuItemRow): DishPhoto {
  const source = p.source as DishPhoto["source"];
  const legacyAttribution = p.attribution as DishPhoto["attribution"];
  const authorType = (p.photo_author_type as DishPhoto["photoAuthorType"]) ?? normalizePhotoAuthor(source, legacyAttribution);
  return withPhotoSignals({
    id: `corpus-${p.id}`,
    url: p.storage_url ?? p.origin_url ?? "",
    dishName: menuItem?.name ?? p.gemini_label ?? null,
    dishDescription: menuItem?.description ?? null,
    menuItemId: p.menu_item_id ?? undefined,
    isMenuMatch: !!menuItem,
    source,
    attribution: legacyAttribution,
    sourcePlatform: (p.source_platform as DishPhoto["sourcePlatform"]) ?? source,
    photoAuthorType: authorType,
    trustLabel: (p.trust_label as DishPhoto["trustLabel"]) ?? trustLabel(source, authorType ?? "unknown"),
    tier: (p.tier ?? (menuItem ? 1 : p.gemini_label ? 2 : 3)) as 1 | 2 | 3,
    width: p.width ?? 800,
    height: p.height ?? 600,
    loveCount: p.love_count ?? 0,
    primaryVotes: p.primary_votes ?? 0,
    photoQualityScore: p.photo_quality_score ?? undefined,
    dishPopularityScore: p.dish_popularity_score ?? undefined,
    isHeroCandidate: p.is_hero_candidate ?? undefined,
    isStorefront: p.is_storefront ?? false,
    isMenuPhoto: p.is_menu_photo ?? false,
    comparisonReady: p.comparison_ready ?? false,
    contributorId: p.contributor_id,
    submittedAt: p.submitted_at,
    moderationStatus: (p.moderation_status as DishPhoto["moderationStatus"]) ?? "approved",
    duplicateHash: p.duplicate_hash,
    contentHash: p.content_hash,
    perceptualHash: p.perceptual_hash,
    abuseFlags: p.abuse_flags ?? [],
  });
}

/**
 * Corpus-first read: null if the restaurant has never been seen before.
 *
 * status='test_fixture' restaurants (LRay's Kitchen) ALWAYS report
 * isFresh=true, no matter their age or even if they somehow have zero
 * photos — never falling through to /api/dishes' live-pipeline branch.
 * Confirmed live July 2026: LRay's Kitchen's place_id is a real Google
 * Place, so once its normal 24h freshness window lapsed, an ordinary page
 * view (Kyle demoing the app) silently ran the full live pipeline against
 * that real place and persistPipelineResult overwrote the seeded menu with
 * whatever the live pipeline found there (nothing) — wiping every photo on
 * the restaurant being actively demoed. Test fixtures are manually curated
 * and must never be treated as fetchable/overwritable by the live path,
 * regardless of how stale their timestamp looks.
 */
export async function getCorpusSnapshot(placeId: string): Promise<CorpusSnapshot | null> {
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("updated_at, status")
    .eq("place_id", placeId)
    .maybeSingle();
  if (!restaurant) return null;

  const isTestFixture = restaurant.status === "test_fixture";

  const [{ data: photoRows }, { data: menuItemRows }, { data: managementRanks }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .eq("restaurant_id", placeId)
      .eq("active", true)
      .order("tier", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("menu_items").select("id,name,description").eq("restaurant_id", placeId).eq("active", true),
    supabase
      .from("management_popular_items")
      .select("menu_item_name,popularity_rank")
      .eq("restaurant_id", placeId)
      .order("popularity_rank", { ascending: true }),
  ]);
  const managementRankByName = new Map(
    (managementRanks ?? []).map((row) => [normalizeDishName(row.menu_item_name), Number(row.popularity_rank)])
  );
  if (!photoRows || photoRows.length === 0) {
    return isTestFixture
      ? { photos: [], popularDishes: (managementRanks ?? []).map((row) => row.menu_item_name), isFresh: true }
      : null;
  }

  const menuItemsById = new Map<number, MenuItemRow>(
    (menuItemRows ?? []).map((m: MenuItemRow) => [m.id, m])
  );

  const photos: DishPhoto[] = (photoRows as PhotoRow[]).map((p) => {
    const menuItem = p.menu_item_id ? menuItemsById.get(p.menu_item_id) : undefined;
    const photo = rowToDishPhoto(p, menuItem);
    const managementPopularityRank = photo.dishName
      ? managementRankByName.get(normalizeDishName(photo.dishName))
      : undefined;
    return managementPopularityRank
      ? {
        ...photo,
        managementPopularityRank,
        dishPopularityScore: Math.max(photo.dishPopularityScore ?? 0, 100 - (managementPopularityRank - 1) * 10),
        isHeroCandidate: true,
      }
      : photo;
  });

  const ageMs = Date.now() - new Date(restaurant.updated_at).getTime();
  const isFresh = isTestFixture || ageMs < CORPUS_FRESH_HOURS * 60 * 60 * 1000;

  return { photos, popularDishes: [], isFresh };
}

export interface MapDishPreview {
  topPhoto: DishPhoto;
  dishes: DishPhoto[]; // top ~5, tier-ordered, for the bottom-sheet strip
  /** Distinct-dish count (same dedup the grid uses) — for "See all dishes (#)". */
  totalDishCount: number;
}

export interface CoverageActivity {
  opens: number;
  uniqueVisitors: number;
  loves: number;
  shares: number;
  photoAdds: number;
}

export interface CoverageMetrics {
  restaurantCount: number;
  averageMenuItems: number;
  averagePhotos: number;
  matchedPhotoPercentage: number;
  seeFoodPhotoPercentage: number;
  sourceBreakdown: Array<{ source: string; count: number; percentage: number }>;
  activity: { week: CoverageActivity; month: CoverageActivity };
  trackingStartedAt: string | null;
  coverageLevels: Array<{ level: 0 | 1 | 2 | 3; count: number; label: string }>;
  acquisition: {
    websiteCount: number;
    queuedCrawls: number;
    identitySources: Array<{ source: string; count: number }>;
    platforms: Array<{ platform: string; count: number }>;
  };
}

interface CoverageRestaurantRow {
  place_id: string;
  entity_id: string | null;
  lat: number | null;
  lng: number | null;
}

interface CoveragePhotoRow {
  restaurant_id: string;
  source: string;
  menu_item_id: number | null;
  canonical_dish_id: string | null;
}

interface AppEventRow {
  event_name: AnalyticsEventName;
  visitor_id: string;
  restaurant_id: string | null;
  created_at: string;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface StoredRestaurantRow {
  place_id: string;
  entity_id?: string | null;
  slug: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
}

export function isSeeFoodRestaurantId(value: string): boolean {
  return value.startsWith("seefood:");
}

function storedRowToRestaurant(row: StoredRestaurantRow): Restaurant | null {
  if (row.lat === null || row.lng === null) return null;
  return {
    id: row.place_id,
    placeId: row.place_id,
    googlePlaceId: isSeeFoodRestaurantId(row.place_id) ? undefined : row.place_id,
    slug: row.slug ?? undefined,
    name: row.name,
    address: row.address ?? "",
    lat: row.lat,
    lng: row.lng,
  };
}

interface RestaurantReadinessRow {
  place_id: string;
  menu_item_count: number | string;
  dish_photo_count: number | string;
  readiness: Restaurant["readiness"];
}

async function withRestaurantReadiness<T extends Restaurant>(restaurants: T[]): Promise<T[]> {
  if (restaurants.length === 0) return restaurants;
  const placeIds = [...new Set(restaurants.map((restaurant) => restaurant.placeId || restaurant.id))];
  const { data, error } = await supabase.rpc("restaurant_product_readiness", {
    p_place_ids: placeIds,
    p_include_google_proxy: process.env.GOOGLE_MAPS_ENABLED === "true",
  });
  if (error || !data) {
    if (error) console.error("[restaurant-readiness] lookup failed", error.message);
    return restaurants.map((restaurant) => ({ ...restaurant, readiness: "shell" as const }));
  }
  const readiness = new Map((data as RestaurantReadinessRow[]).map((row) => [row.place_id, row]));
  return restaurants.map((restaurant) => {
    const row = readiness.get(restaurant.placeId || restaurant.id);
    return row ? {
      ...restaurant,
      readiness: row.readiness,
      menuItemCount: Number(row.menu_item_count),
      dishPhotoCount: Number(row.dish_photo_count),
    } : { ...restaurant, readiness: "shell" as const, menuItemCount: 0, dishPhotoCount: 0 };
  });
}

/**
 * Product-safe restaurant discovery from SeeFood's own corpus. Google Places
 * enriches discovery when available, but must never be a single point of
 * failure for opening a stored restaurant or finding one nearby.
 */
export async function getStoredRestaurant(placeId: string): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id,slug,name,address,lat,lng,status")
    .eq("place_id", placeId)
    .neq("status", "inactive")
    .maybeSingle();
  if (error) throw error;
  const restaurant = data ? storedRowToRestaurant(data as StoredRestaurantRow) : null;
  return restaurant ? (await withRestaurantReadiness([restaurant]))[0] : null;
}

export async function findStoredNearbyRestaurant(
  lat: number,
  lng: number,
  maxDistanceKm = 3
): Promise<Restaurant | null> {
  const latDelta = maxDistanceKm / 111;
  const lngDelta = maxDistanceKm / Math.max(20, 111 * Math.cos(lat * Math.PI / 180));
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id,entity_id,slug,name,address,lat,lng,status")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .neq("status", "inactive")
    .gte("lat", lat - latDelta)
    .lte("lat", lat + latDelta)
    .gte("lng", lng - lngDelta)
    .lte("lng", lng + lngDelta)
    .limit(200);
  if (error) throw error;

  const ranked = (data ?? [])
    .map((row) => ({ row: row as StoredRestaurantRow, restaurant: storedRowToRestaurant(row as StoredRestaurantRow) }))
    .filter((value): value is { row: StoredRestaurantRow; restaurant: Restaurant } => value.restaurant !== null)
    .map(({ row, restaurant }) => ({
      row, restaurant,
      distance: haversineKm(lat, lng, restaurant.lat, restaurant.lng),
    }))
    .filter(({ distance }) => distance <= maxDistanceKm)
    .sort((a, b) => a.distance - b.distance);
  const entityIds = ranked.map(({ row }) => row.entity_id).filter((id): id is string => Boolean(id));
  if (entityIds.length > 1) {
    const { data: entities } = await supabase.from("restaurant_entities")
      .select("id,parent_entity_id")
      .in("id", entityIds);
    const parentByEntity = new Map((entities ?? []).map((entity) => [entity.id, entity.parent_entity_id as string | null]));
    const nearestParent = ranked[0]?.row.entity_id ? parentByEntity.get(ranked[0].row.entity_id) : null;
    if (nearestParent) {
      const sameResort = ranked.filter(({ row, distance }) =>
        distance <= 0.1 && row.entity_id && parentByEntity.get(row.entity_id) === nearestParent
      );
      // Phone GPS cannot distinguish named dining rooms inside one resort.
      // Returning no automatic winner opens the labeled nearby-choice map.
      if (sameResort.length > 1) return null;
    }
  }
  const nearest = ranked[0]?.restaurant ?? null;
  return nearest ? (await withRestaurantReadiness([nearest]))[0] : null;
}

export async function searchStoredRestaurants(
  query: string,
  center?: { lat: number; lng: number },
  limit = 30
): Promise<Array<Restaurant & { distanceKm?: number }>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id,slug,name,address,lat,lng,status")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .neq("status", "inactive")
    .limit(1000);
  if (error) throw error;

  const terms = restaurantSearchTerms(query);

  const restaurants = (data ?? [])
    .map((row) => storedRowToRestaurant(row as StoredRestaurantRow))
    .filter((row): row is Restaurant => row !== null)
    .map((restaurant) => {
      const haystack = `${restaurant.name} ${restaurant.address}`;
      const matches = restaurantSearchMatches(query, haystack);
      const distanceKm = center
        ? haversineKm(center.lat, center.lng, restaurant.lat, restaurant.lng)
        : undefined;
      return { ...restaurant, matches, distanceKm };
    })
    .filter((restaurant) => restaurant.matches)
    .sort((a, b) => {
      const aName = restaurantSearchTerms(a.name).join(" ");
      const bName = restaurantSearchTerms(b.name).join(" ");
      const normalizedQuery = terms.join(" ");
      const aExact = aName === normalizedQuery ? 0 : aName.startsWith(normalizedQuery) ? 1 : 2;
      const bExact = bName === normalizedQuery ? 0 : bName.startsWith(normalizedQuery) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      if (a.distanceKm !== undefined && b.distanceKm !== undefined && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return aName.localeCompare(bName);
    })
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map(({ matches: _matches, ...restaurant }) => restaurant);
  return withRestaurantReadiness(restaurants);
}

export interface RestaurantBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Returns SeeFood restaurants already attached to the product inside a map
 * viewport. This deliberately reads the same restaurant table as the rest of
 * the app; the experimental map does not create a parallel restaurant corpus.
 */
export async function getStoredRestaurantsInBounds(
  bounds: RestaurantBounds,
  limit = 1000
): Promise<Restaurant[]> {
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id,slug,name,address,lat,lng,status")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .neq("status", "inactive")
    .gte("lat", bounds.south)
    .lte("lat", bounds.north)
    .gte("lng", bounds.west)
    .lte("lng", bounds.east)
    .limit(safeLimit);
  if (error) throw error;

  const restaurants = (data ?? [])
    .map((row) => storedRowToRestaurant(row as StoredRestaurantRow))
    .filter((row): row is Restaurant => row !== null);
  return withRestaurantReadiness(restaurants);
}

function emptyActivity(): CoverageActivity {
  return { opens: 0, uniqueVisitors: 0, loves: 0, shares: 0, photoAdds: 0 };
}

function summarizeActivity(events: AppEventRow[], since: number): CoverageActivity {
  const result = emptyActivity();
  const visitors = new Set<string>();
  for (const event of events) {
    if (new Date(event.created_at).getTime() < since) continue;
    if (event.event_name === "app_open") {
      result.opens += 1;
      visitors.add(event.visitor_id);
    } else if (event.event_name === "love") result.loves += 1;
    else if (event.event_name === "share") result.shares += 1;
    else if (event.event_name === "photo_add") result.photoAdds += 1;
  }
  result.uniqueVisitors = visitors.size;
  return result;
}

export async function recordAppEvent(input: {
  eventName: AnalyticsEventName;
  visitorId: string;
  restaurantId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("app_events").insert({
    event_name: input.eventName,
    visitor_id: input.visitorId,
    restaurant_id: input.restaurantId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

export interface ContributionTarget {
  menuItemId: number;
  canonicalDishId: string | null;
  restaurantId: string;
  entityStatus: string | null;
  restaurantStatus: string | null;
  operatingStatus: string | null;
  behavioralPromptCandidate: boolean;
  goldComparisonCandidate: boolean;
  targetEvidence: {
    activeRestaurant: boolean;
    activeEntity: boolean;
    operatingStatusNotClosed: boolean;
    activeMenuItem: boolean;
    zeroMissingStreak: boolean;
    observedWithin30Days: boolean;
    latestSuccessfulSourceSnapshot: boolean;
  };
}

export async function getCurrentContributionTarget(
  restaurantId: string,
  menuItemId: number
): Promise<ContributionTarget | null> {
  const { data: menuItem, error: menuError } = await supabase
    .from("menu_items")
    .select("id,restaurant_id,canonical_dish_id,active,last_seen_at,missing_streak")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  if (menuError) throw menuError;
  if (!menuItem) return null;

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("status,entity_id")
    .eq("place_id", restaurantId)
    .maybeSingle();
  if (restaurantError) throw restaurantError;
  if (!restaurant) return null;

  let entityStatus = restaurant.status ?? null;
  let operatingStatus: string | null = null;
  if (restaurant.entity_id) {
    const { data: entity, error: entityError } = await supabase
      .from("restaurant_entities")
      .select("status,operating_status")
      .eq("id", restaurant.entity_id)
      .maybeSingle();
    if (entityError) throw entityError;
    entityStatus = entity?.status ?? entity?.operating_status ?? entityStatus;
    operatingStatus = entity?.operating_status ?? null;
  }
  const { data: contract, error: contractError } = await supabase.rpc(
    "contribution_gold_contract",
    {
      p_restaurant_id: restaurantId,
      p_menu_item_id: menuItemId,
      p_customer_photo_id: null,
    }
  );
  if (contractError) throw contractError;
  const interpreted = interpretContributionGoldContract(contract);
  return {
    menuItemId: Number(menuItem.id),
    canonicalDishId: menuItem.canonical_dish_id ?? null,
    restaurantId: menuItem.restaurant_id,
    entityStatus,
    restaurantStatus: restaurant.status ?? null,
    operatingStatus,
    behavioralPromptCandidate: interpreted.behavioralPromptCandidate,
    goldComparisonCandidate: interpreted.goldComparisonCandidate,
    targetEvidence: interpreted.targetEvidence,
  };
}

export interface StoredContributionAttempt {
  id: string;
  restaurantId: string;
  menuItemId: number;
  experimentKey: string;
  variantKey: string;
  surface: string;
  trafficClass: string;
  visitorId: string;
  sessionId: string;
  targetClass: string;
  status: string;
}

export async function getContributionAttempt(
  attemptId: string
): Promise<StoredContributionAttempt | null> {
  const { data, error } = await supabase
    .from("contribution_attempts")
    .select("id,restaurant_id,menu_item_id,experiment_key,variant_key,surface,traffic_class,visitor_id,session_id,target_class,status")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id,
        restaurantId: data.restaurant_id,
        menuItemId: Number(data.menu_item_id),
        experimentKey: data.experiment_key,
        variantKey: data.variant_key,
        surface: data.surface,
        trafficClass: data.traffic_class,
        visitorId: data.visitor_id,
        sessionId: data.session_id,
        targetClass: data.target_class,
        status: data.status,
      }
    : null;
}

export async function createContributionAttempt(input: {
  attemptId: string;
  visitorId: string;
  sessionId: string;
  restaurantId: string;
  menuItemId: number;
  trafficClass: string;
  entityStatus: string | null;
  experimentKey: string;
  variantKey: string;
  targetClass: "behavioral_prompt_candidate";
  analysisEligibility: string;
}): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("contribution_attempts")
    .select("restaurant_id,menu_item_id,visitor_id,session_id,experiment_key,variant_key,surface,target_class,status")
    .eq("id", input.attemptId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    if (
      existing.restaurant_id !== input.restaurantId ||
      Number(existing.menu_item_id) !== input.menuItemId ||
      existing.visitor_id !== input.visitorId ||
      existing.session_id !== input.sessionId ||
      existing.experiment_key !== input.experimentKey ||
      existing.variant_key !== input.variantKey ||
      existing.surface !== "known_dish" ||
      existing.target_class !== input.targetClass
    ) {
      throw new Error("Contribution attempt identity mismatch");
    }
    if (existing.status !== "created") {
      throw new Error("Contribution attempt is terminal; retry with a new attempt");
    }
    return;
  }
  const { error } = await supabase.from("contribution_attempts").insert({
    id: input.attemptId,
    visitor_id: input.visitorId,
    session_id: input.sessionId,
    restaurant_id: input.restaurantId,
    menu_item_id: input.menuItemId,
    experiment_key: input.experimentKey,
    variant_key: input.variantKey,
    surface: "known_dish",
    traffic_class: input.trafficClass,
    entity_status: input.entityStatus,
    target_class: input.targetClass,
    analysis_eligibility: input.analysisEligibility,
  });
  if (error) throw error;
}

export async function recordContributionFunnelEvent(input: {
  attemptId: string;
  eventName: string;
  eventSource: "client" | "server" | "review";
  outcome: string;
}): Promise<void> {
  const { error } = await supabase.from("contribution_funnel_events").upsert(
    {
      attempt_id: input.attemptId,
      event_name: input.eventName,
      event_source: input.eventSource,
      outcome: input.outcome,
      occurred_at: new Date().toISOString(),
    },
    {
      onConflict: "attempt_id,event_name,event_source",
      ignoreDuplicates: true,
    }
  );
  if (error) throw error;
}

export async function reviewPendingContribution(input: {
  attemptId: string;
  moderation: "approved" | "rejected";
  itemMatch: "exact" | "strong" | "unmatched";
  duplicateReview: "unique" | "duplicate";
  rightsScope: "display_with_dish";
}): Promise<{ publicationEligible: boolean }> {
  const { data: photo, error: readError } = await supabase
    .from("photos")
    .select("rights_status,rights_version,rights_scope,active,published_at")
    .eq("contribution_attempt_id", input.attemptId)
    .maybeSingle();
  if (readError) throw readError;
  if (!photo || photo.active || photo.published_at) {
    throw new Error("Contribution is not pending terminal review");
  }
  const decision = terminalContributionReview({
    ...input,
    rightsStatus: photo.rights_status,
    rightsVersion: photo.rights_version,
    rightsScope: photo.rights_scope,
  });
  const { data, error } = await supabase.rpc("review_contribution_photo", {
    p_attempt_id: input.attemptId,
    p_moderation: input.moderation,
    p_item_match: input.itemMatch,
    p_duplicate_review: input.duplicateReview,
    p_rights_scope: input.rightsScope,
  });
  if (error) throw error;
  if (Boolean(data) !== decision.publicationEligible) {
    throw new Error("Terminal review decision mismatch");
  }
  return { publicationEligible: decision.publicationEligible };
}

export async function updateContributionAttempt(input: {
  attemptId: string;
  status: string;
  rightsVersion?: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.rightsVersion) {
    patch.rights_version = input.rightsVersion;
    patch.rights_granted_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("contribution_attempts")
    .update(patch)
    .eq("id", input.attemptId);
  if (error) throw error;
}

export async function getContributionPhotoByAttempt(
  attemptId: string
): Promise<{ photoId: number; moderationStatus: string | null } | null> {
  const { data, error } = await supabase
    .from("photos")
    .select("id,moderation_status")
    .eq("contribution_attempt_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { photoId: Number(data.id), moderationStatus: data.moderation_status }
    : null;
}

export async function incrementPhotoView(photoId: number): Promise<void> {
  const { error } = await supabase.rpc("increment_photo_view", { p_photo_id: photoId });
  if (error) throw error;
}

export interface CoverageReadinessMetrics {
  identifiedRestaurants: number;
  menuCoverage: number;
  basicPhotoCoverage: number;
  basicMenuPhotoCoverage: number;
  twentyPercentMenuPhotoCoverage: number;
  fiftyPercentMenuPhotoCoverage: number;
  comparisonCoverage: number;
  claimedComparisonCoverage: number;
  visits: number;
  visitors: number;
  newVisitors: number;
  uploadSessions: number;
  loves: number;
}

export interface MarketProductScorecard {
  verifiedRestaurants: number;
  liveRestaurants: number;
  strongRestaurants: number;
  neighborhoodCoverage: number;
  contributionOpportunities: number;
  policy: string;
  neighborhoodDefinition: string;
}

export async function getMarketProductScorecard(marketKey: string): Promise<MarketProductScorecard> {
  const { data, error } = await supabase.rpc("market_product_scorecard", {
    p_market_key: marketKey,
    p_include_google_proxy: process.env.GOOGLE_MAPS_ENABLED === "true",
  });
  if (error) throw error;
  return data as MarketProductScorecard;
}

export async function getCoverageReadinessMetrics(input: {
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  since: string;
}): Promise<CoverageReadinessMetrics> {
  const { data, error } = await supabase.rpc("coverage_v2_verified_metrics", {
    p_min_lat: input.minLat ?? null,
    p_max_lat: input.maxLat ?? null,
    p_min_lng: input.minLng ?? null,
    p_max_lng: input.maxLng ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_radius_km: input.radiusKm ?? null,
    p_since: input.since,
  });
  if (error) throw error;
  return data as CoverageReadinessMetrics;
}

export interface MemberRestaurant {
  placeId: string;
  name: string;
  slug: string | null;
  lat: number | null;
  lng: number | null;
  visitCount: number;
  lastVisitedAt: string;
}

export interface MemberPhoto {
  id: string;
  url: string;
  dishName: string;
  restaurantName: string;
  restaurantId: string;
  restaurantSlug: string | null;
  loved: boolean;
  lovedAt: string | null;
  createdAt: string;
  viewCount: number;
  loveCount: number;
  primaryVotes: number;
  comparisonReady: boolean;
  relatedPhotos: string[];
}

export interface MemberPoints {
  total: number;
  level: number;
  title: string;
  currentLevelFloor: number;
  nextLevelAt: number | null;
  breakdown: Array<{ label: string; points: number; detail: string }>;
}

export interface MemberProfile {
  visits: MemberRestaurant[];
  lovedDishes: MemberPhoto[];
  photos: MemberPhoto[];
  favoriteRestaurants: MemberRestaurant[];
  points: MemberPoints;
}

export async function getMemberProfile(visitorId: string): Promise<MemberProfile> {
  const [{ data: events }, { data: contributed }] = await Promise.all([
    supabase
      .from("app_events")
      .select("event_name,restaurant_id,metadata,created_at")
      .eq("visitor_id", visitorId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("photos")
      .select("id,restaurant_id,storage_url,origin_url,gemini_label,menu_item_id,created_at,view_count,love_count,primary_votes,comparison_ready")
      .eq("contributor_id", visitorId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const eventRows = (events ?? []) as Array<{
    event_name: AnalyticsEventName;
    restaurant_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  const contributedRows = (contributed ?? []) as Array<{
    id: number;
    restaurant_id: string;
    storage_url: string | null;
    origin_url: string | null;
    gemini_label: string | null;
    menu_item_id: number | null;
    created_at: string;
    view_count: number | null;
    love_count: number | null;
    primary_votes: number | null;
    comparison_ready: boolean | null;
  }>;
  const restaurantIds = new Set<string>();
  for (const event of eventRows) if (event.restaurant_id) restaurantIds.add(event.restaurant_id);
  for (const photo of contributedRows) restaurantIds.add(photo.restaurant_id);

  const lovedPhotoIds = eventRows
    .filter((event) => event.event_name === "love")
    .map((event) => String(event.metadata?.photoId ?? ""))
    .map((id) => Number(id.replace(/^corpus-/, "")))
    .filter(Number.isFinite);
  const { data: lovedRows } = lovedPhotoIds.length
    ? await supabase.from("photos")
      .select("id,restaurant_id,storage_url,origin_url,gemini_label,menu_item_id,created_at,view_count,love_count,primary_votes,comparison_ready")
      .in("id", lovedPhotoIds)
      .eq("active", true)
    : { data: [] };
  const allPhotos = [...contributedRows, ...((lovedRows ?? []) as typeof contributedRows)];
  for (const photo of allPhotos) restaurantIds.add(photo.restaurant_id);

  const menuItemIds = [...new Set(allPhotos.map((photo) => photo.menu_item_id).filter((id): id is number => id !== null))];
  const [{ data: restaurants }, { data: menuItems }, { data: relatedPhotoRows }] = await Promise.all([
    restaurantIds.size
      ? supabase.from("restaurants").select("place_id,name,slug,lat,lng").in("place_id", [...restaurantIds])
      : Promise.resolve({ data: [] }),
    menuItemIds.length
      ? supabase.from("menu_items").select("id,name").in("id", menuItemIds)
      : Promise.resolve({ data: [] }),
    menuItemIds.length
      ? supabase.from("photos").select("menu_item_id,storage_url,origin_url").in("menu_item_id", menuItemIds).eq("active", true).limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const restaurantMap = new Map((restaurants ?? []).map((row) => [row.place_id, row]));
  const menuMap = new Map((menuItems ?? []).map((row) => [row.id, row.name]));
  const lovedSet = new Set(lovedPhotoIds);
  const lovedAtMap = new Map(eventRows
    .filter((event) => event.event_name === "love")
    .map((event) => [Number(String(event.metadata?.photoId ?? "").replace(/^corpus-/, "")), event.created_at]));
  const relatedMap = new Map<number, string[]>();
  for (const photo of relatedPhotoRows ?? []) {
    if (!photo.menu_item_id) continue;
    const url = photo.storage_url ?? photo.origin_url;
    if (!url) continue;
    relatedMap.set(photo.menu_item_id, [...(relatedMap.get(photo.menu_item_id) ?? []), url]);
  }

  const mapPhoto = (photo: typeof contributedRows[number]): MemberPhoto => ({
    id: `corpus-${photo.id}`,
    url: photo.storage_url ?? photo.origin_url ?? "",
    dishName: (photo.menu_item_id ? menuMap.get(photo.menu_item_id) : null) ?? photo.gemini_label ?? "Dish photo",
    restaurantName: restaurantMap.get(photo.restaurant_id)?.name ?? "Restaurant",
    restaurantId: photo.restaurant_id,
    restaurantSlug: restaurantMap.get(photo.restaurant_id)?.slug ?? null,
    loved: lovedSet.has(photo.id),
    lovedAt: lovedAtMap.get(photo.id) ?? null,
    createdAt: photo.created_at,
    viewCount: photo.view_count ?? 0,
    loveCount: photo.love_count ?? 0,
    primaryVotes: photo.primary_votes ?? 0,
    comparisonReady: photo.comparison_ready ?? false,
    relatedPhotos: photo.menu_item_id ? relatedMap.get(photo.menu_item_id) ?? [] : [],
  });

  const visitMap = new Map<string, MemberRestaurant>();
  const scores = new Map<string, number>();
  for (const event of eventRows) {
    if (!event.restaurant_id) continue;
    const restaurant = restaurantMap.get(event.restaurant_id);
    if (!restaurant) continue;
    if (event.event_name === "app_open") {
      const current = visitMap.get(event.restaurant_id);
      visitMap.set(event.restaurant_id, {
        placeId: event.restaurant_id,
        name: restaurant.name,
        slug: restaurant.slug,
        lat: restaurant.lat,
        lng: restaurant.lng,
        visitCount: (current?.visitCount ?? 0) + 1,
        lastVisitedAt: current?.lastVisitedAt ?? event.created_at,
      });
      scores.set(event.restaurant_id, (scores.get(event.restaurant_id) ?? 0) + 1);
    } else if (event.event_name === "love") {
      scores.set(event.restaurant_id, (scores.get(event.restaurant_id) ?? 0) + 3);
    }
  }

  const visits = [...visitMap.values()].sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt));
  const favoriteRestaurants = [...visits]
    .sort((a, b) => (scores.get(b.placeId) ?? 0) - (scores.get(a.placeId) ?? 0))
    .slice(0, 8);
  const ownLoveCount = eventRows.filter((event) => event.event_name === "love").length;
  const shareCount = eventRows.filter((event) => event.event_name === "share").length;
  const missingDishCount = eventRows.filter(
    (event) => event.event_name === "photo_add" && event.metadata?.surface === "missing_dish"
  ).length;
  const comparisonCount = contributedRows.filter((photo) => photo.comparison_ready).length;
  const receivedLoveCount = contributedRows.reduce((sum, photo) => sum + (photo.love_count ?? 0), 0);
  const representativeVoteCount = contributedRows.reduce((sum, photo) => sum + (photo.primary_votes ?? 0), 0);
  const impactBonus = contributedRows.reduce((sum, photo) => {
    const loves = photo.love_count ?? 0;
    return sum + (loves >= 50 ? 100 : loves >= 10 ? 25 : 0);
  }, 0);
  const breakdown = [
    { label: "Photos shared", points: contributedRows.length * 10, detail: "10 points each" },
    { label: "Missing menu items filled", points: missingDishCount * 10, detail: "10 bonus points each" },
    { label: "Comparison photos unlocked", points: comparisonCount * 15, detail: "15 bonus points each" },
    { label: "Loves received", points: receivedLoveCount * 3, detail: "3 points each" },
    { label: "Representative-photo votes", points: representativeVoteCount * 5, detail: "5 points each" },
    { label: "Impact milestones", points: impactBonus, detail: "25 at 10 loves, 100 at 50" },
    { label: "Dishes loved", points: ownLoveCount, detail: "1 point each" },
    { label: "Dishes shared", points: shareCount * 2, detail: "2 points each" },
  ].filter((item) => item.points > 0);
  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  const levelThresholds = [0, 25, 100, 250, 600, 1500, 4000, 10000, 25000, 60000];
  const levelTitles = ["Taster", "Regular", "Scout", "Contributor", "Tastemaker", "Guide", "Curator", "Insider", "Icon", "Legend"];
  let levelIndex = 0;
  for (let i = 0; i < levelThresholds.length; i++) {
    if (total >= levelThresholds[i]) levelIndex = i;
  }
  return {
    visits,
    lovedDishes: ((lovedRows ?? []) as typeof contributedRows).map(mapPhoto),
    photos: contributedRows.map(mapPhoto),
    favoriteRestaurants,
    points: {
      total,
      level: levelIndex + 1,
      title: levelTitles[levelIndex],
      currentLevelFloor: levelThresholds[levelIndex],
      nextLevelAt: levelThresholds[levelIndex + 1] ?? null,
      breakdown,
    },
  };
}

export async function getCoverageMetrics(
  lat: number,
  lng: number,
  radiusKm = 15
): Promise<CoverageMetrics> {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / Math.max(20, 111 * Math.cos(lat * Math.PI / 180));
  const restaurants: CoverageRestaurantRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("place_id,entity_id,lat,lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", lat - latDelta)
      .lte("lat", lat + latDelta)
      .gte("lng", lng - lngDelta)
      .lte("lng", lng + lngDelta)
      .range(from, from + 999);
    if (error) throw error;
    restaurants.push(...((data ?? []) as CoverageRestaurantRow[]));
    if (!data || data.length < 1000) break;
  }

  const entities: Array<{ id: string; lat: number; lng: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("restaurant_entities").select("id,lat,lng")
      .not("lat", "is", null).not("lng", "is", null)
      .gte("lat", lat - latDelta).lte("lat", lat + latDelta)
      .gte("lng", lng - lngDelta).lte("lng", lng + lngDelta)
      .range(from, from + 999);
    if (error) throw error;
    entities.push(...((data ?? []) as Array<{ id: string; lat: number; lng: number }>));
    if (!data || data.length < 1000) break;
  }
  const nearbyIds = restaurants
    .filter((r) => r.lat !== null && r.lng !== null && haversineKm(lat, lng, r.lat, r.lng) <= radiusKm)
    .map((r) => r.place_id);
  const nearbyEntityIds = entities.filter((r) => haversineKm(lat, lng, r.lat, r.lng) <= radiusKm).map((r) => r.id);

  if (nearbyEntityIds.length === 0) {
    return {
      restaurantCount: 0,
      averageMenuItems: 0,
      averagePhotos: 0,
      matchedPhotoPercentage: 0,
      seeFoodPhotoPercentage: 0,
      sourceBreakdown: [],
      activity: { week: emptyActivity(), month: emptyActivity() },
      trackingStartedAt: null,
      coverageLevels: [
        { level: 0, count: 0, label: "Identity only" },
        { level: 1, count: 0, label: "Menu known" },
        { level: 2, count: 0, label: "5+ matched photos" },
        { level: 3, count: 0, label: "Comparison ready" },
      ],
      acquisition: { websiteCount: 0, queuedCrawls: 0, identitySources: [], platforms: [] },
    };
  }

  const menuSets = new Map<string, Set<string>>();
  const photos: CoveragePhotoRow[] = [];
  const monthAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const events: AppEventRow[] = [];

  for (let i = 0; i < nearbyIds.length; i += 100) {
    const ids = nearbyIds.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("menu_items")
        .select("restaurant_id,canonical_dish_id")
        .in("restaurant_id", ids)
        .eq("active", true)
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        const set = menuSets.get(row.restaurant_id) ?? new Set<string>();
        set.add(row.canonical_dish_id ?? `legacy-${row.restaurant_id}-${from}-${set.size}`);
        menuSets.set(row.restaurant_id, set);
      }
      if (!data || data.length < 1000) break;
    }

    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("photos")
        .select("restaurant_id,source,menu_item_id,canonical_dish_id")
        .in("restaurant_id", ids)
        .eq("active", true)
        .range(from, from + 999);
      if (error) throw error;
      photos.push(...((data ?? []) as CoveragePhotoRow[]));
      if (!data || data.length < 1000) break;
    }

    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("app_events")
        .select("event_name,visitor_id,restaurant_id,created_at")
        .in("restaurant_id", ids)
        .gte("created_at", monthAgoIso)
        .range(from, from + 999);
      if (error && error.code !== "42P01") throw error;
      if (error?.code === "42P01") break;
      events.push(...((data ?? []) as AppEventRow[]));
      if (!data || data.length < 1000) break;
    }
  }

  const sourceCounts = new Map<string, number>();
  let matchedPhotos = 0;
  let seeFoodPhotos = 0;
  for (const photo of photos) {
    sourceCounts.set(photo.source, (sourceCounts.get(photo.source) ?? 0) + 1);
    if (photo.menu_item_id !== null || photo.canonical_dish_id !== null) matchedPhotos += 1;
    if (photo.source === "user_upload" || photo.source === "user_suggested") seeFoodPhotos += 1;
  }

  const totalPhotos = photos.length;
  const totalMenuItems = [...menuSets.values()].reduce((sum, set) => sum + set.size, 0);
  const percentage = (count: number) => (totalPhotos ? Math.round((count / totalPhotos) * 1000) / 10 : 0);
  const sourceBreakdown = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count, percentage: percentage(count) }))
    .sort((a, b) => b.count - a.count);
  const levelCounts = new Map<number, number>([[0, 0], [1, 0], [2, 0], [3, 0]]);
  const identityCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  let websiteCount = 0;
  let queuedCrawls = 0;
  if (nearbyEntityIds.length > 0) {
    for (let i = 0; i < nearbyEntityIds.length; i += 100) {
      const ids = nearbyEntityIds.slice(i, i + 100);
      const [{ data: coverageRows }, { data: identityRows }, { data: websiteRows }, { count: queued }] = await Promise.all([
        supabase.from("restaurant_coverage_levels").select("coverage_level").in("entity_id", ids),
        supabase.from("restaurant_identities").select("provider").in("entity_id", ids).eq("active", true),
        supabase.from("restaurant_websites").select("platforms").in("entity_id", ids).eq("active", true),
        supabase.from("web_crawl_jobs").select("id", { count: "exact", head: true }).in("entity_id", ids).eq("status", "queued"),
      ]);
      for (const row of coverageRows ?? []) levelCounts.set(row.coverage_level, (levelCounts.get(row.coverage_level) ?? 0) + 1);
      for (const row of identityRows ?? []) identityCounts.set(row.provider, (identityCounts.get(row.provider) ?? 0) + 1);
      for (const row of websiteRows ?? []) {
        websiteCount++;
        for (const platform of row.platforms ?? []) platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
      }
      queuedCrawls += queued ?? 0;
    }
  }

  return {
    restaurantCount: nearbyEntityIds.length,
    averageMenuItems: Math.round((totalMenuItems / nearbyEntityIds.length) * 10) / 10,
    averagePhotos: Math.round((totalPhotos / nearbyEntityIds.length) * 10) / 10,
    matchedPhotoPercentage: percentage(matchedPhotos),
    seeFoodPhotoPercentage: percentage(seeFoodPhotos),
    sourceBreakdown,
    activity: {
      week: summarizeActivity(events, Date.now() - 7 * 24 * 60 * 60 * 1000),
      month: summarizeActivity(events, Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
    trackingStartedAt: events.length
      ? events.reduce((oldest, event) => event.created_at < oldest ? event.created_at : oldest, events[0].created_at)
      : null,
    coverageLevels: [
      { level: 0, count: levelCounts.get(0) ?? 0, label: "Identity only" },
      { level: 1, count: levelCounts.get(1) ?? 0, label: "Menu known" },
      { level: 2, count: levelCounts.get(2) ?? 0, label: "5+ matched photos" },
      { level: 3, count: levelCounts.get(3) ?? 0, label: "Comparison ready" },
    ],
    acquisition: {
      websiteCount,
      queuedCrawls,
      identitySources: [...identityCounts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      platforms: [...platformCounts].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count),
    },
  };
}

/**
 * Batch corpus lookup for Map Explore v2 (PRD §4.4) — one query per pin
 * batch (viewport-sized, not per-marker) so a screenful of pins stays
 * corpus-fast. Restaurants with no corpus photos are simply absent from the
 * returned map (dot pin client-side).
 */
export async function getMapPhotosForPlaceIds(
  placeIds: string[]
): Promise<Map<string, MapDishPreview>> {
  const result = new Map<string, MapDishPreview>();
  if (placeIds.length === 0) return result;

  const [{ data: photoRows }, { data: menuItemRows }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .in("restaurant_id", placeIds)
      .eq("active", true)
      .order("tier", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("menu_items").select("id,name,description,restaurant_id").in("restaurant_id", placeIds),
  ]);
  if (!photoRows) return result;

  const menuItemsById = new Map<number, MenuItemRow>((menuItemRows ?? []).map((m: MenuItemRow) => [m.id, m]));

  const byRestaurant = new Map<string, DishPhoto[]>();
  for (const p of photoRows as (PhotoRow & { restaurant_id: string })[]) {
    const menuItem = p.menu_item_id ? menuItemsById.get(p.menu_item_id) : undefined;
    const photo = rowToDishPhoto(p, menuItem);
    const list = byRestaurant.get(p.restaurant_id) ?? [];
    list.push(photo);
    byRestaurant.set(p.restaurant_id, list);
  }

  for (const [placeId, photos] of byRestaurant) {
    // Match the dish API's renderability rule. When Google's billable proxy is
    // disabled, proxy-only photos must not make a map pin promise content the
    // restaurant page cannot display.
    const renderable = process.env.GOOGLE_MAPS_ENABLED === "true"
      ? photos
      : photos.filter((photo) => !photo.url.startsWith("/api/photo?"));
    if (renderable.length === 0) continue;
    const { primary } = dedupeToPrimary(renderable);
    result.set(placeId, { topPhoto: primary[0], dishes: primary.slice(0, 5), totalDishCount: primary.length });
  }
  return result;
}

/**
 * PRD §4.4 — "viewport visits enqueue them for crawling: the map teaches the
 * crawler where to go." Lightweight signal only: insert-if-absent with
 * status='queued' so an already-active/crawled restaurant is never reset.
 * The Tier 1 crawler can pick up status='queued' rows in a future pass.
 */
export async function enqueueForCrawl(place: {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}): Promise<void> {
  const { data: existing } = await supabase.from("restaurants").select("place_id").eq("place_id", place.placeId).maybeSingle();
  if (existing) return;
  await upsertRestaurant({
    id: place.placeId,
    placeId: place.placeId,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
  });
  await supabase.from("restaurants").update({ status: "queued" }).eq("place_id", place.placeId);
}

// Menus ~weekly, photos ~monthly per PRD §5.1 freshness policy — coarse
// single knob for now (matches CORPUS_FRESH_HOURS' level of precision).
const SATURATION_STALE_DAYS = 7;

export interface SaturationTarget {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

export interface SaturationBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Track A (Vercel Cron, website/Google/Gemini saturation — see
 * /api/cron/saturate-temecula). Picks the next batch of restaurants that
 * need a live-pipeline pass: never-crawled ('queued', e.g. from Map
 * Explore's "viewport visits enqueue for crawling" or discover-temecula.mjs)
 * first, then stale 'active' ones. 'test_fixture' is excluded — that status
 * exists specifically so the permanent test restaurant is never swept up
 * here (see scripts/seed-test-restaurant.mjs).
 */
export async function getSaturationBatch(
  limit: number,
  bounds?: SaturationBounds
): Promise<SaturationTarget[]> {
  const staleCutoff = new Date(Date.now() - SATURATION_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let queuedQuery = supabase
    .from("restaurants")
    .select("place_id,name,lat,lng,address")
    .eq("status", "queued")
    .order("created_at", { ascending: true });
  if (bounds) {
    queuedQuery = queuedQuery
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng);
  }
  const { data: queued } = await queuedQuery.limit(limit);

  const targets: SaturationTarget[] = (queued ?? []).map((r) => ({
    placeId: r.place_id, name: r.name, lat: r.lat, lng: r.lng, address: r.address ?? "",
  }));
  if (targets.length >= limit) return targets;

  let staleQuery = supabase
    .from("restaurants")
    .select("place_id,name,lat,lng,address")
    .eq("status", "active")
    .lt("updated_at", staleCutoff)
    .order("updated_at", { ascending: true });
  if (bounds) {
    staleQuery = staleQuery
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng);
  }
  const { data: stale } = await staleQuery.limit(limit - targets.length);

  for (const r of stale ?? []) {
    targets.push({ placeId: r.place_id, name: r.name, lat: r.lat, lng: r.lng, address: r.address ?? "" });
  }
  return targets;
}

export interface AcquisitionTarget extends SaturationTarget {
  jobId: string;
  entityId: string;
  source: string;
}

export async function getAcquisitionBatch(limit: number): Promise<AcquisitionTarget[]> {
  const now = new Date().toISOString();
  // A function can time out after leasing work but before reporting a result.
  // Put expired leases back into circulation so regional queues cannot stall.
  await supabase
    .from("acquisition_jobs")
    .update({ status: "queued", leased_until: null, updated_at: now })
    .eq("status", "leased")
    .lt("leased_until", now);

  const { data: jobs } = await supabase
    .from("acquisition_jobs")
    .select("id,entity_id,source,priority")
    .eq("status", "queued")
    .lte("available_at", now)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!jobs?.length) return [];

  const entityIds = jobs.map((job) => job.entity_id);
  const [{ data: entities }, { data: identities }] = await Promise.all([
    supabase.from("restaurant_entities").select("id,name,address,lat,lng").in("id", entityIds),
    supabase.from("restaurant_identities").select("entity_id,provider_id").in("entity_id", entityIds).eq("provider", "google").eq("active", true),
  ]);
  const entityMap = new Map((entities ?? []).map((entity) => [entity.id, entity]));
  const googleMap = new Map((identities ?? []).map((identity) => [identity.entity_id, identity.provider_id]));
  const targets: AcquisitionTarget[] = [];
  for (const job of jobs) {
    const entity = entityMap.get(job.entity_id);
    const placeId = googleMap.get(job.entity_id);
    if (!entity || !placeId || !(await isSourceEnabled(job.source))) continue;
    targets.push({
      jobId: job.id,
      entityId: job.entity_id,
      source: job.source,
      placeId,
      name: entity.name,
      address: entity.address ?? "",
      lat: entity.lat ?? 0,
      lng: entity.lng ?? 0,
    });
  }
  if (targets.length > 0) {
    await supabase.from("acquisition_jobs").update({
      status: "leased",
      leased_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: now,
    }).in("id", targets.map((target) => target.jobId));
  }
  return targets;
}

export async function completeAcquisitionJob(jobId: string, ok: boolean, error?: string): Promise<void> {
  const { data: job } = await supabase.from("acquisition_jobs").select("attempts").eq("id", jobId).maybeSingle();
  const attempts = (job?.attempts ?? 0) + 1;
  await supabase.from("acquisition_jobs").update({
    status: ok ? "complete" : attempts >= 3 ? "failed" : "queued",
    attempts,
    available_at: ok ? new Date().toISOString() : new Date(Date.now() + attempts * 60 * 60 * 1000).toISOString(),
    leased_until: null,
    last_error: error ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}

/** Marks a restaurant as successfully processed by Track A so it drops out of the queue. */
export async function markSaturated(placeId: string): Promise<void> {
  const { error } = await supabase.from("restaurants").update({ status: "active" }).eq("place_id", placeId);
  if (error) console.error("[saturation] markSaturated failed:", error.message);
}

/** "Richie's Real American Diner", "32150 Temecula Pkwy, Temecula, CA" → "richies-real-american-diner-temecula" */
export function slugifyRestaurant(name: string, address: string): string {
  const city = address.split(",")[1]?.trim() ?? "";
  const base = `${name} ${city}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base.slice(0, 80);
}

/**
 * Stable restaurant slug (PRD §4.4 shareable URLs, `/r/richies-diner-temecula`).
 * Computed deterministically from name+city so it never changes across
 * re-crawls; only assigned once (existing slug is preserved) and only
 * touched again if a collision forces a suffixed retry.
 */
export async function upsertRestaurant(restaurant: Restaurant): Promise<void> {
  const placeId = restaurant.placeId ?? restaurant.id;
  const { data: existing } = await supabase
    .from("restaurants")
    .select("slug,entity_id")
    .eq("place_id", placeId)
    .maybeSingle();

  // Strip cache-busting suffixes like " [bench-2026-07-10]" that scripts/
  // benchmark.mjs appends to the `name` query param to force a fresh live
  // fetch — that param feeds straight into persisted name/slug generation
  // with no separation, so without this guard every benchmark run
  // permanently baked its run-tag into the restaurant's stored name.
  const cleanName = restaurant.name.replace(/\s*\[bench-[^\]]*\]\s*$/i, "").trim();

  let entityId = existing?.entity_id as string | null | undefined;
  if (!entityId && !isSeeFoodRestaurantId(placeId)) {
    const { data: existingEntity } = await supabase
      .from("restaurant_entities")
      .select("id")
      .eq("legacy_place_id", placeId)
      .maybeSingle();
    entityId = existingEntity?.id;
  }
  if (!entityId) {
    const { data: createdEntity } = await supabase
      .from("restaurant_entities")
      .insert({
        legacy_place_id: isSeeFoodRestaurantId(placeId) ? null : placeId,
        name: cleanName,
        normalized_name: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
      })
      .select("id")
      .single();
    entityId = createdEntity?.id;
  }

  const baseSlug = existing?.slug ?? slugifyRestaurant(cleanName, restaurant.address);
  const row = {
    place_id: placeId,
    name: cleanName,
    lat: restaurant.lat,
    lng: restaurant.lng,
    address: restaurant.address,
    entity_id: entityId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("restaurants")
    .upsert({ ...row, slug: baseSlug }, { onConflict: "place_id" });

  // Unique violation on slug (23505) means a different restaurant already
  // owns that exact name+city slug — retry once with the place_id suffixed
  // on, which is guaranteed unique.
  if (error?.code === "23505") {
    const suffixed = `${baseSlug}-${placeId.slice(-6).toLowerCase()}`;
    await supabase.from("restaurants").upsert({ ...row, slug: suffixed }, { onConflict: "place_id" });
  } else if (error) {
    console.error("[corpus] upsertRestaurant failed:", error.message);
  }

  if (entityId) {
    await supabase.from("restaurant_entities").update({
        name: cleanName,
        normalized_name: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        updated_at: new Date().toISOString(),
      }).eq("id", entityId);
    if (!isSeeFoodRestaurantId(placeId)) {
      await supabase.from("restaurant_identities").upsert({
        entity_id: entityId,
        provider: "google",
        provider_id: placeId,
        name: cleanName,
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        confidence: 1,
        last_seen_at: new Date().toISOString(),
        active: true,
      }, { onConflict: "provider,provider_id" });
    }
  }
}

/** Resolve a shareable slug (PRD §4.4 `/r/[slug]`) back to its place_id. */
export async function getPlaceIdBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("restaurants")
    .select("place_id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.place_id ?? null;
}

/**
 * Slug for a restaurant, for building shareable URLs client-side. Falls back
 * to the deterministic (unsuffixed) slug if the restaurant hasn't been
 * persisted to the corpus yet — /api/dishes persists it moments later using
 * the identical slugify logic, so this stays consistent almost always; a
 * name+city collision is the only case where the assigned slug later differs.
 */
export async function getSlugForPlaceId(placeId: string, name: string, address: string): Promise<string> {
  const { data } = await supabase.from("restaurants").select("slug").eq("place_id", placeId).maybeSingle();
  return data?.slug ?? slugifyRestaurant(name, address);
}

export async function createMerchantClaim(input: {
  placeId: string;
  contactName: string;
  email: string;
  phone?: string;
  businessRole: string;
  plan: "starter" | "standard" | "growth";
  authorityAttested: boolean;
  paymentAttested: boolean;
}): Promise<string | null> {
  const entityId = await getEntityId(input.placeId);
  if (!entityId) return null;
  const { data: existing } = await supabase
    .from("merchant_claims")
    .select("id")
    .eq("entity_id", entityId)
    .eq("email", input.email.toLowerCase())
    .eq("status", "pending")
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from("merchant_claims").insert({
    entity_id: entityId,
    place_id: input.placeId,
    contact_name: input.contactName,
    email: input.email.toLowerCase(),
    phone: input.phone || null,
    business_role: input.businessRole,
    plan: input.plan,
    monthly_price: input.plan === "growth" ? 499 : input.plan === "standard" ? 99 : 9,
    authority_attested: input.authorityAttested,
    payment_attested: input.paymentAttested,
    status: "pending",
  }).select("id").single();
  if (error) {
    console.error("[merchant claim] save failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Corpus-stored display name, but ONLY for status='test_fixture' rows (e.g.
 * LRay's Kitchen). /api/restaurant otherwise always fetches the name live
 * from Google, which is correct for real restaurants — but the test fixture
 * isn't a real Google place, so its corpus name is the only source of truth
 * and needs to override whatever Google happens to return for that place_id.
 */
export async function getTestFixtureNameOverride(placeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("restaurants")
    .select("name")
    .eq("place_id", placeId)
    .eq("status", "test_fixture")
    .maybeSingle();
  return data?.name ?? null;
}

/**
 * Cross-source duplicate check for "Add a Missing Photo or Menu Item" — a
 * diner typing "Burger Supreme" should attach their photo to the SAME dish
 * Gemini or the Notion import already created (any source), not spawn a
 * second, duplicate menu item that happens to share a name. Kyle: "we
 * should be able to determine if it's a duplicate and append the photo to
 * the existing dish" — this replaces relying on the diner's word for it.
 * Exact match after case/whitespace normalization only (deliberately no
 * fuzzy matching — a false-positive merge is worse than an occasional
 * missed duplicate, which a human can still notice and we can improve later).
 */
export async function findExistingMenuItemByName(placeId: string, name: string): Promise<number | null> {
  const { data } = await supabase.from("menu_items").select("id,name").eq("restaurant_id", placeId);
  if (!data) return null;
  const key = name.toLowerCase().trim();
  const match = data.find((m) => m.name.toLowerCase().trim() === key);
  return match?.id ?? null;
}

export async function hasDuplicatePhoto(placeId: string, duplicateHash: string): Promise<boolean> {
  const { data } = await supabase
    .from("photos")
    .select("id")
    .eq("restaurant_id", placeId)
    .eq("duplicate_hash", duplicateHash)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function refreshRestaurantPhotoSignals(placeId: string): Promise<void> {
  const { data } = await supabase
    .from("photos")
    .select("id,menu_item_id,gemini_label,photo_author_type,source,attribution,love_count,primary_votes")
    .eq("restaurant_id", placeId);
  if (!data) return;

  const groups = new Map<string, typeof data>();
  for (const photo of data) {
    const key = photo.menu_item_id
      ? `menu-${photo.menu_item_id}`
      : photo.gemini_label
      ? `label-${photo.gemini_label.toLowerCase().trim()}`
      : `photo-${photo.id}`;
    const group = groups.get(key) ?? [];
    group.push(photo);
    groups.set(key, group);
  }

  const comparisonBuckets = new Map<boolean, number[]>();
  const popularityBuckets = new Map<number, number[]>();
  for (const group of groups.values()) {
    const authors = group.map((photo) =>
      photo.photo_author_type ?? normalizePhotoAuthor(photo.source as DishPhoto["source"], photo.attribution)
    );
    const comparisonReady = authors.includes("management") && authors.includes("customer");
    const popularity = Math.min(
      100,
      group.length * 7 + group.reduce((sum, photo) => sum + (photo.love_count ?? 0) * 3 + (photo.primary_votes ?? 0) * 4, 0)
    );
    const ids = group.map((photo) => photo.id);
    comparisonBuckets.set(comparisonReady, [...(comparisonBuckets.get(comparisonReady) ?? []), ...ids]);
    popularityBuckets.set(popularity, [...(popularityBuckets.get(popularity) ?? []), ...ids]);
  }

  await Promise.all([
    ...[...comparisonBuckets].map(([comparisonReady, ids]) =>
      supabase.from("photos").update({ comparison_ready: comparisonReady }).in("id", ids)
    ),
    ...[...popularityBuckets].map(([popularity, ids]) =>
      supabase.from("photos").update({ dish_popularity_score: popularity }).in("id", ids)
    ),
  ]);
}

const SOURCE_RETIREMENT_MISSES = 3;

function normalizeDishName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function getEntityId(placeId: string): Promise<string | null> {
  const { data } = await supabase.from("restaurants").select("entity_id").eq("place_id", placeId).maybeSingle();
  return data?.entity_id ?? null;
}

/** Keep every useful signal discovered on a restaurant site addressable and
 * queueable. Menu/photo serving remains in the existing corpus tables. */
export async function saveWebsiteIntelligence(
  placeId: string,
  websiteUrl: string,
  result: WebsiteExtractResult,
  source = "google"
): Promise<void> {
  const entityId = await getEntityId(placeId);
  if (!entityId) return;

  let normalizedUrl: string;
  let domain: string;
  try {
    const parsed = new URL(websiteUrl);
    parsed.hash = "";
    normalizedUrl = parsed.href;
    domain = parsed.hostname.replace(/^www\./, "");
  } catch {
    return;
  }

  const now = new Date().toISOString();
  const { data: website, error } = await supabase
    .from("restaurant_websites")
    .upsert({
      entity_id: entityId,
      url: normalizedUrl,
      domain,
      source,
      platforms: result.platforms,
      active: true,
      last_live_crawl_at: now,
      page_count: result.pagesVisited.length,
      menu_item_count: result.items.length,
      photo_count: result.photoUrls.length,
      pdf_count: result.pdfUrls.length,
      updated_at: now,
    }, { onConflict: "entity_id,url" })
    .select("id")
    .single();
  if (error || !website) {
    console.error("[corpus] saveWebsiteIntelligence failed:", error?.message);
    return;
  }

  await Promise.all([
    supabase.from("restaurants").update({ website: normalizedUrl }).eq("place_id", placeId),
    supabase.from("restaurant_entities").update({ website: normalizedUrl, updated_at: now }).eq("id", entityId),
    supabase.from("web_crawl_jobs").upsert([
      { entity_id: entityId, website_id: website.id, source: "live", status: "completed", completed_at: now, updated_at: now },
      { entity_id: entityId, website_id: website.id, source: "common_crawl", status: "queued", priority: 50, updated_at: now },
    ], { onConflict: "website_id,source" }),
  ]);

  const assets = [
    ...result.photoUrls.map((assetUrl) => ({ assetUrl, kind: "image" })),
    ...result.pdfUrls.map((assetUrl) => ({ assetUrl, kind: "pdf" })),
  ];
  if (assets.length > 0) {
    await supabase.from("website_assets").upsert(assets.map((asset) => ({
      entity_id: entityId,
      website_id: website.id,
      page_url: normalizedUrl,
      asset_url: asset.assetUrl,
      kind: asset.kind,
      source,
      last_seen_at: now,
      active: true,
    })), { onConflict: "entity_id,asset_url" });
  }
}

async function ensureCanonicalDishes(
  placeId: string,
  items: Array<{ name: string; description?: string | null }>
): Promise<Map<string, string>> {
  const entityId = await getEntityId(placeId);
  const result = new Map<string, string>();
  if (!entityId || items.length === 0) return result;

  const byNormalized = new Map<string, { name: string; description?: string | null }>();
  for (const item of items) {
    const normalized = normalizeDishName(item.name);
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, item);
  }
  if (byNormalized.size === 0) return result;

  await supabase.from("canonical_dishes").upsert(
    [...byNormalized].map(([normalized, item]) => ({
      entity_id: entityId,
      name: item.name,
      normalized_name: normalized,
      description: item.description ?? null,
      active: true,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "entity_id,normalized_name" }
  );

  const { data } = await supabase
    .from("canonical_dishes")
    .select("id,normalized_name")
    .eq("entity_id", entityId)
    .in("normalized_name", [...byNormalized.keys()]);
  for (const row of data ?? []) result.set(row.normalized_name, row.id);
  return result;
}

export async function isSourceEnabled(source: string): Promise<boolean> {
  const { data } = await supabase.from("source_registry").select("enabled").eq("source", source).maybeSingle();
  return data?.enabled !== false;
}

async function beginSourceSnapshot(placeId: string, source: string): Promise<{ id: string; entityId: string } | null> {
  const entityId = await getEntityId(placeId);
  if (!entityId) return null;
  const { data, error } = await supabase
    .from("source_snapshots")
    .insert({ entity_id: entityId, source, status: "running" })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id, entityId };
}

async function retireMissingSourceRows(
  table: "menu_items" | "photos",
  placeId: string,
  source: string,
  seenValues: string[],
  key: "source_key" | "origin_url"
): Promise<void> {
  const { data } = await supabase
    .from(table)
    .select(`id,${key},missing_streak`)
    .eq("restaurant_id", placeId)
    .eq("source", source)
    .eq("active", true);
  const seen = new Set(seenValues);
  const missing = (data ?? []).filter((row) => !seen.has(String((row as Record<string, unknown>)[key])));
  for (const row of missing) {
    const next = (row.missing_streak ?? 0) + 1;
    await supabase.from(table).update({
      missing_streak: next,
      active: next < SOURCE_RETIREMENT_MISSES,
    }).eq("id", row.id);
  }
}

async function retireMissingPhotos(
  placeId: string,
  source: string,
  photos: DishPhoto[]
): Promise<void> {
  const { data } = await supabase
    .from("photos")
    .select("id,origin_url,content_hash,missing_streak")
    .eq("restaurant_id", placeId)
    .eq("source", source)
    .eq("active", true);
  const seenHashes = new Set(photos.flatMap((photo) => photo.contentHash ?? []));
  const seenOrigins = new Set(photos.map((photo) => photo.url));
  const missing = (data ?? []).filter((row) =>
    row.content_hash
      ? !seenHashes.has(row.content_hash) && !seenOrigins.has(String(row.origin_url))
      : !seenOrigins.has(String(row.origin_url))
  );
  for (const row of missing) {
    const next = (row.missing_streak ?? 0) + 1;
    await supabase.from("photos").update({
      missing_streak: next,
      active: next < SOURCE_RETIREMENT_MISSES,
    }).eq("id", row.id);
  }
}

async function finishSourceSnapshot(input: {
  snapshotId: string;
  entityId: string;
  placeId: string;
  source: string;
  itemCount: number;
  photoCount: number;
  ok: boolean;
  error?: string;
  evidenceHash?: string;
  failureStage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: previous } = await supabase
    .from("source_states")
    .select("consecutive_empty")
    .eq("entity_id", input.entityId)
    .eq("source", input.source)
    .maybeSingle();
  const isEmpty = input.ok && input.itemCount === 0 && input.photoCount === 0;
  const consecutiveEmpty = isEmpty ? (previous?.consecutive_empty ?? 0) + 1 : 0;

  const [{ count: retainedItems }, { count: retainedPhotos }] = await Promise.all([
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", input.placeId).eq("source", input.source).eq("active", true),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("restaurant_id", input.placeId).eq("source", input.source).eq("active", true),
  ]);
  await Promise.all([
    supabase.from("source_snapshots").update({
      status: input.ok ? "succeeded" : "failed",
      completed_at: now,
      discovered_item_count: input.itemCount,
      discovered_photo_count: input.photoCount,
      accepted_item_count: input.itemCount,
      accepted_photo_count: input.photoCount,
      retained_item_count: retainedItems ?? 0,
      retained_photo_count: retainedPhotos ?? 0,
      error_detail: input.error ?? null,
      evidence_hash: input.evidenceHash ?? null,
      failure_stage: input.failureStage ?? null,
      metadata: input.metadata ?? {},
    }).eq("id", input.snapshotId),
    supabase.from("source_states").upsert({
      entity_id: input.entityId,
      source: input.source,
      last_attempt_at: now,
      last_success_at: input.ok ? now : undefined,
      last_nonempty_at: input.ok && !isEmpty ? now : undefined,
      consecutive_empty: consecutiveEmpty,
      last_item_count: input.itemCount,
      last_photo_count: input.photoCount,
      last_error: input.error ?? null,
    }, { onConflict: "entity_id,source" }),
  ]);
}

/** Persist menu items, returns a name→id map for linking photos to items. */
export async function saveMenuItems(
  placeId: string,
  items: MenuItemData[],
  options: { snapshotId?: string } = {}
): Promise<Map<string, number>> {
  const nameToId = new Map<string, number>();
  if (items.length === 0) return nameToId;

  const canonical = await ensureCanonicalDishes(placeId, items);
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    restaurant_id: placeId,
    name: item.name,
    description: item.description ?? null,
    price_captured: item.price ?? null,
    source: item.source ?? "unknown",
    canonical_dish_id: canonical.get(normalizeDishName(item.name)) ?? null,
    source_snapshot_id: options.snapshotId ?? null,
    source_key: normalizeDishName(item.name),
    active: true,
    last_seen_at: now,
    missing_streak: 0,
  }));

  const { data, error } = await supabase
    .from("menu_items")
    .upsert(rows, { onConflict: "restaurant_id,name,source" })
    .select("id,name");

  if (error) {
    console.error("[corpus] saveMenuItems failed:", error.message);
    return nameToId;
  }
  for (const row of data ?? []) nameToId.set(row.name, row.id);
  return nameToId;
}

export interface ManagementMenuItem {
  name: string;
  description: string | null;
  price: number | null;
  source: string;
  popularityRank: number | null;
}

export async function getManagementMenu(placeId: string): Promise<ManagementMenuItem[]> {
  const [{ data: rows, error }, { data: ranks }] = await Promise.all([
    supabase
      .from("menu_items")
      .select("name,description,price_captured,source,active")
      .eq("restaurant_id", placeId)
      .eq("active", true),
    supabase
      .from("management_popular_items")
      .select("menu_item_name,popularity_rank")
      .eq("restaurant_id", placeId)
      .order("popularity_rank", { ascending: true }),
  ]);
  if (error) throw error;

  const rankByName = new Map(
    (ranks ?? []).map((row) => [normalizeDishName(row.menu_item_name), Number(row.popularity_rank)])
  );
  const byName = new Map<string, ManagementMenuItem>();
  for (const row of rows ?? []) {
    const key = normalizeDishName(row.name);
    const current = byName.get(key);
    const next: ManagementMenuItem = {
      name: row.name,
      description: row.description ?? null,
      price: row.price_captured === null ? null : Number(row.price_captured),
      source: row.source,
      popularityRank: rankByName.get(key) ?? null,
    };
    if (!current || row.source === "merchant" || (!current.description && next.description)) {
      byName.set(key, next);
    }
  }
  return [...byName.values()].sort((a, b) =>
    (a.popularityRank ?? 99) - (b.popularityRank ?? 99) || a.name.localeCompare(b.name)
  );
}

export async function saveManagementPopularItems(placeId: string, names: string[]): Promise<void> {
  const requested = [...new Set(names.map((name) => normalizeDishName(name)).filter(Boolean))].slice(0, 7);
  const { data: menuRows, error: menuError } = await supabase
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", placeId)
    .eq("active", true);
  if (menuError) throw menuError;
  const available = new Map((menuRows ?? []).map((row) => [normalizeDishName(row.name), row.name]));
  const cleanNames = requested.flatMap((name) => available.get(name) ?? []).slice(0, 7);
  const { error: deleteError } = await supabase
    .from("management_popular_items")
    .delete()
    .eq("restaurant_id", placeId);
  if (deleteError) throw deleteError;
  if (!cleanNames.length) return;
  const { error } = await supabase.from("management_popular_items").insert(
    cleanNames.map((name, index) => ({
      restaurant_id: placeId,
      menu_item_name: name,
      popularity_rank: index + 1,
      tagged_at: new Date().toISOString(),
    }))
  );
  if (error) throw error;
}

export async function saveManagementMenuImport(input: {
  placeId: string;
  items: MenuItemData[];
  pageUrls: string[];
}): Promise<void> {
  const items = input.items.map((item) => ({ ...item, source: "merchant" as const }));
  await saveMenuItems(input.placeId, items);
  const { error } = await supabase.from("management_menu_imports").insert({
    restaurant_id: input.placeId,
    page_count: input.pageUrls.length,
    extracted_item_count: items.length,
    published_item_count: items.length,
    page_urls: input.pageUrls,
    status: "published",
    published_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function savePhotos(
  placeId: string,
  photos: Array<{
    originUrl: string;
    storageUrl?: string;
    source: string;
    attribution: string;
    isOrderable: boolean;
    tier: number;
    width: number;
    height: number;
    geminiLabel?: string | null;
    menuItemId?: number;
    photoQualityScore?: number;
    dishPopularityScore?: number;
    isHeroCandidate?: boolean;
    isStorefront?: boolean;
    isMenuPhoto?: boolean;
    contentHash?: string | null;
    perceptualHash?: string | null;
  }>,
  options: { snapshotId?: string } = {}
): Promise<void> {
  if (photos.length === 0) return;

  // De-dupe by origin_url BEFORE building the upsert payload — Postgres's
  // ON CONFLICT DO UPDATE errors out ("command cannot affect row a second
  // time") if two rows in the SAME statement target the same conflict key,
  // and that failure is atomic: the whole batch is rejected, not just the
  // offending row. Confirmed live July 2026: 23 of 65 restaurants in one
  // nightly crawl lost 100% of their photos to this — some upstream source
  // (Google/website candidates) occasionally repeats the identical URL
  // within one restaurant's candidate set, which previously nuked the
  // entire restaurant's save instead of just silently keeping one copy.
  const seenOrigins = new Set<string>();
  const seenHashes = new Set<string>();
  const deduped = photos.filter((p) => {
    if (seenOrigins.has(p.originUrl)) return false;
    if (p.contentHash && seenHashes.has(p.contentHash)) return false;
    seenOrigins.add(p.originUrl);
    if (p.contentHash) seenHashes.add(p.contentHash);
    return true;
  });

  const existingPhotoFields = "id,content_hash,perceptual_hash,origin_url,storage_url,source,attribution,source_platform,photo_author_type,trust_label,is_orderable,tier,width,height,gemini_label,menu_item_id,canonical_dish_id,photo_quality_score,dish_popularity_score,is_hero_candidate,is_storefront,is_menu_photo,dedupe_reason,dedupe_run_id,deduped_at,active";
  const existingOriginRows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    // Fetch by restaurant rather than putting long provider URLs in an `in`
    // query string. Some Google references are large enough for a candidate
    // batch to exceed proxy URL limits.
    const { data, error } = await supabase
      .from("photos")
      .select(existingPhotoFields)
      .eq("restaurant_id", placeId)
      .range(from, from + 999);
    if (error) throw error; // fail closed: do not persist until quarantine state is known
    existingOriginRows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < 1000) break;
  }
  const existingByOrigin = new Map(
    existingOriginRows.map((row) => [row.origin_url as string, row])
  );
  const blockedRows = deduped.filter((photo) => {
    const existing = existingByOrigin.get(photo.originUrl);
    return !canReactivateQuarantinedPhoto(
      existing?.dedupe_reason as string | null | undefined,
      photo.contentHash
    );
  });
  const blockedIds = blockedRows.flatMap((photo) => {
    const id = existingByOrigin.get(photo.originUrl)?.id;
    return id == null ? [] : [id as number];
  });
  if (blockedIds.length) {
    // This also repairs any previously quarantined row that an older
    // fail-open crawl accidentally reactivated.
    const { error } = await supabase
      .from("photos")
      .update({ active: false, missing_streak: 0 })
      .in("id", blockedIds);
    if (error) console.error("[corpus] photo quarantine refresh failed:", error.message);
  }
  const eligible = deduped.filter((photo) => {
    const existing = existingByOrigin.get(photo.originUrl);
    return canReactivateQuarantinedPhoto(
      existing?.dedupe_reason as string | null | undefined,
      photo.contentHash
    );
  });
  if (eligible.length === 0) return;

  const canonical = await ensureCanonicalDishes(
    placeId,
    eligible.filter((p) => p.geminiLabel).map((p) => ({ name: p.geminiLabel! }))
  );
  const now = new Date().toISOString();
  const hashes = eligible.flatMap((photo) => photo.contentHash ?? []);
  const { data: existingHashRows } = hashes.length
    ? await supabase
      .from("photos")
      .select(existingPhotoFields)
      .eq("restaurant_id", placeId)
      .in("content_hash", hashes)
      .is("duplicate_of_photo_id", null)
    : { data: [] };
  const existingByHash = new Map(
    (existingHashRows ?? []).map((row) => [row.content_hash as string, row])
  );

  const observedRows = eligible.map((p) => {
    const source = p.source as DishPhoto["source"];
    const authorType = normalizePhotoAuthor(source, p.attribution as DishPhoto["attribution"]);
    const existingOrigin = existingByOrigin.get(p.originUrl);
    const existing = p.contentHash
      ? existingByHash.get(p.contentHash) ?? existingOrigin
      : undefined;
    const nextActive = shouldActivatePhotoObservation(
      existingOrigin?.active as boolean | null | undefined,
      p.contentHash
    );
    const existingTier = Number(existing?.tier ?? 3);
    const nextTier = Math.min(existingTier, p.tier);
    const existingLabel = existing?.gemini_label as string | null | undefined;
    const existingMenuItemId = existing?.menu_item_id as number | null | undefined;
    const nextLabel = existingLabel ?? p.geminiLabel ?? null;
    const nextCanonical = nextLabel ? canonical.get(normalizeDishName(nextLabel)) ?? existing?.canonical_dish_id ?? null : existing?.canonical_dish_id ?? null;
    return {
      id: existing?.id as number | undefined,
      restaurant_id: placeId,
      origin_url: existing?.origin_url ?? p.originUrl,
      storage_url: p.storageUrl ?? existing?.storage_url ?? null,
      source: existing?.source ?? p.source,
      attribution: existing?.attribution ?? p.attribution,
      source_platform: existing?.source_platform ?? p.source,
      photo_author_type: existing?.photo_author_type ?? authorType,
      trust_label: existing?.trust_label ?? trustLabel(source, authorType),
      is_orderable: existing?.is_orderable ?? p.isOrderable,
      tier: nextTier,
      width: existing?.width ?? p.width,
      height: existing?.height ?? p.height,
      gemini_label: nextLabel,
      menu_item_id: existingMenuItemId ?? p.menuItemId ?? null,
      canonical_dish_id: nextCanonical,
      source_snapshot_id: options.snapshotId ?? null,
      active: nextActive,
      last_seen_at: now,
      missing_streak: 0,
      photo_quality_score: Math.max(Number(existing?.photo_quality_score ?? 0), p.photoQualityScore ?? 0),
      dish_popularity_score: Math.max(Number(existing?.dish_popularity_score ?? 0), p.dishPopularityScore ?? 0),
      is_hero_candidate: Boolean(existing?.is_hero_candidate || p.isHeroCandidate),
      is_storefront: Boolean(existing?.is_storefront || p.isStorefront),
      is_menu_photo: Boolean(existing?.is_menu_photo || p.isMenuPhoto),
      content_hash: p.contentHash ?? null,
      perceptual_hash: p.perceptualHash ?? existing?.perceptual_hash ?? null,
      duplicate_of_photo_id: null,
      dedupe_reason: nextActive ? null : "verification_pending",
      dedupe_run_id: nextActive ? null : existingOrigin?.dedupe_run_id ?? null,
      deduped_at: nextActive ? null : existingOrigin?.deduped_at ?? now,
    };
  });
  // A provider can legitimately reuse one photo across several menu items.
  // Persist one canonical photo row while retaining every item link below.
  const rows = [...new Map(observedRows.map((row) => [
    row.id
      ? `id:${row.id}`
      : row.content_hash
        ? `hash:${row.content_hash}`
        : `origin:${row.origin_url}`,
    row,
  ])).values()];
  const hashedRows = rows.filter((row) => row.content_hash);
  const unhashedRows = rows.filter((row) => !row.content_hash);
  const savedRows: Array<{ id: number; content_hash: string | null; origin_url: string | null }> = [];
  if (hashedRows.length) {
    // The database enforces one active hash per restaurant with a partial
    // unique index. Update known canonical rows by primary key so archived
    // duplicate rows remain available for rollback; insert only genuinely
    // new hashes.
    const existingRows = hashedRows.filter((row) => row.id);
    const newRows = hashedRows.filter((row) => !row.id).map(({ id: _id, ...row }) => row);
    if (existingRows.length) {
      // `photos.id` is GENERATED ALWAYS, so PostgREST cannot upsert rows that
      // carry an explicit id. These hashes already exist; refresh their shared
      // observation state in one update and retain their canonical metadata.
      const existingIds = existingRows.map((row) => row.id!);
      const { error } = await supabase
        .from("photos")
        .update({
          source_snapshot_id: options.snapshotId ?? null,
          active: true,
          last_seen_at: now,
          missing_streak: 0,
          dedupe_reason: null,
          duplicate_of_photo_id: null,
          dedupe_run_id: null,
          deduped_at: null,
        })
        .in("id", existingIds);
      if (error) console.error("[corpus] savePhotos canonical hash update failed:", error.message);
      else savedRows.push(...existingRows.map((row) => ({
        id: row.id!,
        content_hash: row.content_hash,
        origin_url: row.origin_url,
      })));
    }
    if (newRows.length) {
      const { data, error } = await supabase
        .from("photos")
        .insert(newRows)
        .select("id,content_hash,origin_url");
      if (!error) {
        savedRows.push(...(data ?? []));
      } else if (error.code === "23505") {
        // A concurrent crawl may have inserted the same hash after our
        // initial lookup. Resolve that race to the now-canonical rows rather
        // than losing provenance/menu links for the batch.
        const { data: racedRows, error: racedError } = await supabase
          .from("photos")
          .select("id,content_hash,origin_url")
          .eq("restaurant_id", placeId)
          .eq("active", true)
          .in("content_hash", newRows.flatMap((row) => row.content_hash ?? []));
        if (racedError) console.error("[corpus] savePhotos hash race lookup failed:", racedError.message);
        else {
          savedRows.push(...(racedRows ?? []));
          const racedHashes = new Set((racedRows ?? []).map((row) => row.content_hash));
          const stillNew = newRows.filter((row) => !racedHashes.has(row.content_hash));
          if (stillNew.length) {
            const { data: retriedRows, error: retryError } = await supabase
              .from("photos")
              .insert(stillNew)
              .select("id,content_hash,origin_url");
            if (retryError) console.error("[corpus] savePhotos hash race retry failed:", retryError.message);
            else savedRows.push(...(retriedRows ?? []));
          }
        }
      } else {
        console.error("[corpus] savePhotos new hashes failed:", error.message);
      }
    }
  }
  if (unhashedRows.length) {
    const { data, error } = await supabase
      .from("photos")
      .upsert(unhashedRows, { onConflict: "restaurant_id,origin_url" })
      .select("id,content_hash,origin_url");
    if (error) console.error("[corpus] savePhotos by origin failed:", error.message);
    else savedRows.push(...(data ?? []));
  }

  const idByHash = new Map(savedRows.flatMap((row) => row.content_hash ? [[row.content_hash, row.id] as const] : []));
  const idByOrigin = new Map(savedRows.flatMap((row) => row.origin_url ? [[row.origin_url, row.id] as const] : []));
  const provenanceObservations = photos.flatMap((photo) => {
    const photoId = (photo.contentHash ? idByHash.get(photo.contentHash) : undefined) ?? idByOrigin.get(photo.originUrl);
    if (!photoId) return [];
    const source = photo.source as DishPhoto["source"];
    const authorType = normalizePhotoAuthor(source, photo.attribution as DishPhoto["attribution"]);
    return [{
      photo_id: photoId,
      restaurant_id: placeId,
      source: photo.source,
      origin_url: photo.originUrl,
      storage_url: photo.storageUrl ?? null,
      attribution: photo.attribution,
      photo_author_type: authorType,
      source_snapshot_id: options.snapshotId ?? null,
      content_hash: photo.contentHash ?? null,
      last_seen_at: now,
    }];
  });
  const provenanceRows = [...new Map(provenanceObservations.map((row) => [
    `${row.restaurant_id}\u0000${row.source}\u0000${row.origin_url}`,
    row,
  ])).values()];
  if (provenanceRows.length) {
    const { error } = await supabase
      .from("photo_origins")
      .upsert(provenanceRows, { onConflict: "restaurant_id,source,origin_url" });
    if (error) console.error("[corpus] photo provenance save failed:", error.message);
  }

  const linkRows = photos.flatMap((photo) => {
    if (!photo.menuItemId) return [];
    const photoId = (photo.contentHash ? idByHash.get(photo.contentHash) : undefined) ?? idByOrigin.get(photo.originUrl);
    return photoId ? [{ photo_id: photoId, menu_item_id: photo.menuItemId, source: photo.source }] : [];
  });
  if (linkRows.length) {
    const { error } = await supabase
      .from("photo_menu_item_links")
      .upsert(linkRows, { onConflict: "photo_id,menu_item_id" });
    if (error) console.error("[corpus] photo menu-link save failed:", error.message);
  }
  if (savedRows.length) await refreshRestaurantPhotoSignals(placeId);
}

/**
 * "I Loved This" (experimental, no accounts — per-browser dedup only via
 * localStorage on the client). Only works for corpus-backed photos (id
 * formatted "corpus-{n}", a real photos.id): a photo from an in-flight
 * live-stream response that hasn't round-tripped through a page load yet
 * doesn't have a stable numeric id to attribute the love to, so those are
 * rejected rather than guessed at.
 */
export async function incrementLoveCount(photoId: string, delta: 1 | -1 = 1): Promise<number | null> {
  const match = /^corpus-(\d+)$/.exec(photoId);
  if (!match) return null;
  const id = parseInt(match[1], 10);

  const { data: current } = await supabase.from("photos").select("love_count").eq("id", id).maybeSingle();
  if (!current) return null;
  const next = Math.max(0, (current.love_count ?? 0) + delta);

  const { error } = await supabase.from("photos").update({ love_count: next }).eq("id", id);
  if (error) { console.error("[corpus] incrementLoveCount failed:", error.message); return null; }
  return next;
}

/**
 * Thumbs-up on a non-primary same-dish variant while browsing horizontally
 * in the Reveal — over time, the highest-voted photo (see computePrimaryPhoto
 * in TopDishesGrid) becomes the one shown in the grid instead of whatever
 * the pipeline happened to pick first. Same corpus-id constraint and
 * per-browser dedup approach as incrementLoveCount.
 */
export async function incrementPrimaryVotes(photoId: string): Promise<number | null> {
  const match = /^corpus-(\d+)$/.exec(photoId);
  if (!match) return null;
  const id = parseInt(match[1], 10);

  const { data: current } = await supabase.from("photos").select("primary_votes").eq("id", id).maybeSingle();
  if (!current) return null;
  const next = (current.primary_votes ?? 0) + 1;

  const { error } = await supabase.from("photos").update({ primary_votes: next }).eq("id", id);
  if (error) { console.error("[corpus] incrementPrimaryVotes failed:", error.message); return null; }
  return next;
}

/**
 * "Take Photo of Dish" (experimental). The photo is already tied to a known
 * dish (the user was looking right at it in the Reveal), so — unlike the
 * live pipeline's scraped photos — there's no naming/quality pass to run:
 * it's inserted straight in as a trusted, real-food photo attributed to the
 * dish being viewed. Returns the new corpus-backed DishPhoto so the client
 * can splice it into the current view without a full reload.
 */
export async function savePendingKnownDishPhoto(input: {
  attemptId: string;
  rightsVersion: string;
  placeId: string;
  originUrl: string;
  dishName: string | null;
  dishDescription: string | null;
  isMenuMatch: boolean;
  tier: 1 | 2 | 3;
  menuItemId: number;
  canonicalDishId: string | null;
  width: number;
  height: number;
  contributorId?: string;
  duplicateHash?: string;
}): Promise<{ photoId: number } | null> {
  const photoQualityScore = 82;
  const { data, error } = await supabase
    .from("photos")
    .insert({
      restaurant_id: input.placeId,
      origin_url: input.originUrl,
      source: "user_upload",
      attribution: "user",
      source_platform: "user_upload",
      photo_author_type: "customer",
      trust_label: "seefood_photo",
      attribution_confidence: 1,
      tier: input.tier,
      is_orderable: true,
      width: input.width,
      height: input.height,
      gemini_label: input.dishName,
      menu_item_id: input.menuItemId,
      canonical_dish_id: input.canonicalDishId,
      photo_quality_score: photoQualityScore,
      dish_popularity_score: 7,
      is_hero_candidate: !!input.dishName,
      is_storefront: false,
      is_menu_photo: false,
      contributor_id: input.contributorId ?? null,
      submitted_at: new Date().toISOString(),
      duplicate_hash: input.duplicateHash ?? null,
      abuse_flags: [],
      ...pendingKnownDishPhotoState({
        attemptId: input.attemptId,
        rightsVersion: input.rightsVersion,
      }),
      last_seen_at: new Date().toISOString(),
      missing_streak: 0,
    })
    .select("id")
    .single();
  if (error || !data) { console.error("[corpus] saveUserUploadedPhoto failed:", error?.message); return null; }

  return { photoId: Number(data.id) };
}

/** Legacy missing-dish contribution path. Kept separate from the DL-007
 * known-current-dish experiment and its denominators. */
export async function saveUserUploadedPhoto(input: {
  placeId: string;
  originUrl: string;
  dishName: string | null;
  dishDescription: string | null;
  isMenuMatch: boolean;
  tier: 1 | 2 | 3;
  menuItemId?: number;
  width: number;
  height: number;
  contributorId?: string;
  duplicateHash?: string;
}): Promise<DishPhoto | null> {
  const photoQualityScore = 82;
  const canonical = input.dishName
    ? await ensureCanonicalDishes(input.placeId, [
        { name: input.dishName, description: input.dishDescription },
      ])
    : new Map<string, string>();
  const { data, error } = await supabase
    .from("photos")
    .insert({
      restaurant_id: input.placeId,
      origin_url: input.originUrl,
      source: "user_suggested",
      attribution: "user",
      source_platform: "user_suggested",
      photo_author_type: "customer",
      trust_label: "seefood_photo",
      attribution_confidence: 1,
      tier: input.tier,
      is_orderable: true,
      width: input.width,
      height: input.height,
      gemini_label: input.dishName,
      menu_item_id: input.menuItemId ?? null,
      canonical_dish_id: input.dishName
        ? canonical.get(normalizeDishName(input.dishName)) ?? null
        : null,
      photo_quality_score: photoQualityScore,
      dish_popularity_score: 7,
      is_hero_candidate: !!input.dishName,
      is_storefront: false,
      is_menu_photo: false,
      contributor_id: input.contributorId ?? null,
      submitted_at: new Date().toISOString(),
      moderation_status: "approved",
      duplicate_hash: input.duplicateHash ?? null,
      abuse_flags: [],
      active: true,
      last_seen_at: new Date().toISOString(),
      missing_streak: 0,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[corpus] saveUserUploadedPhoto failed:", error?.message);
    return null;
  }
  await refreshRestaurantPhotoSignals(input.placeId);
  return {
    id: `corpus-${data.id}`,
    url: input.originUrl,
    dishName: input.dishName,
    dishDescription: input.dishDescription,
    menuItemId: input.menuItemId,
    isMenuMatch: input.isMenuMatch,
    source: "user_suggested",
    attribution: "user",
    tier: input.tier,
    width: input.width,
    height: input.height,
    loveCount: 0,
    primaryVotes: 0,
    sourcePlatform: "user_suggested",
    photoAuthorType: "customer",
    trustLabel: "seefood_photo",
    photoQualityScore,
    dishPopularityScore: 7,
    isHeroCandidate: !!input.dishName,
    isStorefront: false,
    isMenuPhoto: false,
    comparisonReady: false,
    contributorId: input.contributorId ?? null,
    submittedAt: new Date().toISOString(),
    moderationStatus: "approved",
    duplicateHash: input.duplicateHash ?? null,
    abuseFlags: [],
  };
}

async function syncBrandTemplate(placeId: string, items: MenuItemData[]): Promise<void> {
  if (items.length === 0) return;
  const entityId = await getEntityId(placeId);
  if (!entityId) return;
  const { data: membership } = await supabase
    .from("restaurant_brand_memberships")
    .select("brand_id")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!membership?.brand_id) return;
  await supabase.from("brand_menu_templates").upsert(items.map((item) => ({
    brand_id: membership.brand_id,
    name: item.name,
    normalized_name: normalizeDishName(item.name),
    description: item.description ?? null,
    source: item.source ?? "unknown",
    active: true,
    updated_at: new Date().toISOString(),
  })), { onConflict: "brand_id,normalized_name" });
}

export async function getInheritedMenuItems(placeId: string): Promise<MenuItemData[]> {
  const entityId = await getEntityId(placeId);
  if (!entityId) return [];
  const { data: membership } = await supabase
    .from("restaurant_brand_memberships")
    .select("brand_id")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (!membership?.brand_id) return [];
  const [{ data: templates }, { data: overrides }] = await Promise.all([
    supabase.from("brand_menu_templates").select("id,name,description").eq("brand_id", membership.brand_id).eq("active", true),
    supabase.from("location_menu_overrides").select("template_item_id,available,name,description").eq("entity_id", entityId),
  ]);
  const byTemplate = new Map((overrides ?? []).map((row) => [row.template_item_id, row]));
  return (templates ?? []).flatMap((template) => {
    const override = byTemplate.get(template.id);
    if (override?.available === false) return [];
    return [{
      name: override?.name ?? template.name,
      description: override?.description ?? template.description ?? undefined,
      source: "merchant" as const,
    }];
  });
}

async function reconcileSourceBatch(
  placeId: string,
  source: string,
  items: MenuItemData[],
  photos: DishPhoto[],
  options:{partial?:boolean}={}
): Promise<string | null> {
  if (!(await isSourceEnabled(source))) return null;
  const snapshot = await beginSourceSnapshot(placeId, source);
  if (!snapshot) return null;
  try {
    const sourceItems = items.map((item) => ({ ...item, source: (item.source ?? source) as MenuItemData["source"] }));
    const evidenceHash = createHash("sha256").update(JSON.stringify({
      items: sourceItems.map((item) => ({
        name: normalizeDishName(item.name),
        description: item.description ?? null,
        imageUrl: item.imageUrl ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name)),
      photos: photos.map((photo) => ({
        originUrl: photo.url,
        contentHash: photo.contentHash ?? null,
        dishName: photo.dishName ?? null,
      })).sort((a, b) => a.originUrl.localeCompare(b.originUrl)),
    })).digest("hex");
    const nameToId = await saveMenuItems(placeId, sourceItems, { snapshotId: snapshot.id });
    await syncBrandTemplate(placeId, sourceItems);
    await savePhotos(placeId, photos.map((p) => ({
      originUrl: p.url,
      source: p.source,
      attribution: p.attribution,
      isOrderable: true,
      tier: p.tier,
      width: p.width,
      height: p.height,
      geminiLabel: p.dishName,
      // Photo-only backfills may already have a verified current-menu target.
      // Preserve it rather than requiring this partial snapshot to recreate
      // the menu row just to attach the photo.
      menuItemId: p.menuItemId ?? (p.dishName ? nameToId.get(p.dishName) : undefined),
      photoQualityScore: p.photoQualityScore,
      dishPopularityScore: p.dishPopularityScore,
      isHeroCandidate: p.isHeroCandidate,
      isStorefront: p.isStorefront,
      isMenuPhoto: p.isMenuPhoto,
      contentHash: p.contentHash,
      perceptualHash: p.perceptualHash,
    })), { snapshotId: snapshot.id });

    if(!options.partial){
      if (sourceItems.length > 0) {
        await retireMissingSourceRows("menu_items", placeId, source, sourceItems.map((item) => normalizeDishName(item.name)), "source_key");
      } else {
        await retireMissingSourceRows("menu_items", placeId, source, [], "source_key");
      }
      await retireMissingPhotos(placeId, source, photos);
    }
    await finishSourceSnapshot({
      snapshotId: snapshot.id,
      entityId: snapshot.entityId,
      placeId,
      source,
      itemCount: sourceItems.length,
      photoCount: photos.length,
      ok: true,
      evidenceHash,
      metadata: {
        normalizedItemCount: sourceItems.length,
        normalizedPhotoCount: photos.length,
        byteVerifiedPhotoCount: photos.filter((photo) => photo.contentHash).length,
      },
    });
    return snapshot.id;
  } catch (error) {
    await finishSourceSnapshot({
      snapshotId: snapshot.id,
      entityId: snapshot.entityId,
      placeId,
      source,
      itemCount: items.length,
      photoCount: photos.length,
      ok: false,
      error: String(error),
      failureStage: "persistence",
    });
    throw error;
  }
}

export async function persistSourceMenuItems(
  placeId: string,
  source: DataSource,
  items: MenuItemData[]
): Promise<string | null> {
  const photos: DishPhoto[] = items.filter((item) => item.imageUrl).map((item, index) => ({
    id: `${source}-${placeId}-${index}`,
    url: item.imageUrl!,
    dishName: item.name,
    dishDescription: item.description ?? null,
    isMenuMatch: true,
    source,
    attribution: "owner",
    tier: 1,
    width: 800,
    height: 600,
    loveCount: 0,
    primaryVotes: 0,
    photoAuthorType: "management",
    trustLabel: "management_photo",
    contentHash: item.contentHash,
    perceptualHash: item.perceptualHash,
  }));
  return reconcileSourceBatch(placeId, source, items, photos);
}

/** Add a scoped photo-only evidence batch without implying that omitted menu
 * or photo rows disappeared from the source. Used by corpus gallery backfills. */
export async function persistSourcePhotos(
  placeId:string,
  source:DataSource,
  photos:DishPhoto[],
):Promise<string|null>{
  return reconcileSourceBatch(placeId,source,[],photos,{partial:true});
}

/**
 * Provider-neutral merchant import core. OAuth/callback routes remain provider
 * specific, but every authorized payload enters the corpus through the same
 * snapshot, provenance, dedupe, and menu/photo reconciliation path.
 */
export async function importMerchantProviderPayload(input: {
  connectionId: string;
  placeId: string;
  provider: MerchantProvider;
  payload: unknown;
}): Promise<{ itemCount: number; photoCount: number; snapshotId: string | null }> {
  const items = normalizeMerchantItems(input.provider, input.payload);
  const source = input.provider === "google_business" ? "merchant" : input.provider;
  const { data: run, error: runError } = await supabase
    .from("merchant_import_runs")
    .insert({ connection_id: input.connectionId, status: "running" })
    .select("id")
    .single();
  if (runError || !run) throw runError ?? new Error("merchant import run could not start");

  const photos: DishPhoto[] = items.flatMap((item, index) => item.imageUrl ? [{
    id: `${source}-${input.placeId}-${index}`,
    url: item.imageUrl,
    dishName: item.name,
    dishDescription: item.description ?? null,
    isMenuMatch: true,
    source,
    attribution: "owner" as const,
    tier: 1 as const,
    width: 800,
    height: 600,
    loveCount: 0,
    primaryVotes: 0,
    photoAuthorType: "management" as const,
    trustLabel: "management_photo" as const,
  }] : []);

  try {
    const snapshotId = await reconcileSourceBatch(input.placeId, source, items, photos);
    await supabase.from("merchant_import_runs").update({
      status: "succeeded",
      item_count: items.length,
      photo_count: photos.length,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { itemCount: items.length, photoCount: photos.length, snapshotId };
  } catch (error) {
    await supabase.from("merchant_import_runs").update({
      status: "failed",
      item_count: items.length,
      photo_count: photos.length,
      error: String(error),
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

/**
 * Persist a full pipeline result (restaurant + menu items + photos) to the
 * corpus. Shared by the live /api/dishes path and the Tier 1 crawler CLI, so
 * both write the corpus identically.
 */
export async function persistPipelineResult(input: {
  placeId: string;
  restaurantName: string;
  lat: number;
  lng: number;
  address: string;
  photos: DishPhoto[];
  menuItems: MenuItemData[];
}): Promise<void> {
  const { placeId, restaurantName, lat, lng, address, photos, menuItems } = input;

  await upsertRestaurant({
    id: placeId,
    placeId,
    name: restaurantName || placeId,
    lat,
    lng,
    address,
  });

  // Revisit live-pipeline sources that previously contributed active rows so
  // a later omission counts as a miss. Avoid creating blank snapshots for
  // every possible adapter on every restaurant.
  const livePipelineSources = new Set([
    "google", "website", "schema_org", "menufy", "toast", "square",
    "clover", "chownow", "olo", "popmenu", "menu_ocr", "unknown",
  ]);
  const [{ data: priorMenuSources }, { data: priorPhotoSources }] = await Promise.all([
    supabase.from("menu_items").select("source").eq("restaurant_id", placeId).eq("active", true),
    supabase.from("photos").select("source").eq("restaurant_id", placeId).eq("active", true),
  ]);
  const previouslyObserved = [...(priorMenuSources ?? []), ...(priorPhotoSources ?? [])]
    .map((row) => row.source)
    .filter((source): source is string => livePipelineSources.has(source));
  const sources = new Set<string>([
    "google",
    ...previouslyObserved,
    ...menuItems.map((item) => item.source ?? "unknown"),
    ...photos.map((photo) => photo.source),
  ]);
  for (const source of sources) {
    if (source === "user_upload" || source === "user_suggested") continue;
    await reconcileSourceBatch(
      placeId,
      source,
      menuItems.filter((item) => (item.source ?? "unknown") === source),
      photos.filter((photo) => photo.source === source)
    );
  }
}

// ── DoorDash store URL cache ─────────────────────────────────────────────────
// Google Custom Search JSON API is permanently closed to new customers
// (confirmed July 2026 — hard 403 even with a clean project + enabled API).
// Discovery now happens via sitemap and/or Camoufox-driven interactive search
// in the Tier 1 crawler (scripts/crawl.ts). This cache still applies regardless
// of which discovery method finds the URL — never search the same place twice.
export async function getDoorDashStoreUrl(placeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("restaurants")
    .select("doordash_store_url")
    .eq("place_id", placeId)
    .maybeSingle();
  return data?.doordash_store_url ?? null;
}

export async function saveDoorDashStoreUrl(placeId: string, url: string | null): Promise<void> {
  await supabase.from("restaurants").update({ doordash_store_url: url }).eq("place_id", placeId);
}

export async function getDoorDashReplayTargets(limit = 250): Promise<SaturationTarget[]> {
  const { data: runs, error: runsError } = await supabase
    .from("source_runs")
    .select("restaurant_id")
    .eq("source", "doordash")
    .eq("ok", true)
    .limit(5000);
  if (runsError) throw runsError;
  const successfulIds = [...new Set((runs ?? []).map((row) => row.restaurant_id))].slice(0, limit);
  if (successfulIds.length === 0) return [];
  const { data, error } = await supabase
    .from("restaurants")
    .select("place_id,name,lat,lng,address")
    .in("place_id", successfulIds)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .neq("status", "test_fixture")
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({ placeId: row.place_id, name: row.name, lat: row.lat, lng: row.lng, address: row.address ?? "" }));
}

export async function logSourceRun(run: {
  placeId: string;
  source: string;
  ok: boolean;
  itemCount: number;
  photoCount: number;
  latencyMs: number;
  error?: string;
  sourceSnapshotId?: string | null;
  providerUrl?: string | null;
  responseHash?: string | null;
  failureStage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("source_runs").insert({
    restaurant_id: run.placeId,
    source: run.source,
    ok: run.ok,
    item_count: run.itemCount,
    photo_count: run.photoCount,
    latency_ms: run.latencyMs,
    error: run.error ?? null,
    source_snapshot_id: run.sourceSnapshotId ?? null,
    provider_url: run.providerUrl ?? null,
    response_hash: run.responseHash ?? null,
    failure_stage: run.failureStage ?? null,
    metadata: run.metadata ?? {},
  });
  if (error) console.error("[corpus] logSourceRun failed:", error.message);
}
