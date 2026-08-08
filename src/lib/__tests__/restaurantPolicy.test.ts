import { describe, expect, it } from "vitest";
import { onsiteRestaurantRadiusKm, shouldClusterRestaurantPins } from "../restaurantPolicy";

describe("restaurant publication and location policy", () => {
  it("uses a tight default on-site radius and bounds GPS drift", () => {
    expect(onsiteRestaurantRadiusKm()).toBe(0.2);
    expect(onsiteRestaurantRadiusKm(5)).toBe(0.12);
    expect(onsiteRestaurantRadiusKm(80)).toBe(0.16);
    expect(onsiteRestaurantRadiusKm(1000)).toBe(0.35);
  });

  it("shows every individual restaurant until pins become unwieldy", () => {
    expect(shouldClusterRestaurantPins(120)).toBe(false);
    expect(shouldClusterRestaurantPins(121)).toBe(true);
  });
});
