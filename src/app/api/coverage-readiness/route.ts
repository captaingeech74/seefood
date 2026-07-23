import { NextRequest, NextResponse } from "next/server";
import { getCoverageReadinessMetrics } from "@/lib/db";
import { CoverageScope, TEMECULA_GEOGRAPHY } from "@/lib/geography";

interface GeocodedScope {
  label: string;
  lat: number;
  lng: number;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

async function geocodeScope(query: string, scope: CoverageScope): Promise<GeocodedScope | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const address = scope === "metro" ? `${query} metropolitan area, USA` : scope === "state" ? `${query}, USA` : query;
  const params = new URLSearchParams({ address, key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: "no-store" });
  if (!response.ok) return null;
  const result = (await response.json()).results?.[0];
  const location = result?.geometry?.location;
  const viewport = result?.geometry?.bounds ?? result?.geometry?.viewport;
  if (!location) return null;
  return {
    label: result.formatted_address || query,
    lat: location.lat,
    lng: location.lng,
    bounds: viewport ? {
      minLat: viewport.southwest.lat,
      maxLat: viewport.northeast.lat,
      minLng: viewport.southwest.lng,
      maxLng: viewport.northeast.lng,
    } : undefined,
  };
}

export async function GET(request: NextRequest) {
  const scope = (request.nextUrl.searchParams.get("scope") || "temecula") as CoverageScope;
  const period = request.nextUrl.searchParams.get("period") === "month" ? "month" : "week";
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const since = new Date(Date.now() - (period === "month" ? 30 : 7) * 86400000).toISOString();
  const params: Parameters<typeof getCoverageReadinessMetrics>[0] = { since };
  let locationLabel = TEMECULA_GEOGRAPHY.label;

  if (scope === "temecula") {
    params.lat = TEMECULA_GEOGRAPHY.lat;
    params.lng = TEMECULA_GEOGRAPHY.lng;
    params.radiusKm = TEMECULA_GEOGRAPHY.radiusKm;
  } else if (scope !== "nationwide") {
    if (!query) return NextResponse.json({ error: `Enter a ${scope === "zip" ? "ZIP code" : scope}.` }, { status: 400 });
    const found = await geocodeScope(query, scope);
    if (!found) return NextResponse.json({ error: "We could not find that geography." }, { status: 404 });
    locationLabel = found.label;
    if (scope === "metro") {
      // Official MSA polygons are the long-term boundary source. Google's
      // returned metro viewport is a practical live approximation today.
      if (found.bounds) Object.assign(params, found.bounds);
      else Object.assign(params, { lat: found.lat, lng: found.lng, radiusKm: 60 });
    } else if (scope === "state") {
      if (!found.bounds) return NextResponse.json({ error: "State bounds were unavailable." }, { status: 502 });
      Object.assign(params, found.bounds);
    } else {
      Object.assign(params, { lat: found.lat, lng: found.lng, radiusKm: 8 });
    }
  } else {
    locationLabel = "United States";
  }

  const metrics = await getCoverageReadinessMetrics(params);
  return NextResponse.json(
    { ...metrics, locationLabel, period },
    { headers: { "Cache-Control": "no-store" } }
  );
}
