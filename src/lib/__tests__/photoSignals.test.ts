import { describe, expect, it } from "vitest";
import type { DishPhoto } from "../types";
import { heroScore, normalizePhotoAuthor, trustLabel, withPhotoSignals } from "../photoSignals";
import { canReactivateQuarantinedPhoto } from "../photoFingerprint";

const base: DishPhoto = {
  id: "photo-1",
  url: "https://example.com/photo.jpg",
  dishName: "Birria Tacos",
  dishDescription: null,
  isMenuMatch: true,
  source: "google",
  attribution: "user",
  tier: 1,
  width: 1200,
  height: 900,
  loveCount: 0,
  primaryVotes: 0,
};

describe("normalized photo signals", () => {
  it("always treats seeFood uploads as customer photos", () => {
    expect(normalizePhotoAuthor("user_upload", "owner")).toBe("customer");
    expect(trustLabel("user_upload", "customer")).toBe("seefood_photo");
  });

  it("treats ordering-platform photography as management-supplied", () => {
    expect(normalizePhotoAuthor("doordash", "user")).toBe("management");
  });

  it("does not allow storefronts to become heroes", () => {
    const storefront = withPhotoSignals({ ...base, isStorefront: true, photoQualityScore: 100 });
    expect(heroScore(storefront)).toBe(0);
  });

  it("rewards quality, popularity, validation, and photo breadth", () => {
    const ordinary = withPhotoSignals({ ...base, photoQualityScore: 60, dishPopularityScore: 15 });
    const standout = withPhotoSignals({
      ...base,
      photoQualityScore: 92,
      dishPopularityScore: 95,
      loveCount: 4,
      primaryVotes: 3,
    });
    expect(heroScore(standout, 5)).toBeGreaterThan(heroScore(ordinary, 1));
  });
});

describe("photo quarantine durability", () => {
  it("allows a successfully verified image to recover from a transient quarantine", () => {
    expect(canReactivateQuarantinedPhoto("verification_pending", "content-hash")).toBe(true);
  });

  it("does not republish unsupported website imagery just because the same bytes were fetched again", () => {
    expect(canReactivateQuarantinedPhoto("unsupported_generic_website_image", "content-hash")).toBe(false);
  });
});
