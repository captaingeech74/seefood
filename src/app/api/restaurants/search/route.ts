import { NextRequest, NextResponse } from "next/server";
import { getStoredRestaurantsInBounds, searchStoredRestaurants } from "@/lib/db";

function parseBounds(value: string | null) {
  if (!value) return null;
  const [west, south, east, north, ...extra] = value.split(",").map(Number);
  if (
    extra.length > 0 ||
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 || east > 180 || south < -90 || north > 90 ||
    west >= east || south >= north ||
    east - west > 5 || north - south > 5
  ) return null;
  return { west, south, east, north };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const latValue = searchParams.get("lat");
  const lngValue = searchParams.get("lng");
  const lat = latValue === null ? Number.NaN : Number(latValue);
  const lng = lngValue === null ? Number.NaN : Number(lngValue);
  const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  const rawBounds = searchParams.get("bbox");
  const bounds = parseBounds(rawBounds);

  if (rawBounds && !bounds) {
    return NextResponse.json({ error: "Invalid map bounds" }, { status: 400 });
  }

  try {
    const restaurants = bounds
      ? await getStoredRestaurantsInBounds(bounds)
      : await searchStoredRestaurants(query, center);
    return NextResponse.json(
      { restaurants },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (error) {
    console.error("[restaurants/search] corpus lookup failed", error);
    return NextResponse.json({ error: "Restaurant search is temporarily unavailable" }, { status: 500 });
  }
}
