import { describe, expect, it } from "vitest";
import {
  aggregateWindow,
  inWindow,
  opaqueId,
  scanText,
} from "./datalab-dl007-lib.mjs";

describe("DL-007 export helpers", () => {
  it("creates stable type-separated bundle-only identifiers", () => {
    expect(opaqueId("seed", "visitor", "one")).toBe(
      opaqueId("seed", "visitor", "one")
    );
    expect(opaqueId("seed", "visitor", "one")).not.toBe(
      opaqueId("seed", "session", "one")
    );
    expect(opaqueId("seed", "visitor", null)).toBeNull();
  });

  it("uses inclusive fixed snapshot windows", () => {
    expect(inWindow("2026-07-20T00:00:00Z", "2026-07-27T00:00:00Z", 7)).toBe(true);
    expect(inWindow("2026-07-19T23:59:59Z", "2026-07-27T00:00:00Z", 7)).toBe(false);
    expect(inWindow("2026-07-28T00:00:00Z", "2026-07-27T00:00:00Z", null)).toBe(false);
  });

  it("keeps completed records separate from successful-upload events", () => {
    const events = [
      {
        eventName: "app_open",
        createdAt: "2026-07-26T00:00:00Z",
        opaqueVisitorId: "visitor_a",
        opaqueSessionId: "session_a",
      },
      {
        eventName: "photo_add",
        createdAt: "2026-07-26T00:01:00Z",
        opaqueVisitorId: "visitor_a",
        opaqueSessionId: "session_a",
        photoAddSurface: "dish_detail",
      },
    ];
    const photos = [
      {
        createdAt: "2026-07-26T00:00:30Z",
        evaluationEligibleEntity: true,
        active: true,
        moderationStatus: "approved",
        opaqueContributorId: "visitor_a",
        opaqueEntityId: "entity_a",
        attachedToCurrentMenu: true,
        currentMechanicalComparisonReady: true,
      },
    ];
    expect(
      aggregateWindow(events, photos, "2026-07-27T00:00:00Z", 7)
    ).toMatchObject({
      visits: 1,
      successfulUploads: 1,
      successfulUploadEvents: 1,
      uniqueContributors: 1,
      dishDetailUploads: 1,
      attachedUploads: 1,
      comparisonReadyContributions: 1,
      uniqueRestaurantsImproved: 1,
    });
  });

  it("detects secrets and direct personal-data patterns", () => {
    expect(scanText("prefix hidden-secret suffix", ["hidden-secret"])).toContain(
      "loaded_environment_secret_value"
    );
    expect(scanText("person@example.com", [])).toContain("email_address");
    expect(scanText("safe opaque_123", [])).toEqual([]);
  });
});
