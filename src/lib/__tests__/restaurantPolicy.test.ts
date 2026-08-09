import { describe, expect, it } from "vitest";
import { onsiteRestaurantRadiusKm, shouldClusterRestaurantPins } from "../restaurantPolicy";

describe("restaurant publication and location policy", () => {
  it("uses a venue-tolerant on-site radius while keeping lookup local", () => {
    expect(onsiteRestaurantRadiusKm()).toBe(0.35);
    expect(onsiteRestaurantRadiusKm(5)).toBe(0.25);
    expect(onsiteRestaurantRadiusKm(80)).toBe(0.26);
    expect(onsiteRestaurantRadiusKm(200)).toBe(0.38);
    expect(onsiteRestaurantRadiusKm(1000)).toBe(0.5);
  });

  it("shows every individual restaurant until pins become unwieldy", () => {
    expect(shouldClusterRestaurantPins(120)).toBe(false);
    expect(shouldClusterRestaurantPins(121)).toBe(true);
  });
});
