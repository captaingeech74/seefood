import { describe, expect, it } from "vitest";
import {
  decideLocalFoodVision,
  hasRestaurantIdentityInUrl,
  selectCoverageFirstCandidates,
} from "../zeroPhotoCompletion";

describe("zero-photo completion safety policy", () => {
  it("requires a distinctive restaurant identity token", () => {
    expect(hasRestaurantIdentityInUrl("Gena's Mexican Kitchen", "https://genasmexicankitchen.com/gallery")).toBe(true);
    expect(hasRestaurantIdentityInUrl("Baha Express", "https://www.bajafresh.com/menu/tacos")).toBe(false);
    expect(hasRestaurantIdentityInUrl("The Restaurant", "https://example.com/menu")).toBe(false);
  });
  it("does not mistake a shared cuisine/country word for restaurant identity", () => {
    expect(hasRestaurantIdentityInUrl("China Dragon Restaurant", "https://www.thechinapalace.biz/")).toBe(false);
    expect(hasRestaurantIdentityInUrl("China Dragon Restaurant", "https://chinadragonmaplegrove.com/")).toBe(true);
    expect(hasRestaurantIdentityInUrl("Ten Sushi", "https://tensushimn.com/")).toBe(true);
  });

  it("accepts clear food and withholds ambiguous table settings", () => {
    expect(decideLocalFoodVision([{ name: "food", confidence: 0.81 }, { name: "pizza", confidence: 0.78 }])).toBe("food");
    expect(decideLocalFoodVision([{ name: "tableware", confidence: 0.9 }, { name: "food", confidence: 0.3 }])).toBe("uncertain");
  });

  it("rejects explicit and strong non-food content even with incidental food", () => {
    expect(decideLocalFoodVision([{ name: "adult", confidence: 0.08 }, { name: "food", confidence: 0.9 }])).toBe("reject");
    expect(decideLocalFoodVision([{ name: "furniture", confidence: 0.8 }, { name: "food", confidence: 0.6 }])).toBe("reject");
  });

  it("prioritizes dish-linked evidence and allows only one honest unmatched photo", () => {
    const selected = selectCoverageFirstCandidates([
      { restaurantId: "r", contentHash: "u1", dishLinked: false, score: 90 },
      { restaurantId: "r", contentHash: "u2", dishLinked: false, score: 80 },
      { restaurantId: "r", contentHash: "m1", dishLinked: true, score: 70 },
      { restaurantId: "r", contentHash: "m2", dishLinked: true, score: 60 },
    ]);
    expect(selected.map((row) => row.contentHash)).toEqual(["m1", "m2", "u1"]);
  });
});
