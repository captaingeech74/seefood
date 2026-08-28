export const CONTRIBUTION_EXPERIMENT = "dl007_known_dish_v1";
export const CONTRIBUTION_VARIANT = "passive_existing_surface";
export const CONTRIBUTION_RIGHTS_VERSION = "customer-photo-rights-v1";
export const CONTRIBUTION_RIGHTS_SCOPE = "display_with_dish";
export const MENU_FRESHNESS_DAYS = 30;

export const CLIENT_CONTRIBUTION_EVENTS = new Set([
  "eligible_prompt_impression",
  "prompt_open",
  "photo_source_choice",
  "file_selected",
  "file_cancelled",
  "client_preparation_result",
] as const);

export type ClientContributionEvent =
  | "eligible_prompt_impression"
  | "prompt_open"
  | "photo_source_choice"
  | "file_selected"
  | "file_cancelled"
  | "client_preparation_result";

export type ContributionTrafficClass =
  | "public_unverified"
  | "staff"
  | "automation"
  | "fixture"
  | "ineligible_entity";

export interface ContributionAttemptBinding {
  restaurantId: string;
  menuItemId: number;
  visitorId: string;
  sessionId: string;
  experimentKey: string;
  variantKey: string;
  surface: string;
  targetClass: string;
}

export function contributionAttemptMatches(
  actual: ContributionAttemptBinding,
  expected: ContributionAttemptBinding
): boolean {
  return (
    actual.restaurantId === expected.restaurantId &&
    actual.menuItemId === expected.menuItemId &&
    actual.visitorId === expected.visitorId &&
    actual.sessionId === expected.sessionId &&
    actual.experimentKey === expected.experimentKey &&
    actual.variantKey === expected.variantKey &&
    actual.surface === expected.surface &&
    actual.targetClass === expected.targetClass
  );
}

export function contributionTargetClasses(input: {
  restaurantStatus?: string | null;
  entityStatus?: string | null;
  operatingStatus?: string | null;
  menuActive: boolean;
  menuMissingStreak: number;
  menuLastSeenAt?: string | null;
  now?: Date;
  goldGatesPass?: boolean;
}) {
  const observedAt = input.menuLastSeenAt
    ? new Date(input.menuLastSeenAt).getTime()
    : NaN;
  const freshnessCutoff =
    (input.now ?? new Date()).getTime() - MENU_FRESHNESS_DAYS * 86_400_000;
  const currentObservation =
    Number.isFinite(observedAt) && observedAt >= freshnessCutoff;
  const activeRecentlyObservedZeroMissingStreak =
    input.menuActive && input.menuMissingStreak === 0;
  const activeRestaurant =
    input.restaurantStatus === "active" &&
    input.entityStatus === "active" &&
    !["closed", "permanently_closed"].includes(input.operatingStatus ?? "");
  const behavioralPromptCandidate =
    activeRestaurant &&
    currentObservation &&
    activeRecentlyObservedZeroMissingStreak;
  return {
    behavioralPromptCandidate,
    goldComparisonCandidate:
      behavioralPromptCandidate && input.goldGatesPass === true,
    evidence: {
      activeRestaurant,
      currentObservation,
      activeRecentlyObservedZeroMissingStreak,
      freshnessDays: MENU_FRESHNESS_DAYS,
    },
  };
}

export type ContributionAnalysisEligibility =
  | "unverified"
  | "eligible_external"
  | "excluded_fixture"
  | "excluded_staff"
  | "excluded_automation"
  | "excluded_ineligible_entity";

export type ContributionTargetClass =
  | "behavioral_prompt_candidate"
  | "current_menu_item";

/**
 * Product contribution eligibility and experiment eligibility are separate.
 * Every current menu item may receive a customer photo; only the narrower
 * behavioral cohort is counted in the archived DL-007 experiment baseline.
 */
