import { describe, expect, it } from "vitest";
import { contributionDraftKey, parseContributionDraft } from "../contributionDraft";

describe("contribution draft persistence", () => {
  it("uses a restaurant-scoped key", () => {
    expect(contributionDraftKey("abc")).toBe("seefood-contribution-draft:abc");
  });

  it("restores a camera-suspended draft", () => {
    expect(parseContributionDraft(JSON.stringify({
      active: true,
      dishName: "Birria Tacos",
      dishDescription: "Three tacos",
      pickerActive: true,
      updatedAt: 42,
    }))).toEqual({
      active: true,
      dishName: "Birria Tacos",
      dishDescription: "Three tacos",
      pickerActive: true,
      updatedAt: 42,
    });
  });

  it("rejects closed or corrupt drafts", () => {
    expect(parseContributionDraft("not-json")).toBeNull();
    expect(parseContributionDraft(JSON.stringify({ active: false }))).toBeNull();
  });
});
