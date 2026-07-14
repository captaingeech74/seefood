/**
 * Corpus persistence (PRD §5.1). Supabase Postgres holds all menu/photo
 * *metadata* — image bytes live in R2 (see storage.ts). This is the permanent
 * store the 24h in-memory cache used to be a throwaway substitute for.
 */
import { createClient } from "@supabase/supabase-js";
import { DishPhoto, MenuItemData, Restaurant } from "./types";

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
}

interface MenuItemRow {
  id: number;
  name: string;
  description: string | null;
}

/** Corpus-first read: null if the restaurant has never been seen before. */
export async function getCorpusSnapshot(placeId: string): Promise<CorpusSnapshot | null> {
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("updated_at")
    .eq("place_id", placeId)
    .maybeSingle();
  if (!restaurant) return null;

  const [{ data: photoRows }, { data: menuItemRows }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .eq("restaurant_id", placeId)
      .order("tier", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("menu_items").select("id,name,description").eq("restaurant_id", placeId),
  ]);
  if (!photoRows || photoRows.length === 0) return null;

  const menuItemsById = new Map<number, MenuItemRow>(
    (menuItemRows ?? []).map((m: MenuItemRow) => [m.id, m])
  );

  const photos: DishPhoto[] = (photoRows as PhotoRow[]).map((p) => {
    const menuItem = p.menu_item_id ? menuItemsById.get(p.menu_item_id) : undefined;
    return {
      id: `corpus-${p.id}`,
      url: p.storage_url ?? p.origin_url ?? "",
      dishName: menuItem?.name ?? p.gemini_label ?? null,
      dishDescription: menuItem?.description ?? null,
      isMenuMatch: !!menuItem,
      source: p.source as DishPhoto["source"],
      attribution: p.attribution as DishPhoto["attribution"],
      tier: (p.tier ?? (menuItem ? 1 : p.gemini_label ? 2 : 3)) as 1 | 2 | 3,
      width: p.width ?? 800,
      height: p.height ?? 600,
      loveCount: p.love_count ?? 0,
    };
  });

  const ageMs = Date.now() - new Date(restaurant.updated_at).getTime();
  const isFresh = ageMs < CORPUS_FRESH_HOURS * 60 * 60 * 1000;

  return { photos, popularDishes: [], isFresh };
}

