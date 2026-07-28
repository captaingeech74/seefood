export const CONTRIBUTION_EXPERIMENT = "dl007_known_dish_v1";
export const CONTRIBUTION_VARIANT = "passive_existing_surface";
export const CONTRIBUTION_RIGHTS_VERSION = "customer-photo-rights-v1";

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
    moderation_status: "pending",
    item_match_status: "pending",
    duplicate_review_status: "pending",
    active: false,
  } as const;
}
