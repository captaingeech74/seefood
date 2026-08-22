/**
 * On-site GPS is not a survey point: browsers can drift indoors and provider
 * coordinates may represent a parcel or venue centroid rather than the front
 * door. Keep the match bounded to the immediate venue area while allowing a
 * real diner to resolve despite those two ordinary errors.
 */
export function onsiteRestaurantRadiusKm(reportedAccuracyMeters?: number): number {
  if (reportedAccuracyMeters === undefined || !Number.isFinite(reportedAccuracyMeters)) return 0.35;
  return Math.max(0.25, Math.min(0.5, (reportedAccuracyMeters + 180) / 1000));
}

/**
 * Keep clustering as a low-zoom overview aid, not a permanent obstacle.
 * At neighborhood/street zoom individual restaurants win, while MapLibre's
 * label collision engine handles the remaining visual density.
 */
export function shouldClusterRestaurantPins(
  restaurantCount: number,
  zoom = 14
): boolean {
  return restaurantCount > 120 && zoom < 15;
}

export interface NearbyCandidate<T> {
  value: T;
  distanceKm: number;
}

export type NearbyResolution<T> =
  | { kind: "none" }
  | { kind: "match"; value: T }
  | { kind: "ambiguous"; values: T[] };

/**
 * Resolve an on-site GPS fix without making venue-type assumptions. Phone GPS
 * accuracy is a radius, not an exact point, so a nearest restaurant only wins
 * when it is both materially and proportionally closer than the runner-up.
 * Otherwise we return the small set of restaurants the user could plausibly
 * be standing in. Resorts, malls, airports, food halls, and ordinary street
 * clusters all follow this same rule.
 */
export function resolveNearbyCandidates<T>(
  candidates: NearbyCandidate<T>[],
  reportedAccuracyMeters?: number,
  maxChoices = 8
): NearbyResolution<T> {
  const ranked = [...candidates]
    .filter(({ distanceKm }) => Number.isFinite(distanceKm) && distanceKm >= 0)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (ranked.length === 0) return { kind: "none" };
  if (ranked.length === 1) return { kind: "match", value: ranked[0].value };

  const accuracyMeters = Number.isFinite(reportedAccuracyMeters)
    ? Math.max(20, Math.min(200, reportedAccuracyMeters as number))
    : 75;
  const nearestMeters = ranked[0].distanceKm * 1000;
  const runnerUpMeters = ranked[1].distanceKm * 1000;
  const gapMeters = runnerUpMeters - nearestMeters;
  const requiredGapMeters = Math.max(30, accuracyMeters * 0.6);
  const distanceRatio = runnerUpMeters / Math.max(15, nearestMeters);

  if (gapMeters >= requiredGapMeters && distanceRatio >= 1.8) {
    return { kind: "match", value: ranked[0].value };
  }

  const plausibleGapMeters = Math.max(40, Math.min(150, accuracyMeters * 0.85));
  const plausible = ranked
    .filter(({ distanceKm }) => distanceKm * 1000 <= nearestMeters + plausibleGapMeters)
    .slice(0, Math.max(2, maxChoices))
    .map(({ value }) => value);

  return plausible.length > 1
    ? { kind: "ambiguous", values: plausible }
    : { kind: "match", value: ranked[0].value };
}

export interface MapCoordinate {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const MIN_SEPARABLE_DISTANCE_METERS = 8;
const TARGET_LABEL_SPACING_PX = 140;

function distanceMeters(a: MapCoordinate, b: MapCoordinate): number {
  const toRadians = Math.PI / 180;
  const lat1 = a.lat * toRadians;
  const lat2 = b.lat * toRadians;
  const dLat = (b.lat - a.lat) * toRadians;
  const dLng = (b.lng - a.lng) * toRadians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Picks a recovery-map zoom from actual restaurant spacing. The lower
 * quartile of nearest-neighbour distances represents the dense part of the
 * visible group without letting one duplicate coordinate control the whole
 * camera. Eight-metre-and-closer points are treated as the same venue/parcel:
 * no useful zoom level can separate them, so the marker UI must handle those.
 */
export function recoveryMapZoom(
  currentZoom: number,
  centerLatitude: number,
  restaurants: MapCoordinate[],
  maxZoom = 18
): number {
  const valid = restaurants.filter(({ lat, lng }) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
  if (valid.length < 2) return Math.min(maxZoom, currentZoom);

  const nearestDistances = valid.flatMap((restaurant, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let otherIndex = 0; otherIndex < valid.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const distance = distanceMeters(restaurant, valid[otherIndex]);
      if (distance >= MIN_SEPARABLE_DISTANCE_METERS && distance < nearest) nearest = distance;
    }
    return Number.isFinite(nearest) ? [nearest] : [];
  }).sort((a, b) => a - b);

  if (nearestDistances.length === 0) return Math.min(maxZoom, currentZoom);
  const denseSpacing = nearestDistances[Math.floor((nearestDistances.length - 1) * 0.25)];
  const latitude = Math.max(-85, Math.min(85, centerLatitude));
  const metersPerPixelAtZoomZero = 156543.03392 * Math.cos(latitude * Math.PI / 180);
  const desiredZoom = Math.log2(
    (metersPerPixelAtZoomZero * TARGET_LABEL_SPACING_PX) / denseSpacing
  );
  const halfStepZoom = Math.ceil(desiredZoom * 2) / 2;
  return Math.max(currentZoom, Math.min(maxZoom, halfStepZoom));
}