export interface MapDishPreview {
  topPhoto: DishPhoto;
  dishes: DishPhoto[]; // top ~5, tier-ordered, for the bottom-sheet strip
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
    const photo: DishPhoto = {
      id: `corpus-${p.id}`,
      url: p.storage_url ?? p.origin_url ?? "",
      dishName: menuItem?.name ?? p.gemini_label ?? null,
      dishDescription: menuItem?.description ?? null,
      isMenuMatch: !!menuItem,
      source: p.source as DishPhoto["source"],
      attribution: p.attribution as DishPhoto["attribution"],
      tier: (p.tier ?? (menuItem ? 1 : p.gemini_label ? 2 : 3)) as 1 | 2 | 3,
      width: p.width ?? 800,
      height: p.height ?? 600,
      loveCount: p.love_count ?? 0,
    };
    const list = byRestaurant.get(p.restaurant_id) ?? [];
    list.push(photo);
    byRestaurant.set(p.restaurant_id, list);
  }

  for (const [placeId, photos] of byRestaurant) {
    if (photos.length === 0) continue;
    result.set(placeId, { topPhoto: photos[0], dishes: photos.slice(0, 5) });
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
  await supabase
    .from("restaurants")
    .upsert(
      {
        place_id: place.placeId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        status: "queued",
      },
      { onConflict: "place_id", ignoreDuplicates: true }
    );
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
    .select("slug")
    .eq("place_id", placeId)
    .maybeSingle();

  // Strip cache-busting suffixes like " [bench-2026-07-10]" that scripts/
  // benchmark.mjs appends to the `name` query param to force a fresh live
  // fetch — that param feeds straight into persisted name/slug generation
  // with no separation, so without this guard every benchmark run
  // permanently baked its run-tag into the restaurant's stored name.
  const cleanName = restaurant.name.replace(/\s*\[bench-[^\]]*\]\s*$/i, "").trim();

  const baseSlug = existing?.slug ?? slugifyRestaurant(cleanName, restaurant.address);
  const row = {
    place_id: placeId,
    name: cleanName,
    lat: restaurant.lat,
    lng: restaurant.lng,
    address: restaurant.address,
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

/** Persist menu items, returns a name→id map for linking photos to items. */
export async function saveMenuItems(
  placeId: string,
  items: MenuItemData[]
): Promise<Map<string, number>> {
  const nameToId = new Map<string, number>();
  if (items.length === 0) return nameToId;

  const rows = items.map((item) => ({
    restaurant_id: placeId,
    name: item.name,
    description: item.description ?? null,
    price_captured: item.price ?? null,
    source: item.source ?? "unknown",
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
  }>
): Promise<void> {
  if (photos.length === 0) return;
  const rows = photos.map((p) => ({
    restaurant_id: placeId,
    origin_url: p.originUrl,
    storage_url: p.storageUrl ?? null,
    source: p.source,
    attribution: p.attribution,
    is_orderable: p.isOrderable,
    tier: p.tier,
    width: p.width,
    height: p.height,
    gemini_label: p.geminiLabel ?? null,
    menu_item_id: p.menuItemId ?? null,
  }));
  // Upsert on (restaurant_id, origin_url), not insert: every repeat crawl/live
  // re-persist of an already-seen restaurant used to append a full duplicate
  // copy of every photo (see db/schema.sql migration note). The unique index
  // there makes this the only safe way to write.
  const { error } = await supabase
    .from("photos")
    .upsert(rows, { onConflict: "restaurant_id,origin_url" });
  if (error) console.error("[corpus] savePhotos failed:", error.message);
}

/**
 * "I Loved This" (experimental, no accounts — per-browser dedup only via
 * localStorage on the client). Only works for corpus-backed photos (id
 * formatted "corpus-{n}", a real photos.id): a photo from an in-flight
 * live-stream response that hasn't round-tripped through a page load yet
 * doesn't have a stable numeric id to attribute the love to, so those are
 * rejected rather than guessed at.
 */
export async function incrementLoveCount(photoId: string): Promise<number | null> {
  const match = /^corpus-(\d+)$/.exec(photoId);
  if (!match) return null;
  const id = parseInt(match[1], 10);

  const { data: current } = await supabase.from("photos").select("love_count").eq("id", id).maybeSingle();
  if (!current) return null;
  const next = (current.love_count ?? 0) + 1;

  const { error } = await supabase.from("photos").update({ love_count: next }).eq("id", id);
  if (error) { console.error("[corpus] incrementLoveCount failed:", error.message); return null; }
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
}): Promise<DishPhoto | null> {
  const { data, error } = await supabase
    .from("photos")
    .insert({
      restaurant_id: input.placeId,
      origin_url: input.originUrl,
      source: "user_upload",
      attribution: "user",
      tier: input.tier,
      is_orderable: true,
      width: input.width,
      height: input.height,
      gemini_label: input.dishName,
      menu_item_id: input.menuItemId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) { console.error("[corpus] saveUserUploadedPhoto failed:", error?.message); return null; }

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
  };
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

  const nameToId = await saveMenuItems(placeId, menuItems);

  // Google's photo_reference tokens aren't stable across separate Place
  // Details calls — repeat crawls/live re-persists of the same restaurant
  // return a fresh top-10 sample under NEW tokens, even for visually
  // identical photos. The origin_url-based upsert dedup can't catch this
  // (different URL each time), and the Gemini duplicate-detection pass only
  // compares photos *within* a single session's batch, never against what a
  // prior session already wrote — confirmed live: Uncle Bob's accumulated
  // the same burger-and-fries photo under 3 different tokens across 3
  // sessions (July 7, July 10 01:37, July 10 22:27), each internally clean
  // but never compared to the others. Since every live-pipeline run always
  // re-samples Google's photos wholesale (not incrementally), replacing
  // rather than accumulating is the correct semantic: clear old
  // Google-sourced rows before writing this run's fresh, already-deduped
  // batch. Pre-labeled sources (Menufy/DoorDash/schema.org) keep stable
  // per-item URLs across scrapes, so they're unaffected and still just
  // upsert normally.
  const { error: clearError } = await supabase
    .from("photos")
    .delete()
    .eq("restaurant_id", placeId)
    .eq("source", "google");
  if (clearError) console.error("[corpus] clearing stale google photos failed:", clearError.message);

  await savePhotos(
    placeId,
    photos.map((p) => ({
      originUrl: p.url,
      source: p.source,
      attribution: p.attribution,
      isOrderable: true, // non-food already filtered out upstream
      tier: p.tier,
      width: p.width,
      height: p.height,
      geminiLabel: p.dishName,
      menuItemId: p.dishName ? nameToId.get(p.dishName) : undefined,
    }))
  );
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
