import { NextRequest, NextResponse } from "next/server";
import { getCoverageMetrics } from "@/lib/db";

interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

async function geocode(query: string): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const params = new URLSearchParams({ address: query, key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: "no-store" });
  if (res.ok) {
    const data = await res.json();
    const first = data.results?.[0];
    const location = first?.geometry?.location;
    if (location) return { lat: location.lat, lng: location.lng, label: first.formatted_address || query };
  }

  // This project's Maps key already has Places enabled, while Geocoding may
  // be disabled. Find Place provides the same center point for a city/ZIP
  // without requiring another service or credential.
  const placesParams = new URLSearchParams({
    input: query,
    inputtype: "textquery",
    fields: "formatted_address,geometry,name",
    key,
  });
  const placesRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${placesParams}`,
    { cache: "no-store" }
  );
  if (!placesRes.ok) return null;
  const placesData = await placesRes.json();
  const candidate = placesData.candidates?.[0];
  const location = candidate?.geometry?.location;
  if (!location) return null;
  return {
    lat: location.lat,
    lng: location.lng,
    label: candidate.formatted_address || candidate.name || query,
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0]?.formatted_address ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  let lat = Number(searchParams.get("lat"));
  let lng = Number(searchParams.get("lng"));
  let locationLabel = "Current location";

  if (query) {
    const found = await geocode(query);
    if (!found) return NextResponse.json({ error: "We couldn't find that city or ZIP code." }, { status: 404 });
    lat = found.lat;
    lng = found.lng;
    locationLabel = found.label;
  } else if (Number.isFinite(lat) && Number.isFinite(lng)) {
    locationLabel = (await reverseGeocode(lat, lng)) ?? locationLabel;
  } else {
    return NextResponse.json({ error: "Provide a city, ZIP code, or location." }, { status: 400 });
  }

  const radiusKm = 15;
  const metrics = await getCoverageMetrics(lat, lng, radiusKm);
  return NextResponse.json(
    { ...metrics, lat, lng, radiusKm, locationLabel },
    { headers: { "Cache-Control": "no-store" } }
  );
}
