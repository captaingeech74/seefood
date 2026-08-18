import { describe, expect, it } from "vitest";
import {
  onsiteRestaurantRadiusKm,
  recoveryMapZoom,
  resolveNearbyCandidates,
  shouldClusterRestaurantPins,
} from "../restaurantPolicy";

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

  it("zooms closer for genuinely dense restaurant groups", () => {
    const dense = [
      { lat: 33.5273, lng: -117.1147 },
      { lat: 33.5276, lng: -117.1147 },
      { lat: 33.5273, lng: -117.11435 },
      { lat: 33.5276, lng: -117.11435 },
    ];
    const spreadOut = [
      { lat: 33.5273, lng: -117.1147 },
      { lat: 33.5323, lng: -117.1147 },
      { lat: 33.5273, lng: -117.1087 },
      { lat: 33.5323, lng: -117.1087 },
    ];

    expect(recoveryMapZoom(15, 33.5273, dense)).toBeGreaterThan(
      recoveryMapZoom(15, 33.5273, spreadOut)
    );
  });

  it("does not chase impossible same-coordinate collisions or exceed its cap", () => {
    const sameParcel = [
      { lat: 33.5273, lng: -117.1147 },
      { lat: 33.5273, lng: -117.1147 },
    ];
    const extremelyDense = [
      { lat: 33.5273, lng: -117.1147 },
      { lat: 33.52739, lng: -117.1147 },
    ];

    expect(recoveryMapZoom(15, 33.5273, sameParcel)).toBe(15);
    expect(recoveryMapZoom(15, 33.5273, extremelyDense)).toBe(18);
  });

  it("never zooms back out from a user-selected view", () => {
    expect(recoveryMapZoom(17, 33.5273, [
      { lat: 33.52, lng: -117.11 },
      { lat: 33.54, lng: -117.09 },
    ])).toBe(17);
  });

  it("automatically chooses a restaurant that is clearly closer", () => {
    expect(resolveNearbyCandidates([
      { value: "nearest", distanceKm: 0.012 },
      { value: "runner-up", distanceKm: 0.09 },
    ], 30)).toEqual({ kind: "match", value: "nearest" });
  });

  it("returns plausible named choices when GPS cannot distinguish venues", () => {
    expect(resolveNearbyCandidates([
      { value: "food-hall-a", distanceKm: 0.018 },
      { value: "food-hall-b", distanceKm: 0.021 },
      { value: "across-town", distanceKm: 0.3 },
    ], 65)).toEqual({
      kind: "ambiguous",
      values: ["food-hall-a", "food-hall-b"],
    });
  });

  it("treats identical coordinates as ambiguous without resort metadata", () => {
    expect(resolveNearbyCandidates([
      { value: "mall-a", distanceKm: 0.025 },
      { value: "mall-b", distanceKm: 0.025 },
    ], 10)).toEqual({ kind: "ambiguous", values: ["mall-a", "mall-b"] });
  });
});
