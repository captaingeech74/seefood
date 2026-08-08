import { NextRequest, NextResponse } from "next/server";
import { searchStoredRestaurants } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const latValue = searchParams.get("lat");
  const lngValue = searchParams.get("lng");
  const lat = latValue === null ? Number.NaN : Number(latValue);
  const lng = lngValue === null ? Number.NaN : Number(lngValue);
  const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  try {
    const restaurants = await searchStoredRestaurants(query, center);
    return NextResponse.json(
      { restaurants },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (error) {
    console.error("[restaurants/search] corpus lookup failed", error);
    return NextResponse.json({ error: "Restaurant search is temporarily unavailable" }, { status: 500 });
  }
}
