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
    };
  });

  const ageMs = Date.now() - new Date(restaurant.updated_at).getTime();
  const isFresh = ageMs < CORPUS_FRESH_HOURS * 60 * 60 * 1000;

  return { photos, popularDishes: [], isFresh };
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
