import { describe, expect, it } from "vitest";
import { restaurantSearchMatches, restaurantSearchTerms } from "../restaurantSearch";

describe("restaurant search matching", () => {
  it("ignores apostrophes and tolerates one long-word typo", () => {
    const restaurant = "Shawn O'Donnell's Spokane 719 N Monroe St";
    expect(restaurantSearchMatches("Shawn O donnels", restaurant)).toBe(true);
    expect(restaurantSearchMatches("Shawn O donnells", restaurant)).toBe(true);
  });

  it("does not turn short or unrelated terms into broad fuzzy matches", () => {
    expect(restaurantSearchMatches("Shaw", "Shawn O'Donnell's Spokane")).toBe(true);
    expect(restaurantSearchMatches("Shore", "Shawn O'Donnell's Spokane")).toBe(false);
    expect(restaurantSearchMatches("Wooden City", "Wooden City Spokane")).toBe(true);
  });

  it("normalizes possessives into the restaurant word", () => {
    expect(restaurantSearchTerms("O'Donnell's")).toEqual(["odonnells"]);
    expect(restaurantSearchTerms("O Donnells")).toEqual(["odonnells"]);
  });
});
