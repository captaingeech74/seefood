import { NextRequest, NextResponse } from "next/server";
import { getCoverageReadinessMetrics } from "@/lib/db";
import {
  CoverageScope,
  MAJOR_METROS,
  STATE_BOUNDS,
  STATE_NAMES,
  TEMECULA_GEOGRAPHY,
} from "@/lib/geography";

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

async function lookupZip(zip: string): Promise<GeocodedScope | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    next: { revalidate: 86400 * 30 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const result = await response.json();
  const place = result.places?.[0];
  if (!place) return null;
  return {
    label: `${place["place name"]}, ${place["state abbreviation"]} ${zip}`,
    lat: Number(place.latitude),
    lng: Number(place.longitude),
  };
}

const ZERO_METRICS = {
  identifiedRestaurants: 0,
  menuCoverage: 0,
  basicPhotoCoverage: 0,
  basicMenuPhotoCoverage: 0,
  twentyPercentMenuPhotoCoverage: 0,
  fiftyPercentMenuPhotoCoverage: 0,
  comparisonCoverage: 0,
  visits: 0,
  visitors: 0,
  newVisitors: 0,
  uploadSessions: 0,
  loves: 0,
};

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
    let found: GeocodedScope | null = null;
    if (scope === "metro") {
      const metro = MAJOR_METROS.find((item) => item.name === query);
      if (!metro) return NextResponse.json({ error: "Choose one of the 50 largest metro areas." }, { status: 400 });
      locationLabel = `${metro.name} Metro Area`;
      Object.assign(params, { lat: metro.lat, lng: metro.lng, radiusKm: metro.radiusKm });
    } else if (scope === "state") {
      if (!(STATE_NAMES as readonly string[]).includes(query)) {
        return NextResponse.json({ error: "Choose a US state." }, { status: 400 });
      }
      locationLabel = query;
      const bounds = STATE_BOUNDS[query as keyof typeof STATE_BOUNDS];
      if (bounds) Object.assign(params, bounds);
      else {
        found = await geocodeScope(query, scope);
        if (found?.bounds) Object.assign(params, found.bounds);
      }
    } else {
      found = await lookupZip(query) ?? await geocodeScope(query, scope);
      locationLabel = found?.label ?? `ZIP ${query}`;
      if (found) Object.assign(params, { lat: found.lat, lng: found.lng, radiusKm: 8 });
    }
    if (!found && scope !== "metro" && !(scope === "state" && STATE_BOUNDS[query as keyof typeof STATE_BOUNDS])) {
      return NextResponse.json({ ...ZERO_METRICS, locationLabel, period }, { headers: { "Cache-Control": "no-store" } });
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
