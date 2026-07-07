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
    supabase.from("photos").select("*").eq("restaurant_id", placeId),
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
      width: p.width ?? 800,
      height: p.height ?? 600,
    };
  });

  const ageMs = Date.now() - new Date(restaurant.updated_at).getTime();
  const isFresh = ageMs < CORPUS_FRESH_HOURS * 60 * 60 * 1000;

  return { photos, popularDishes: [], isFresh };
}

export async function upsertRestaurant(restaurant: Restaurant): Promise<void> {
  await supabase.from("restaurants").upsert(
    {
      place_id: restaurant.placeId ?? restaurant.id,
      name: restaurant.name,
      lat: restaurant.lat,
      lng: restaurant.lng,
      address: restaurant.address,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "place_id" }
  );
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
    width: p.width,
    height: p.height,
    gemini_label: p.geminiLabel ?? null,
    menu_item_id: p.menuItemId ?? null,
  }));
  const { error } = await supabase.from("photos").insert(rows);
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
      width: p.width,
      height: p.height,
      geminiLabel: p.dishName,
      menuItemId: p.dishName ? nameToId.get(p.dishName) : undefined,
    }))
  );
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
