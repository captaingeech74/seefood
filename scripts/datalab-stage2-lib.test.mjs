import { describe, expect, it } from "vitest";
import {
  aggregateCoverage,
  buildCohortPreferences,
  maximumUniqueEntityAssignment,
  metricFlags,
  sha256,
} from "./datalab-stage2-lib.mjs";

describe("DL-002 Stage 2 helpers", () => {
  it("matches public provider IDs without duplicating a production entity", () => {
    const cohort = [
      {
        providerIds: { seefood: ["g-1"], overture: ["o-1"] },
        latitude: 1,
        longitude: 1,
      },
      {
        providerIds: { overture: ["o-2"] },
        latitude: 2,
        longitude: 2,
      },
    ];
    const identities = [
      { entity_id: "e-1", provider_id: "g-1", lat: 1, lng: 1 },
      { entity_id: "e-1", provider_id: "o-2", lat: 1, lng: 1 },
      { entity_id: "e-2", provider_id: "o-1", lat: 2, lng: 2 },
      { entity_id: "e-2", provider_id: "o-2", lat: 2, lng: 2 },
    ];
    const preferences = buildCohortPreferences(cohort, identities);
    expect(maximumUniqueEntityAssignment(preferences)).toEqual(["e-1", "e-2"]);
  });

  it("recomputes all seven coverage rungs with the production thresholds", () => {
    const strong = {
      menu_count: 10,
      photo_count: 8,
      matched_photo_count: 7,
      matched_dish_count: 5,
      comparison_dish_count: 1,
    };
    expect(metricFlags(strong)).toEqual({
      menuCoverage: true,
      basicPhotoCoverage: true,
      basicMenuPhotoCoverage: true,
      twentyPercentMenuPhotoCoverage: true,
      fiftyPercentMenuPhotoCoverage: true,
      comparisonCoverage: true,
    });
    expect(aggregateCoverage([strong, {}])).toEqual({
      identifiedRestaurants: 2,
      menuCoverage: 1,
      basicPhotoCoverage: 1,
      basicMenuPhotoCoverage: 1,
      twentyPercentMenuPhotoCoverage: 1,
      fiftyPercentMenuPhotoCoverage: 1,
      comparisonCoverage: 1,
    });
  });

  it("uses exact SHA-256 for registered opaque IDs", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
