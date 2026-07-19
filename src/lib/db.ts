/**
 * Corpus persistence (PRD §5.1). Supabase Postgres holds all menu/photo
 * *metadata* — image bytes live in R2 (see storage.ts). This is the permanent
 * store the 24h in-memory cache used to be a throwaway substitute for.
 */
import { createClient } from "@supabase/supabase-js";
import { DishPhoto, MenuItemData, Restaurant } from "./types";
import { dedupeToPrimary } from "./dishGrouping";
import type { AnalyticsEventName } from "./analytics";
import { normalizePhotoAuthor, trustLabel, withPhotoSignals } from "./photoSignals";

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

  const [{ data: photoRows }, { data: menuItemRows }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .eq("restaurant_id", placeId)
      .eq("active", true)
      .order("tier", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("menu_items").select("id,name,description").eq("restaurant_id", placeId).eq("active", true),
  ]);
  if (!photoRows || photoRows.length === 0) {
    return isTestFixture ? { photos: [], popularDishes: [], isFresh: true } : null;
  }

  const menuItemsById = new Map<number, MenuItemRow>(
    (menuItemRows ?? []).map((m: MenuItemRow) => [m.id, m])
  );

  const photos: DishPhoto[] = (photoRows as PhotoRow[]).map((p) => {
    const menuItem = p.menu_item_id ? menuItemsById.get(p.menu_item_id) : undefined;
    return rowToDishPhoto(p, menuItem);
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

export async function getCoverageMetrics(
  lat: number,
  lng: number,
  radiusKm = 15
): Promise<CoverageMetrics> {
  const restaurants: CoverageRestaurantRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("place_id,entity_id,lat,lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    restaurants.push(...((data ?? []) as CoverageRestaurantRow[]));
    if (!data || data.length < 1000) break;
  }

  const nearbyIds = restaurants
    .filter((r) => r.lat !== null && r.lng !== null && haversineKm(lat, lng, r.lat, r.lng) <= radiusKm)
    .map((r) => r.place_id);
  const nearbyEntityIds = restaurants
    .filter((r) => r.entity_id && r.lat !== null && r.lng !== null && haversineKm(lat, lng, r.lat, r.lng) <= radiusKm)
    .map((r) => r.entity_id!);

  if (nearbyIds.length === 0) {
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
  if (nearbyEntityIds.length > 0) {
    const { data: coverageRows } = await supabase
      .from("restaurant_coverage_levels")
      .select("coverage_level")
      .in("entity_id", nearbyEntityIds);
    for (const row of coverageRows ?? []) levelCounts.set(row.coverage_level, (levelCounts.get(row.coverage_level) ?? 0) + 1);
  }

  return {
    restaurantCount: nearbyIds.length,
    averageMenuItems: Math.round((totalMenuItems / nearbyIds.length) * 10) / 10,
    averagePhotos: Math.round((totalPhotos / nearbyIds.length) * 10) / 10,
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
    if (photos.length === 0) continue;
    const { primary } = dedupeToPrimary(photos);
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

/**
 * Track A (Vercel Cron, website/Google/Gemini saturation — see
 * /api/cron/saturate-temecula). Picks the next batch of restaurants that
 * need a live-pipeline pass: never-crawled ('queued', e.g. from Map
 * Explore's "viewport visits enqueue for crawling" or discover-temecula.mjs)
 * first, then stale 'active' ones. 'test_fixture' is excluded — that status
 * exists specifically so the permanent test restaurant is never swept up
 * here (see scripts/seed-test-restaurant.mjs).
 */
export async function getSaturationBatch(limit: number): Promise<SaturationTarget[]> {
  const staleCutoff = new Date(Date.now() - SATURATION_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: queued } = await supabase
    .from("restaurants")
    .select("place_id,name,lat,lng,address")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const targets: SaturationTarget[] = (queued ?? []).map((r) => ({
    placeId: r.place_id, name: r.name, lat: r.lat, lng: r.lng, address: r.address ?? "",
  }));
  if (targets.length >= limit) return targets;

  const { data: stale } = await supabase
    .from("restaurants")
    .select("place_id,name,lat,lng,address")
    .eq("status", "active")
    .lt("updated_at", staleCutoff)
    .order("updated_at", { ascending: true })
    .limit(limit - targets.length);

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
  if (!entityId) {
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
        legacy_place_id: placeId,
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
    await Promise.all([
      supabase.from("restaurant_entities").update({
        name: cleanName,
        normalized_name: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        address: restaurant.address,
        lat: restaurant.lat,
        lng: restaurant.lng,
        updated_at: new Date().toISOString(),
      }).eq("id", entityId),
      supabase.from("restaurant_identities").upsert({
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
      }, { onConflict: "provider,provider_id" }),
    ]);
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
  plan: "standard" | "growth";
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
    monthly_price: input.plan === "growth" ? 499 : 99,
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

async function finishSourceSnapshot(input: {
  snapshotId: string;
  entityId: string;
  placeId: string;
  source: string;
  itemCount: number;
  photoCount: number;
  ok: boolean;
  error?: string;
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
  const seen = new Set<string>();
  const deduped = photos.filter((p) => {
    if (seen.has(p.originUrl)) return false;
    seen.add(p.originUrl);
    return true;
  });

  const canonical = await ensureCanonicalDishes(
    placeId,
    deduped.filter((p) => p.geminiLabel).map((p) => ({ name: p.geminiLabel! }))
  );
  const now = new Date().toISOString();
  const rows = deduped.map((p) => {
    const source = p.source as DishPhoto["source"];
    const authorType = normalizePhotoAuthor(source, p.attribution as DishPhoto["attribution"]);
    return {
      restaurant_id: placeId,
      origin_url: p.originUrl,
      storage_url: p.storageUrl ?? null,
      source: p.source,
      attribution: p.attribution,
      source_platform: p.source,
      photo_author_type: authorType,
      trust_label: trustLabel(source, authorType),
      is_orderable: p.isOrderable,
      tier: p.tier,
      width: p.width,
      height: p.height,
      gemini_label: p.geminiLabel ?? null,
      menu_item_id: p.menuItemId ?? null,
      canonical_dish_id: p.geminiLabel ? canonical.get(normalizeDishName(p.geminiLabel)) ?? null : null,
      source_snapshot_id: options.snapshotId ?? null,
      active: true,
      last_seen_at: now,
      missing_streak: 0,
      photo_quality_score: p.photoQualityScore ?? 0,
      dish_popularity_score: p.dishPopularityScore ?? 0,
      is_hero_candidate: p.isHeroCandidate ?? false,
      is_storefront: p.isStorefront ?? false,
      is_menu_photo: p.isMenuPhoto ?? false,
    };
  });
  // Upsert on (restaurant_id, origin_url), not insert: every repeat crawl/live
  // re-persist of an already-seen restaurant used to append a full duplicate
  // copy of every photo (see db/schema.sql migration note). The unique index
  // there makes this the only safe way to write.
  const { error } = await supabase
    .from("photos")
    .upsert(rows, { onConflict: "restaurant_id,origin_url" });
  if (error) console.error("[corpus] savePhotos failed:", error.message);
  else await refreshRestaurantPhotoSignals(placeId);
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
    ? await ensureCanonicalDishes(input.placeId, [{ name: input.dishName, description: input.dishDescription }])
    : new Map<string, string>();
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
      menu_item_id: input.menuItemId ?? null,
      canonical_dish_id: input.dishName ? canonical.get(normalizeDishName(input.dishName)) ?? null : null,
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
  if (error || !data) { console.error("[corpus] saveUserUploadedPhoto failed:", error?.message); return null; }

  await refreshRestaurantPhotoSignals(input.placeId);

  return {
    id: `corpus-${data.id}`,
    url: input.originUrl,
    dishName: input.dishName,
    dishDescription: input.dishDescription,
    isMenuMatch: input.isMenuMatch,
    source: "user_upload",
    attribution: "user",
    tier: input.tier,
    width: input.width,
    height: input.height,
    loveCount: 0,
    primaryVotes: 0,
    sourcePlatform: "user_upload",
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
  photos: DishPhoto[]
): Promise<void> {
  if (!(await isSourceEnabled(source))) return;
  const snapshot = await beginSourceSnapshot(placeId, source);
  if (!snapshot) return;
  try {
    const sourceItems = items.map((item) => ({ ...item, source: (item.source ?? source) as MenuItemData["source"] }));
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
      menuItemId: p.dishName ? nameToId.get(p.dishName) : undefined,
      photoQualityScore: p.photoQualityScore,
      dishPopularityScore: p.dishPopularityScore,
      isHeroCandidate: p.isHeroCandidate,
      isStorefront: p.isStorefront,
      isMenuPhoto: p.isMenuPhoto,
    })), { snapshotId: snapshot.id });

    if (sourceItems.length > 0) {
      await retireMissingSourceRows("menu_items", placeId, source, sourceItems.map((item) => normalizeDishName(item.name)), "source_key");
    } else {
      await retireMissingSourceRows("menu_items", placeId, source, [], "source_key");
    }
    await retireMissingSourceRows("photos", placeId, source, photos.map((photo) => photo.url), "origin_url");
    await finishSourceSnapshot({
      snapshotId: snapshot.id,
      entityId: snapshot.entityId,
      placeId,
      source,
      itemCount: sourceItems.length,
      photoCount: photos.length,
      ok: true,
    });
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
    });
    throw error;
  }
}

export async function persistSourceMenuItems(
  placeId: string,
  source: "doordash" | "grubhub",
  items: MenuItemData[]
): Promise<void> {
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
  }));
  await reconcileSourceBatch(placeId, source, items, photos);
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

export async function saveDoorDashStoreUrl(placeId: string, url: string): Promise<void> {
  await supabase.from("restaurants").update({ doordash_store_url: url }).eq("place_id", placeId);
}

export async function logSourceRun(run: {
  placeId: string;
  source: string;
  ok: boolean;
  itemCount: number;
  photoCount: number;
  latencyMs: number;
  error?: string;
}): Promise<void> {
  const { error } = await supabase.from("source_runs").insert({
    restaurant_id: run.placeId,
    source: run.source,
    ok: run.ok,
    item_count: run.itemCount,
    photo_count: run.photoCount,
    latency_ms: run.latencyMs,
    error: run.error ?? null,
  });
  if (error) console.error("[corpus] logSourceRun failed:", error.message);
}
