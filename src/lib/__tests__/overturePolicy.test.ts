import { describe, expect, it } from "vitest";
import { formatOvertureAddress, isOvertureFoodServicePlace, normalizeOverturePlaceName, overtureFoodServiceCategories } from "../overturePolicy";

describe("Overture food-service classification", () => {
  it("retains September/October taxonomy-only classifications", () => {
    const p={taxonomy:{primary:"american_restaurant",hierarchy:["food_and_drink","restaurant","american_restaurant"]}};
    expect(overtureFoodServiceCategories(p)).toEqual(["american_restaurant"]);
    expect(isOvertureFoodServicePlace(p)).toBe(true);
    expect(isOvertureFoodServicePlace({taxonomy:{primary:"coffee_shop",hierarchy:["food_and_drink","cafe","coffee_shop"]}})).toBe(true);
  });
  it("normalizes new specialized restaurant categories without admitting unrelated alternates", () => {
    expect(overtureFoodServiceCategories({taxonomy:{primary:"casual_eatery",hierarchy:["food_and_drink","restaurant","casual_eatery"]}})).toEqual(["restaurant","casual_eatery"]);
    expect(isOvertureFoodServicePlace({taxonomy:{primary:"dentist",alternates:["cafe"]}})).toBe(false);
    expect(isOvertureFoodServicePlace({basic_category:"bakery"})).toBe(true);
    expect(overtureFoodServiceCategories({taxonomy:{primary:"cupcake_shop",hierarchy:["food_and_drink","casual_eatery","dessert_shop","cupcake_shop"]}})).toEqual(["dessert_shop","cupcake_shop"]);
    expect(isOvertureFoodServicePlace({taxonomy:{primary:"dentist",hierarchy:["services","dentist","cafe"]}})).toBe(false);
  });
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

  it("lets an explicit non-food primary category outrank a noisy cafe alternate", () => {
    expect(isOvertureFoodServicePlace({
      categories: { primary: "dentist", alternate: ["cafe"] },
      taxonomy: { hierarchy: ["services", "dentist", "cafe"] },
    })).toBe(false);
  });

  it("accepts restaurant specializations and common breakfast venues", () => {
    expect(isOvertureFoodServicePlace({
      categories: { primary: "breakfast_and_brunch_restaurant" },
    })).toBe(true);
    expect(isOvertureFoodServicePlace({
      categories: { primary: "bagel_shop" },
    })).toBe(true);
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

describe("Overture place-name normalization", () => {
  it("turns Dutch Bros location-page titles into the customer-facing brand", () => {
    expect(normalizeOverturePlaceName(
      "Spokane, WA (Downtown)",
      ["https://locations.dutchbros.com/dutch-bros-coffee-wa/spokane/410-w-2nd-ave"],
    )).toBe("Dutch Bros Coffee");
  });

  it("does not rewrite unrelated local names", () => {
    expect(normalizeOverturePlaceName("Spokane Breakfast Company", ["https://spokaneshake.com/"]))
      .toBe("Spokane Breakfast Company");
  });
});
