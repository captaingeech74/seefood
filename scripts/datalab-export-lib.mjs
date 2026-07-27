import { createHash } from "node:crypto";

export const DL001_SEED = "DL-001-CAL-2026-07-23";
export const CLAIM_DISH_RANK_FORMULA =
  'SHA-256("DL-001-CLAIM-DISH-v2|" || selection_seed || "|" || entity_id || "|" || dish_key)';
export const PHOTO_RANK_FORMULA =
  'SHA-256("DL-001-PHOTO-v2|" || selection_seed || "|" || entity_id || "|" || photo_id)';
export const GUARDIAN_ORDER_FORMULA =
  'SHA-256("DL-001-GUARDIAN-ORDER-v2|" || withheld_shuffle_seed || "|" || entity_id)';

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableRank(stableRestaurantId) {
  return sha256(`${DL001_SEED}${stableRestaurantId}`);
}

export function claimDishRank(entityId, dishKey) {
  return sha256(`DL-001-CLAIM-DISH-v2|${DL001_SEED}|${entityId}|${dishKey}`);
}

export function photoRank(entityId, photoId) {
  return sha256(`DL-001-PHOTO-v2|${DL001_SEED}|${entityId}|${photoId}`);
}

export function guardianOrderRank(withheldSeed, entityId) {
  return sha256(`DL-001-GUARDIAN-ORDER-v2|${withheldSeed}|${entityId}`);
}

export function canonicalRosterHash(rows) {
  return sha256(JSON.stringify([...rows].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  )));
}

export function hammingDistanceHex(left, right) {
  if (!left || !right || left.length !== right.length) return null;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

export function classifyCandidate(candidate) {
  if (Number(candidate.sql_claim_count) > 0) {
    return {
      bucket: "sql_claimed",
      reason: "At least one dish has both a stored Management and Customer author type after the current V2 association recomputation.",
    };
  }
  if (
    Number(candidate.current_menu_count) >= 7 &&
    Number(candidate.useful_photo_count) >= 7
  ) {
    return {
      bucket: "rich_unpaired",
      reason: "At least seven current menu dishes and seven useful photo candidates, but no recomputed V2 comparison dish.",
    };
  }
  if (
    Number(candidate.current_menu_count) < 7 &&
    Number(candidate.useful_photo_count) < 7
  ) {
    return {
      bucket: "sparse",
      reason: "Fewer than seven current menu dishes and fewer than seven useful photo candidates, with no recomputed V2 comparison dish.",
    };
  }
  return {
    bucket: "not_selected_bucket",
    reason: "Does not meet the mechanical definition of any DL-001 calibration bucket.",
  };
}

export function redactLocator(rawValue) {
  if (!rawValue) return null;
  let parsed;
  try {
    parsed = new URL(rawValue, "https://local.invalid");
  } catch {
    return {
      kind: "unparseable",
      locatorSha256: sha256(String(rawValue)),
    };
  }

  const isRelative = parsed.hostname === "local.invalid";
  const pathClass = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 2)
    .join("/");
  return {
    kind: isRelative ? "application_relative" : "absolute_https",
    host: isRelative ? null : parsed.hostname,
    pathClass: pathClass || "/",
    locatorSha256: sha256(String(rawValue)),
  };
}

export function findSecretLeaks(text, secretValues) {
  const leaks = [];
  for (const [name, value] of Object.entries(secretValues)) {
    if (typeof value === "string" && value.length >= 8 && text.includes(value)) {
      leaks.push(name);
    }
  }
  return leaks;
}

export function authorBasis(photo) {
  const source = String(photo.source || "").toLowerCase();
  if (["user_upload", "user_suggested"].includes(source)) {
    return {
      basis: "first_party_submission_source",
      strength: "direct_source_classification",
    };
  }
  if (
    ["merchant", "website", "schema_org", "menufy", "toast", "square", "clover", "chownow", "olo", "popmenu", "doordash", "grubhub"].includes(source)
  ) {
    return {
      basis: "management_catalog_source_heuristic",
      strength: "heuristic_requires_guardian_review",
    };
  }
  if (source === "google" && photo.attribution === "user") {
    return {
      basis: "legacy_google_user_attribution_heuristic",
      strength: "heuristic_requires_guardian_review",
    };
  }
  return {
    basis: "stored_author_inference_only",
    strength: "unverified_requires_guardian_review",
  };
}

export function selectBucketCandidates(candidates, count = 4) {
  const wanted = ["sql_claimed", "rich_unpaired", "sparse"];
  return wanted.flatMap((bucket) =>
    candidates
      .filter((candidate) => candidate.bucket === bucket)
      .sort((a, b) => a.rank.localeCompare(b.rank))
      .slice(0, count)
  );
}
