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
