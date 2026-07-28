import { describe, expect, it } from "vitest";
import {
  clientOutcomeAllowed,
  classifyContributionTraffic,
  contributionAttemptMatches,
  contributionAnalysisEligibility,
  contributionTargetClasses,
  isUuid,
  pendingKnownDishPhotoState,
  terminalContributionReview,
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
      rights_scope: "display_with_dish",
      item_match_status: "pending",
      duplicate_review_status: "pending",
    });
  });

  it("binds an attempt immutably to its original restaurant and dish", () => {
    const original = {
      restaurantId: "restaurant-a",
      menuItemId: 10,
      visitorId: "visitor-a",
      sessionId: "session-a",
      experimentKey: "dl007_known_dish_v1",
      variantKey: "passive_existing_surface",
      surface: "known_dish",
      targetClass: "behavioral_prompt_candidate",
    };
    expect(contributionAttemptMatches(original, original)).toBe(true);
    expect(
      contributionAttemptMatches(original, { ...original, menuItemId: 11 })
    ).toBe(false);
    expect(
      contributionAttemptMatches(original, {
        ...original,
        restaurantId: "restaurant-b",
      })
    ).toBe(false);
  });

  it("does not call unverified public traffic analysis-eligible", () => {
    expect(contributionAnalysisEligibility("public_unverified")).toBe("unverified");
    expect(contributionAnalysisEligibility("fixture")).toBe("excluded_fixture");
    expect(contributionAnalysisEligibility("staff")).toBe("excluded_staff");
    expect(contributionAnalysisEligibility("automation")).toBe("excluded_automation");
  });

  it("separates behavioral eligibility from gold comparison eligibility", () => {
    const base = {
      restaurantStatus: "active",
      entityStatus: "active",
      operatingStatus: "open",
      menuActive: true,
      menuMissingStreak: 0,
      menuLastSeenAt: "2026-07-20T00:00:00.000Z",
      now: new Date("2026-07-27T00:00:00.000Z"),
    };
    expect(contributionTargetClasses(base)).toMatchObject({
      behavioralPromptCandidate: true,
      goldComparisonCandidate: false,
    });
    expect(
      contributionTargetClasses({ ...base, goldGatesPass: true })
    ).toMatchObject({
      behavioralPromptCandidate: true,
      goldComparisonCandidate: true,
    });
    expect(
      contributionTargetClasses({
        ...base,
        menuLastSeenAt: "2026-01-01T00:00:00.000Z",
        goldGatesPass: true,
      }).behavioralPromptCandidate
    ).toBe(false);
  });

  it("publishes only after every terminal review gate passes", () => {
    const passing = {
      moderation: "approved" as const,
      itemMatch: "exact" as const,
      duplicateReview: "unique" as const,
      rightsStatus: "user_granted",
      rightsVersion: "customer-photo-rights-v1",
      rightsScope: "display_with_dish",
    };
    expect(terminalContributionReview(passing).publicationEligible).toBe(true);
    expect(
      terminalContributionReview({ ...passing, itemMatch: "unmatched" })
        .publicationEligible
    ).toBe(false);
    expect(
      terminalContributionReview({ ...passing, rightsScope: "model_training" })
        .publicationEligible
    ).toBe(false);
  });
});
