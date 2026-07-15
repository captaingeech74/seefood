import { NextRequest, NextResponse } from "next/server";
import { getMapPhotosForPlaceIds, enqueueForCrawl, MapDishPreview } from "@/lib/db";

interface MapRestaurantInput {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

/**
 * PRD §4.4 — Map Explore v2 batch pin data. Corpus-only, no live pipeline
 * triggered (must stay <300ms per the viewport-prefetch performance bar).
 * Restaurants with no corpus photos get enqueued for the Tier 1 crawler
 * ("the map teaches the crawler where to go") and are simply absent from
 * the response — the client renders a dot pin for those.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurants: MapRestaurantInput[] = body?.restaurants ?? [];
  if (!Array.isArray(restaurants) || restaurants.length === 0) {
    return NextResponse.json({});
  }

  const placeIds = restaurants.map((r) => r.placeId);
  const previews = await getMapPhotosForPlaceIds(placeIds);

  // Enqueue uncrawled restaurants for the Tier 1 crawler — fire and forget,
  // must not block the pin response (viewport prefetch has a hard <300ms bar).
  const uncrawled = restaurants.filter((r) => !previews.has(r.placeId));
  Promise.all(uncrawled.map((r) => enqueueForCrawl(r).catch(() => {}))).catch(() => {});

  const out: Record<string, MapDishPreview> = {};
  for (const [placeId, preview] of previews) {
    out[placeId] = preview;
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
