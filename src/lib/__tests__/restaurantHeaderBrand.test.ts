import { describe, expect, it } from "vitest";
import { mealEmojiForLocalHour } from "../mealEmoji";

describe("restaurant header meal mark", () => {
  it("uses breakfast, daytime, and evening food in local time", () => {
    expect(mealEmojiForLocalHour(5)).toBe("🥞");
    expect(mealEmojiForLocalHour(10)).toBe("🥞");
    expect(mealEmojiForLocalHour(11)).toBe("🍔");
    expect(mealEmojiForLocalHour(16)).toBe("🍔");
    expect(mealEmojiForLocalHour(17)).toBe("🍲");
    expect(mealEmojiForLocalHour(23)).toBe("🍲");
    expect(mealEmojiForLocalHour(2)).toBe("🍲");
  });
});
