import { describe, expect, it } from "vitest";
import { normalizePeliasFeatures } from "../geocoder";

describe("normalizePeliasFeatures", () => {
  it("keeps valid labeled points and discards malformed features", () => {
    const results = normalizePeliasFeatures([
      {
        properties: { id: "venue-1", label: "Old Town, San Diego, CA", layer: "locality" },
        geometry: { coordinates: [-117.196, 32.755] },
      },
      { properties: { label: "Missing coordinates" } },
      { properties: { label: "Bad coordinates" }, geometry: { coordinates: ["x", "y"] } },
    ]);

    expect(results).toEqual([{
      id: "venue-1",
      label: "Old Town, San Diego, CA",
      lat: 32.755,
      lng: -117.196,
      type: "locality",
    }]);
  });
});
