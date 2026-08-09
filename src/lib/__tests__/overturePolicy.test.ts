import { describe, expect, it } from "vitest";
import { formatOvertureAddress, isOvertureFoodServicePlace } from "../overturePolicy";

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

describe("Overture address formatting", () => {
  it("keeps the street, city, state, and postal code searchable", () => {
    expect(formatOvertureAddress({
      freeform: "821 W Riverside Ave",
      locality: "Spokane",
      region: "WA",
      postcode: "99201-0901",
    })).toBe("821 W Riverside Ave, Spokane, WA 99201-0901");
  });

  it("does not repeat a locality already present in a complete freeform address", () => {
    expect(formatOvertureAddress({
      freeform: "719 N Monroe St, Spokane",
      locality: "Spokane",
      region: "WA",
      postcode: "99201",
    })).toBe("719 N Monroe St, Spokane, WA 99201");
  });
});
