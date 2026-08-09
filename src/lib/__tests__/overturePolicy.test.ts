import { describe, expect, it } from "vitest";
import { isOvertureFoodServicePlace } from "../overturePolicy";

describe("Overture food-service classification", () => {
  it("accepts the ordinary restaurant hierarchy", () => {
    expect(isOvertureFoodServicePlace({
      taxonomy: { hierarchy: ["food_and_drink", "restaurant", "american_restaurant"] },
    })).toBe(true);
  });

  it("accepts a full-service pub even when Overture places it under bars", () => {
    expect(isOvertureFoodServicePlace({
      categories: { primary: "irish_pub", alternate: ["american_restaurant", "pub"] },
      taxonomy: { hierarchy: ["food_and_drink", "alcoholic_beverage_venue", "bar", "pub", "irish_pub"] },
    })).toBe(true);
  });

  it("does not turn an unrelated nightlife or retail place into a restaurant", () => {
    expect(isOvertureFoodServicePlace({
      categories: { primary: "night_club", alternate: ["event_venue"] },
      taxonomy: { hierarchy: ["attractions_and_activities", "nightlife"] },
    })).toBe(false);
  });
});
