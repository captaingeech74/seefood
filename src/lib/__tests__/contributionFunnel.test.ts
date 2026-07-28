import { describe, expect, it } from "vitest";
import {
  clientOutcomeAllowed,
  classifyContributionTraffic,
  isUuid,
  pendingKnownDishPhotoState,
} from "../contributionFunnel";

describe("contribution funnel safety", () => {
  it("excludes fixture, staff, automation, and inactive traffic", () => {
    expect(classifyContributionTraffic({ entityStatus: "test_fixture" })).toBe("fixture");
    expect(classifyContributionTraffic({ entityStatus: "active", requestedClass: "staff" })).toBe("staff");
    expect(classifyContributionTraffic({ entityStatus: "active", userAgent: "Playwright" })).toBe("automation");
    expect(classifyContributionTraffic({ entityStatus: "closed" })).toBe("ineligible_entity");
    expect(classifyContributionTraffic({ entityStatus: "active" })).toBe("public_unverified");
  });

  it("accepts UUID attempt identifiers and rejects arbitrary text", () => {
    expect(isUuid("5ad3ed0a-5183-4ce9-9140-8bb26190e17c")).toBe(true);
    expect(isUuid("not-an-attempt")).toBe(false);
  });

  it("uses a strict client event/outcome allowlist", () => {
    expect(clientOutcomeAllowed("photo_source_choice", "camera")).toBe(true);
    expect(clientOutcomeAllowed("photo_source_choice", "approved")).toBe(false);
    expect(clientOutcomeAllowed("client_preparation_result", "failure")).toBe(true);
  });

  it("keeps new known-dish submissions pending and nonpublic", () => {
    expect(
      pendingKnownDishPhotoState({
        attemptId: "5ad3ed0a-5183-4ce9-9140-8bb26190e17c",
        rightsVersion: "customer-photo-rights-v1",
      })
    ).toMatchObject({
      active: false,
      moderation_status: "pending",
      rights_status: "user_granted",
      rights_version: "customer-photo-rights-v1",
      item_match_status: "pending",
      duplicate_review_status: "pending",
    });
  });
});
