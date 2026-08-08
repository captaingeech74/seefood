export interface GeocoderResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type?: string;
}

interface PeliasFeature {
  properties?: {
    id?: string;
    label?: string;
    name?: string;
    layer?: string;
  };
  geometry?: { coordinates?: unknown };
}

export function normalizePeliasFeatures(features: PeliasFeature[]): GeocoderResult[] {
  return features.flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const label = feature.properties?.label ?? feature.properties?.name;
    if (!label) return [];
    return [{
      id: feature.properties?.id ?? `pelias-${index}-${lat}-${lng}`,
      label,
      lat,
      lng,
      type: feature.properties?.layer,
    }];
  });
}

export async function searchPelias(
  text: string,
  focus?: { lat: number; lng: number }
): Promise<{ available: boolean; results: GeocoderResult[] }> {
  const endpoint = process.env.PELIAS_URL?.replace(/\/$/, "");
  if (!endpoint) return { available: false, results: [] };

  const params = new URLSearchParams({ text, size: "5" });
  if (focus) {
    params.set("focus.point.lat", String(focus.lat));
    params.set("focus.point.lon", String(focus.lng));
  }
  if (process.env.PELIAS_API_KEY) params.set("api_key", process.env.PELIAS_API_KEY);

  const response = await fetch(`${endpoint}/v1/autocomplete?${params}`, {
    signal: AbortSignal.timeout(3500),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pelias returned ${response.status}`);
  const payload = await response.json() as { features?: PeliasFeature[] };
  return { available: true, results: normalizePeliasFeatures(payload.features ?? []) };
}
