import { describe, expect, it } from "vitest";
import {
  interpretContributionGoldContract,
  shouldRetireContributionAttempt,
} from "../contributionContract.mjs";

const passingBehavioral = {
  eligible: true,
  gates: {
    activeRestaurant: true,
    activeEntity: true,
    operatingStatusNotClosed: true,
    activeMenuItem: true,
    zeroMissingStreak: true,
    observedWithin30Days: true,
    latestSuccessfulSourceSnapshot: true,
  },
};

describe("live contribution database-contract adapter", () => {
  it("reads the database behavioral key and preserves a passing decision", () => {
    expect(
      interpretContributionGoldContract({
        eligible: true,
        selectedPhotoId: 42,
        behavioral: passingBehavioral,
      })
    ).toEqual({
      behavioralPromptCandidate: true,
      goldComparisonCandidate: true,
      selectedManagementPhotoId: 42,
      targetEvidence: passingBehavioral.gates,
    });
  });

  it("fails closed for the obsolete behavior key", () => {
    expect(
      interpretContributionGoldContract({
        eligible: true,
        behavior: passingBehavioral,
      })
    ).toMatchObject({
      behavioralPromptCandidate: false,
      goldComparisonCandidate: false,
    });
  });

  it("fails every missing or malformed behavioral gate closed", () => {
    const result = interpretContributionGoldContract({
      eligible: true,
      behavioral: { eligible: true, gates: { activeRestaurant: true } },
    });
    expect(result.targetEvidence.activeRestaurant).toBe(true);
    expect(result.targetEvidence.activeEntity).toBe(false);
  });
});

describe("upload attempt retry rotation", () => {
  it.each([400, 409, 413, 500, 503])(
    "retires the attempt after upload route status %i",
    () => {
      expect(
        shouldRetireContributionAttempt({
          responseOk: false,
          hasReceipt: false,
        })
      ).toBe(true);
    }
  );

  it("retires the attempt after local preparation failure", () => {
    expect(
      shouldRetireContributionAttempt({
        responseOk: false,
        hasReceipt: false,
        localFailure: true,
      })
    ).toBe(true);
  });

  it("preserves only a successful receipt for idempotent replay", () => {
    expect(
      shouldRetireContributionAttempt({
        responseOk: true,
        hasReceipt: true,
      })
    ).toBe(false);
    expect(
      shouldRetireContributionAttempt({
        responseOk: true,
        hasReceipt: false,
      })
    ).toBe(true);
  });
});
