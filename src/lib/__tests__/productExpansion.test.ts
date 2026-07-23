import { describe, expect, it } from "vitest";
import { sampleHookups, samplePromotions } from "../demoHookups";
import { MAJOR_METROS } from "../geography";

describe("major metro analytics", () => {
  it("offers exactly 50 unique metro choices with usable footprints", () => {
    expect(MAJOR_METROS).toHaveLength(50);
    expect(new Set(MAJOR_METROS.map((metro) => metro.name)).size).toBe(50);
    expect(MAJOR_METROS.every((metro) => Number.isFinite(metro.lat) && Number.isFinite(metro.lng) && metro.radiusKm > 0)).toBe(true);
  });
});

describe("Hookup product sample", () => {
  it("links the member coupon to its management promotion", () => {
    const promotion = samplePromotions()[0];
    const hookup = sampleHookups()[0];
    expect(hookup.promotionId).toBe(promotion.id);
    expect(hookup.forFriends).toBe(true);
    expect(hookup.demo).toBe(true);
    expect(hookup.code).toContain(hookup.id);
  });
});
