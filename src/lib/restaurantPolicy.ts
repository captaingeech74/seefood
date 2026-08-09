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

export function shouldClusterRestaurantPins(restaurantCount: number): boolean {
  return restaurantCount > 120;
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
