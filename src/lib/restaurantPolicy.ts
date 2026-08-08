/** Tight enough to avoid claiming a restaurant in another block, but tolerant
 * of ordinary phone GPS drift and restaurant-coordinate centroids. */
export function onsiteRestaurantRadiusKm(reportedAccuracyMeters?: number): number {
  if (reportedAccuracyMeters === undefined || !Number.isFinite(reportedAccuracyMeters)) return 0.2;
  return Math.max(0.12, Math.min(0.35, (reportedAccuracyMeters + 80) / 1000));
}

export function shouldClusterRestaurantPins(restaurantCount: number): boolean {
  return restaurantCount > 120;
}