export function classifyContributionTarget(input: {
  behavioralPromptCandidate: boolean;
  trafficClass: ContributionTrafficClass;
}): {
  targetClass: ContributionTargetClass;
  analysisEligibility: ContributionAnalysisEligibility;
} {
  if (!input.behavioralPromptCandidate) {
    return {
      targetClass: "current_menu_item",
      analysisEligibility: "excluded_ineligible_entity",
    };
  }
  return {
    targetClass: "behavioral_prompt_candidate",
    analysisEligibility: contributionAnalysisEligibility(input.trafficClass),
  };
}

export function contributionAnalysisEligibility(
  trafficClass: ContributionTrafficClass
): ContributionAnalysisEligibility {
  const excluded = {
    fixture: "excluded_fixture",
    staff: "excluded_staff",
    automation: "excluded_automation",
    ineligible_entity: "excluded_ineligible_entity",
  } as const;
  return trafficClass === "public_unverified"
    ? "eligible_external"
    : excluded[trafficClass];
}

export function terminalContributionReview(input: {
  moderation: "approved" | "rejected";
  itemMatch: "exact" | "strong" | "unmatched";
  duplicateReview: "unique" | "duplicate";
  rightsStatus: string;
  rightsVersion?: string | null;
  rightsScope?: string | null;
}) {
  const publicationEligible =
    input.moderation === "approved" &&
    ["exact", "strong"].includes(input.itemMatch) &&
    input.duplicateReview === "unique" &&
    input.rightsStatus === "user_granted" &&
    input.rightsVersion === CONTRIBUTION_RIGHTS_VERSION &&
    input.rightsScope === CONTRIBUTION_RIGHTS_SCOPE;
  return {
    publicationEligible,
    attemptStatus: publicationEligible ? "verified" : "rejected",
    photoActive: publicationEligible,
  } as const;
}

/**
 * Fully automatic review for a photo submitted from a known dish screen.
 * This is intentionally deterministic and free: successful decoding proves
 * it is a real image, the server-owned current-menu target proves attachment,
 * and the byte hash proves exact uniqueness. It does not pretend a person is
 * waiting in a moderation queue.
 */
export function automatedKnownDishReview(input: {
  imageDecoded: boolean;
  currentMenuTarget: boolean;
  exactDuplicate: boolean;
}) {
  return {
    moderation: input.imageDecoded ? ("approved" as const) : ("rejected" as const),
    itemMatch: input.currentMenuTarget ? ("exact" as const) : ("unmatched" as const),
    duplicateReview: input.exactDuplicate ? ("duplicate" as const) : ("unique" as const),
    rightsScope: CONTRIBUTION_RIGHTS_SCOPE,
  } as const;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function classifyContributionTraffic(input: {
  entityStatus?: string | null;
  requestedClass?: string | null;
  userAgent?: string | null;
}): ContributionTrafficClass {
  if (input.entityStatus === "test_fixture") return "fixture";
  if (
    input.requestedClass === "automation" ||
    /playwright|headless|selenium|puppeteer/i.test(input.userAgent ?? "")
  ) {
    return "automation";
  }
  if (input.requestedClass === "staff") return "staff";
  if (!input.entityStatus || !["active", "open"].includes(input.entityStatus)) {
    return "ineligible_entity";
  }
  return "public_unverified";
}

export function clientOutcomeAllowed(
  eventName: ClientContributionEvent,
  outcome: string
): boolean {
  const allowed: Record<ClientContributionEvent, string[]> = {
    eligible_prompt_impression: ["observed"],
    prompt_open: ["observed"],
    photo_source_choice: ["camera", "library"],
    file_selected: ["observed"],
    file_cancelled: ["cancelled"],
    client_preparation_result: ["success", "failure"],
  };
  return allowed[eventName].includes(outcome);
}

export function pendingKnownDishPhotoState(input: {
  attemptId: string;
  rightsVersion: string;
}) {
  return {
    contribution_attempt_id: input.attemptId,
    rights_status: "user_granted",
    rights_version: input.rightsVersion,
    rights_scope: CONTRIBUTION_RIGHTS_SCOPE,
    moderation_status: "pending",
    item_match_status: "pending",
    duplicate_review_status: "pending",
    active: false,
  } as const;
}
