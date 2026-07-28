#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const bundle = resolve(
  root,
  "data-lab/raw/baseline/DL-002/main-thread-stage1",
);
const boundaryPath = resolve(
  root,
  "data-lab/raw/baseline/DL-002/tiger-2025/temecula-0678120.geojson",
);
const countyFramePath = resolve(
  root,
  "data-lab/artifacts/DL-002/temecula-deh-frame.json",
);
const independentReviewPath = resolve(
  root,
  "data-lab/reviews/DL-002-stage1-temecula-review.json",
);
const outputDirectory = resolve(root, "data-lab/artifacts/DL-002/stage1");

const PROVIDER_CAP = 500;
const COUNTY_CHALLENGE_CAP = 100;
const MATCH_DISTANCE_METERS = 175;
const ORDINARY_RANK_SEED = "DL-002-TEM-2026-07-27";
const REVIEW_RANK_SEED = "DL-002-REVIEW-2026-07-27";
const COUNTY_RANK_SEED = "DL-002-DEH-CHALLENGE-2026-07-27";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function stableRank(seed, id) {
  return sha256(`${seed}\0${id}`);
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|restaurant|restaurants|inc|llc|company|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const one = new Set(a.split(" ").filter((token) => token.length > 1));
  const two = new Set(b.split(" ").filter((token) => token.length > 1));
  const intersection = [...one].filter((token) => two.has(token)).length;
  return intersection / Math.max(one.size, two.size, 1);
}

function addressKey(value = "") {
  const normalized = normalize(value)
    .replace(/\b(suite|ste|unit|space)\s+[a-z0-9-]+.*$/, "")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(highway)\b/g, "hwy")
    .trim();
  const parts = normalized.split(" ");
  return /^\d+[a-z]?$/.test(parts[0] ?? "") ? parts.slice(0, 5).join(" ") : "";
}

function distanceMeters(left, right) {
  const radians = Math.PI / 180;
  const dLat = (right.latitude - left.latitude) * radians;
  const dLng = (right.longitude - left.longitude) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(left.latitude * radians) *
      Math.cos(right.latitude * radians) *
      Math.sin(dLng / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
  );
}

function pointOnSegment([x, y], [x1, y1], [x2, y2], epsilon = 1e-10) {
  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (squaredLength <= epsilon ** 2) {
    return (x - x1) ** 2 + (y - y1) ** 2 <= epsilon ** 2;
  }
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  return dot >= -epsilon && dot <= squaredLength + epsilon;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    if (pointOnSegment(point, ring[previous], ring[index])) return true;
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const crosses =
      y1 > point[1] !== y2 > point[1] &&
      point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (rings) =>
      pointInRing(point, rings[0]) &&
      !rings.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

function recordKey(record) {
  return `${record.sourceFamily}:${record.stableExternalId}`;
}

function providerPriority(sourceFamily) {
  return { overture: 0, seefood: 1, openstreetmap: 2 }[sourceFamily] ?? 9;
}

function candidatePair(left, right) {
  const distance = distanceMeters(left, right);
  if (distance > MATCH_DISTANCE_METERS) return null;
  const similarity = nameSimilarity(left.publicName, right.publicName);
  const exactName = normalize(left.publicName) === normalize(right.publicName);
  const leftAddress = addressKey(left.addressLine);
  const rightAddress = addressKey(right.addressLine);
  const sameAddress = Boolean(leftAddress && leftAddress === rightAddress);
  const sameHost = Boolean(
    left.websiteHost &&
      right.websiteHost &&
      left.websiteHost === right.websiteHost,
  );
  const distanceScore = Math.max(0, 1 - distance / MATCH_DISTANCE_METERS);
  const score =
    similarity * 0.65 +
    distanceScore * 0.2 +
    (sameAddress ? 0.1 : 0) +
    (sameHost ? 0.05 : 0);
  const accepted =
    (exactName && distance <= 175) ||
    (similarity >= 0.75 && distance <= 125) ||
    (sameAddress && similarity >= 0.5 && distance <= 100) ||
    (sameHost && similarity >= 0.5 && distance <= 125);
  return {
    left: recordKey(left),
    right: recordKey(right),
    distanceMeters: Math.round(distance * 10) / 10,
    nameSimilarity: Math.round(similarity * 1000) / 1000,
    exactName,
    sameAddress,
    sameHost,
    score: Math.round(score * 1000) / 1000,
    accepted,
  };
}

class UnionFind {
  constructor(keys) {
    this.parent = new Map(keys.map((key) => [key, key]));
  }
  find(key) {
    const parent = this.parent.get(key);
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }
  union(left, right) {
    const one = this.find(left);
    const two = this.find(right);
    if (one === two) return;
    this.parent.set(one < two ? two : one, one < two ? one : two);
  }
}

const boundary = readJson(boundaryPath).features[0].geometry;
const sourceFiles = {
  seefood: resolve(bundle, "temecula-seefood.jsonl"),
  openstreetmap: resolve(bundle, "temecula-osm.jsonl"),
  overture: resolve(bundle, "temecula-overture.jsonl"),
};
const sourceRows = Object.fromEntries(
  Object.entries(sourceFiles).map(([source, path]) => [source, readJsonl(path)]),
);
const independentReview = readJson(independentReviewPath);

const validation = {
  sourceRows: {},
  stableIdDuplicates: {},
  missingStableIds: {},
  outsideBoundary: {},
  fullUrlWebsiteHosts: {},
  internalUuidRankInputs: {},
};

for (const [source, rows] of Object.entries(sourceRows)) {
  const stableIds = rows.map((row) => row.stableExternalId).filter(Boolean);
  validation.sourceRows[source] = rows.length;
  validation.stableIdDuplicates[source] =
    stableIds.length - new Set(stableIds).size;
  validation.missingStableIds[source] = rows.length - stableIds.length;
  validation.outsideBoundary[source] = rows.filter(
    (row) =>
      !pointInGeometry([row.longitude, row.latitude], boundary),
  ).length;
  validation.fullUrlWebsiteHosts[source] = rows.filter((row) =>
    /^(?:https?:)?\/\//i.test(row.websiteHost ?? ""),
  ).length;
  validation.internalUuidRankInputs[source] =
    source === "seefood"
      ? rows.filter(
          (row) =>
            row.selectionEligible === true &&
            !row.stableExternalId,
        ).length
      : 0;
}

const providerRecords = [
  ...sourceRows.seefood.filter(
    (row) => row.selectionEligible === true && row.stableExternalId,
  ),
  ...sourceRows.openstreetmap.filter(
    (row) => row.sourceCategory !== "public_building",
  ),
  ...sourceRows.overture,
].map((row) => ({
  ...row,
  normalizedName: normalize(row.publicName),
}));

const bySource = Object.groupBy(providerRecords, (record) => record.sourceFamily);
const allPairs = [];
const acceptedPairs = [];
const ambiguousPairs = [];

for (const [leftSource, rightSource] of [
  ["seefood", "openstreetmap"],
  ["seefood", "overture"],
  ["openstreetmap", "overture"],
]) {
  const pairCandidates = [];
  for (const left of bySource[leftSource] ?? []) {
    for (const right of bySource[rightSource] ?? []) {
      const pair = candidatePair(left, right);
      if (pair?.accepted) pairCandidates.push(pair);
    }
  }
  allPairs.push(...pairCandidates);
  const byLeft = Object.groupBy(pairCandidates, (pair) => pair.left);
  const byRight = Object.groupBy(pairCandidates, (pair) => pair.right);
  for (const pair of pairCandidates) {
    const leftRanked = [...byLeft[pair.left]].sort(
      (a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters || a.right.localeCompare(b.right),
    );
    const rightRanked = [...byRight[pair.right]].sort(
      (a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters || a.left.localeCompare(b.left),
    );
    const mutualBest =
      leftRanked[0] === pair &&
      rightRanked[0] === pair;
    const closeLeftAlternative =
      leftRanked[1] && leftRanked[0].score - leftRanked[1].score < 0.05;
    const closeRightAlternative =
      rightRanked[1] && rightRanked[0].score - rightRanked[1].score < 0.05;
    if (mutualBest && !closeLeftAlternative && !closeRightAlternative) {
      acceptedPairs.push(pair);
    } else if (
      pair === leftRanked[0] ||
      pair === rightRanked[0]
    ) {
      ambiguousPairs.push({
        ...pair,
        reason: mutualBest
          ? "near_tied_alternative"
          : "not_mutual_best",
      });
    }
  }
}

const unionFind = new UnionFind(providerRecords.map(recordKey));
for (const pair of acceptedPairs) unionFind.union(pair.left, pair.right);
const providerRecordKeys = new Set(providerRecords.map(recordKey));
for (const group of independentReview.providerMergeGroups) {
  const missing = group.filter((key) => !providerRecordKeys.has(key));
  if (missing.length) {
    throw new Error(`Review merge group contains missing keys: ${missing.join(", ")}`);
  }
  for (const key of group.slice(1)) unionFind.union(group[0], key);
}

const groupedRecords = Object.groupBy(providerRecords, (record) =>
  unionFind.find(recordKey(record)),
);
const ambiguousKeys = new Set(
  ambiguousPairs.flatMap((pair) => [pair.left, pair.right]),
);

const sameSourceDuplicatePairs = [];
for (const [source, records] of Object.entries(bySource)) {
  for (let leftIndex = 0; leftIndex < records.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex++) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const distance = distanceMeters(left, right);
      if (
        distance <= 75 &&
        normalize(left.publicName) === normalize(right.publicName)
      ) {
        sameSourceDuplicatePairs.push({
          source,
          left: recordKey(left),
          right: recordKey(right),
          distanceMeters: Math.round(distance * 10) / 10,
        });
      }
    }
  }
}
const duplicateKeys = new Set(
  sameSourceDuplicatePairs.flatMap((pair) => [pair.left, pair.right]),
);
const resolvedMergeKeys = new Set(
  [
    ...independentReview.providerMergeGroups.flat(),
    ...independentReview.providerResolvedByExistingMergeGroup,
  ],
);
const unresolvedNoMergeKeys = new Set(
  independentReview.providerUnresolvedNoMerge,
);
const unreviewedIssueKeys = [...new Set([...ambiguousKeys, ...duplicateKeys])]
  .filter(
    (key) =>
      !resolvedMergeKeys.has(key) && !unresolvedNoMergeKeys.has(key),
  );
if (unreviewedIssueKeys.length) {
  throw new Error(
    `Ambiguous/duplicate keys lack review decisions: ${unreviewedIssueKeys.join(", ")}`,
  );
}

const clusters = Object.entries(groupedRecords).map(([rootKey, records]) => {
  const ordered = [...records].sort(
    (a, b) =>
      providerPriority(a.sourceFamily) - providerPriority(b.sourceFamily) ||
      a.stableExternalId.localeCompare(b.stableExternalId),
  );
  const anchor = ordered[0];
  const statuses = new Set(
    records.map((record) => record.sourceOperatingStatus).filter(Boolean),
  );
  const knownOpen = [...statuses].some((status) =>
    ["open", "active"].includes(status),
  );
  const knownClosed = [...statuses].some((status) =>
    ["closed", "permanently_closed"].includes(status),
  );
  const ambiguity =
    records.some((record) => unresolvedNoMergeKeys.has(recordKey(record))) ||
    (knownOpen && knownClosed);
  const reviewedMergeGroups = independentReview.providerMergeGroups
    .filter((group) => group.some((key) => records.some((record) => recordKey(record) === key)))
    .map((group) => [...group]);
  const providerIds = Object.fromEntries(
    Object.entries(Object.groupBy(ordered, (record) => record.sourceFamily))
      .map(([source, sourceRecords]) => [
        source,
        sourceRecords.map((record) => record.stableExternalId).sort(),
      ]),
  );
  return {
    dataLabId: `${anchor.sourceFamily}:${anchor.stableExternalId}`,
    publicName: anchor.publicName,
    addressLine: anchor.addressLine,
    city: anchor.city,
    state: anchor.state,
    postalCode: anchor.postalCode,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    businessType: anchor.sourceCategory,
    chainIndependent:
      records.some((record) => record.brandName) ? "chain_or_branded" : "unknown",
    websiteHost:
      records.map((record) => record.websiteHost).find(Boolean) ?? null,
    proposedStatus: knownOpen
      ? "open"
      : knownClosed
        ? "closed"
        : "unknown",
    proposedInclusion:
      knownClosed ? "status_ledger" : ambiguity ? "review" : "candidate",
    ambiguity,
    duplicateReviewRequired: records.some((record) =>
      unresolvedNoMergeKeys.has(recordKey(record)),
    ),
    providerIds,
    evidenceTimestamps: Object.fromEntries(
      ordered.map((record) => [
        record.sourceFamily,
        record.sourceObservedAt,
      ]),
    ),
    sourceLicenses: Object.fromEntries(
      ordered.map((record) => [
        record.sourceFamily,
        record.sourceLicense,
      ]),
    ),
    recordKeys: ordered.map(recordKey),
    acceptedMatches: acceptedPairs.filter(
      (pair) =>
        unionFind.find(pair.left) === rootKey &&
        unionFind.find(pair.right) === rootKey,
    ),
    reviewedMergeGroups,
    rank: stableRank(ORDINARY_RANK_SEED, `${anchor.sourceFamily}:${anchor.stableExternalId}`),
  };
});

const activeClusters = clusters.filter(
  (cluster) => cluster.proposedStatus === "open",
);
const closureLedger = clusters.filter(
  (cluster) => cluster.proposedStatus === "closed",
);
const unknownStatusIdentityCandidates = clusters.filter(
  (cluster) => cluster.proposedStatus === "unknown",
);
const specialClusters = activeClusters.filter(
  (cluster) =>
    cluster.ambiguity ||
    cluster.duplicateReviewRequired,
);
const ordinaryClusters = activeClusters
  .filter((cluster) => !specialClusters.includes(cluster))
  .sort((a, b) => a.rank.localeCompare(b.rank) || a.dataLabId.localeCompare(b.dataLabId));
if (specialClusters.length > PROVIDER_CAP) {
  throw new Error(
    `${specialClusters.length} mandatory-review active clusters exceed the ${PROVIDER_CAP} cap`,
  );
}
const selectedProviderClusters = [
  ...specialClusters,
  ...ordinaryClusters.slice(0, Math.max(0, PROVIDER_CAP - specialClusters.length)),
];
const selectedProviderIds = new Set(
  selectedProviderClusters.flatMap((cluster) => cluster.recordKeys),
);

const countyFrame = readJson(countyFramePath);
const countyByEstablishment = Object.values(
  Object.groupBy(countyFrame.shareableRecords, (record) => record.establishmentId),
).map((records) => {
  const ordered = [...records].sort((a, b) =>
    a.permitNumber.localeCompare(b.permitNumber),
  );
  const anchor = ordered[0];
  return {
    stableExternalId: `rivco-deh-establishment:${anchor.establishmentId}`,
    publicName: anchor.publicName,
    addressLine: anchor.siteAddress,
    city: anchor.cityStateZip,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    permitTypes: [...new Set(ordered.map((record) => record.permitType))].sort(),
    permitNumbers: ordered.map((record) => record.permitNumber),
  };
});

function plausibleCountyRestaurant(record) {
  return record.permitTypes.some(
    (type) =>
      /(?:^FF (?:1-2000|2001-5999|>=6000) SQFT Unpack$)|(?:^MFF (?:Truck|Cart\/Trailer))|(?:^FF Host$)/.test(
        type,
      ),
  );
}

const countyMatches = [];
for (const county of countyByEstablishment) {
  let best = null;
  for (const providerRecord of providerRecords) {
    const pair = candidatePair(
      {
        ...county,
        sourceFamily: "riverside_deh",
        websiteHost: null,
      },
      providerRecord,
    );
    if (!pair?.accepted) continue;
    const dataLabId =
      clusters.find(
        (cluster) =>
          cluster.recordKeys.includes(recordKey(providerRecord)),
      )?.dataLabId;
    if (!dataLabId) throw new Error("Matched provider record lacks a cluster");
    if (
      !best ||
      pair.score > best.score ||
      (pair.score === best.score &&
        pair.distanceMeters < best.distanceMeters)
    ) {
      best = { ...pair, dataLabId };
    }
  }
  if (best) countyMatches.push({ countyId: county.stableExternalId, ...best });
}
const countyReviews = [
  independentReview.countyReview,
  independentReview.countyReviewPass2,
].filter(Boolean);
const reviewedCountyRepresented = new Set(
  countyReviews.flatMap((review) => review.alreadyProviderRepresented),
);
const reviewedCountyIneligible = new Set(
  countyReviews.flatMap((review) => review.likelyIneligibleIds),
);
const reviewedCountyOmissions = new Set(
  countyReviews.flatMap((review) => review.likelyEligibleGenuineOmissionIds),
);
const reviewedCountyUnresolved = new Set(
  countyReviews.flatMap((review) => review.unresolvedIds),
);
const matchedCountyIds = new Set([
  ...countyMatches.map((match) => match.countyId),
  ...reviewedCountyRepresented,
]);
const frozenCountyRosterIds = new Set([
  ...independentReview.countyReview.likelyEligibleGenuineOmissionIds,
  ...independentReview.countyReview.unresolvedIds,
  ...Object.values(independentReview.countyReviewPass2 ?? {})
    .filter(Array.isArray)
    .flat(),
]);
const countyChallenge = countyByEstablishment
  .filter((record) => frozenCountyRosterIds.has(record.stableExternalId))
  .map((record) => ({
    ...record,
    reviewReason: "plausible_restaurant_permit_unmatched_to_provider_union",
    reviewDecision: reviewedCountyRepresented.has(record.stableExternalId)
      ? "likely_eligible_already_provider_represented"
      : reviewedCountyIneligible.has(record.stableExternalId)
        ? "likely_ineligible"
        : reviewedCountyOmissions.has(record.stableExternalId)
          ? "likely_eligible_genuine_omission"
          : reviewedCountyUnresolved.has(record.stableExternalId)
            ? "unresolved"
            : "pending_independent_review",
    rank: stableRank(COUNTY_RANK_SEED, record.stableExternalId),
  }))
  .sort((a, b) => a.rank.localeCompare(b.rank) || a.stableExternalId.localeCompare(b.stableExternalId));
if (countyChallenge.length !== COUNTY_CHALLENGE_CAP) {
  throw new Error(
    `Frozen county challenge must contain ${COUNTY_CHALLENGE_CAP} rows; got ${countyChallenge.length}`,
  );
}

const ordinaryReview = selectedProviderClusters
  .filter(
    (cluster) =>
      !cluster.ambiguity &&
      cluster.proposedStatus !== "closed" &&
      !cluster.duplicateReviewRequired,
  )
  .map((cluster) => ({
    ...cluster,
    reviewRank: stableRank(REVIEW_RANK_SEED, cluster.dataLabId),
  }))
  .sort((a, b) => a.reviewRank.localeCompare(b.reviewRank))
  .slice(0, Math.ceil(selectedProviderClusters.length * 0.1));

const selectedAmbiguous = selectedProviderClusters.filter(
  (cluster) =>
    cluster.ambiguity ||
    cluster.duplicateReviewRequired,
);
const mandatoryIdentityReview = [
  ...clusters.filter(
    (cluster) => cluster.ambiguity || cluster.duplicateReviewRequired,
  ),
  ...closureLedger.filter(
    (closure) =>
      !closure.ambiguity && !closure.duplicateReviewRequired,
  ),
].sort((a, b) => a.dataLabId.localeCompare(b.dataLabId));

const reviewRoster = {
  schemaVersion: 1,
  snapshotDate: "2026-07-28",
  decision: "pending_independent_review",
  ambiguousClosureDuplicate: mandatoryIdentityReview,
  ordinaryTenPercent: ordinaryReview,
  countyOmissionChallenge: countyChallenge,
  closureLedger,
};

const frozenDevelopmentCohort = selectedProviderClusters.filter(
  (cluster) => !cluster.ambiguity && !cluster.duplicateReviewRequired,
);

const summary = {
  schemaVersion: 1,
  snapshotDate: "2026-07-28",
  decision:
    countyChallenge.some(
      (record) => record.reviewDecision === "pending_independent_review",
    )
      ? "stage1_reconciliation_pending_independent_review"
      : "stage1_accepted_unresolved_records_excluded",
  inputHashes: {
    boundary: fileSha256(boundaryPath),
    countyFrame: fileSha256(countyFramePath),
    ...Object.fromEntries(
      Object.entries(sourceFiles).map(([source, path]) => [source, fileSha256(path)]),
    ),
  },
  validation,
  providerInput: {
    totalRows: Object.values(sourceRows).reduce((sum, rows) => sum + rows.length, 0),
    selectableRows: providerRecords.length,
    excludedSeeFoodWithoutStableExternalId:
      sourceRows.seefood.filter((row) => !row.stableExternalId).length,
    excludedSeeFoodNotSelectionEligible:
      sourceRows.seefood.filter((row) => row.selectionEligible !== true).length,
    excludedOsmPublicBuilding:
      sourceRows.openstreetmap.filter(
        (row) => row.sourceCategory === "public_building",
      ).length,
  },
  reconciliation: {
    autoAcceptedPairs: acceptedPairs.length,
    independentlyReviewedAutomaticPairs:
      independentReview.automaticMatchAudit.audited,
    independentlyReviewedAutomaticPairErrors:
      independentReview.automaticMatchAudit.obviousIncorrect,
    independentReviewMergeGroups:
      independentReview.providerMergeGroups.length,
    independentReviewMergedRecordKeys:
      independentReview.providerMergeGroups.flat().length,
    ambiguousPairCandidates: ambiguousPairs.length,
    sameSourceDuplicatePairs: sameSourceDuplicatePairs.length,
    providerClustersBeforeCap: clusters.length,
    activeProviderClustersBeforeCap: activeClusters.length,
    unknownStatusIdentityCandidates: unknownStatusIdentityCandidates.length,
    closureLedger: closureLedger.length,
    specialClustersKept: specialClusters.length,
    providerClustersAfterCap: selectedProviderClusters.length,
    frozenDevelopmentCohort: frozenDevelopmentCohort.length,
    recordsInSelectedClusters: selectedProviderIds.size,
  },
  countyChallenge: {
    shareableEstablishments: countyByEstablishment.length,
    matchedOrReviewedProviderRepresented: matchedCountyIds.size,
    plausibleUnmatchedBeforeCap: countyByEstablishment.filter(
      (record) =>
        plausibleCountyRestaurant(record) &&
        !matchedCountyIds.has(record.stableExternalId),
    ).length,
    selectedForReview: countyChallenge.length,
    reviewedLikelyEligibleOmissions: countyChallenge.filter(
      (record) =>
        record.reviewDecision === "likely_eligible_genuine_omission",
    ).length,
    reviewedLikelyEligibleAlreadyRepresented: countyChallenge.filter(
      (record) =>
        record.reviewDecision === "likely_eligible_already_provider_represented",
    ).length,
    reviewedLikelyIneligible: countyChallenge.filter(
      (record) => record.reviewDecision === "likely_ineligible",
    ).length,
    reviewedUnresolved: countyChallenge.filter(
      (record) => record.reviewDecision === "unresolved",
    ).length,
    pendingIndependentReview: countyChallenge.filter(
      (record) => record.reviewDecision === "pending_independent_review",
    ).length,
  },
  reviewRoster: {
    ambiguousClosureDuplicate: mandatoryIdentityReview.length,
    activeAmbiguousDuplicate: selectedAmbiguous.length,
    unknownStatusAmbiguousDuplicate:
      mandatoryIdentityReview.filter(
        (cluster) => cluster.proposedStatus === "unknown",
      ).length,
    ordinaryTenPercent: ordinaryReview.length,
    countyOmissionChallenge: countyChallenge.length,
    closureLedger: closureLedger.length,
  },
  caveats: [
    "Automatic identity matches are candidate reconciliations until independently audited.",
    "Unknown operating status is not verified active status.",
    "Unknown-status clusters remain identity-only and are excluded from the active development cohort.",
    "County permits are an omission/status challenge and do not count as restaurants or coverage.",
    "No menu, photo, provenance, rights, or comparison coverage is created by Stage 1.",
  ],
};

mkdirSync(outputDirectory, { recursive: true });
const outputs = {
  "stage1-validation.json": validation,
  "temecula-source-summary.json": summary,
  "temecula-review-roster.json": reviewRoster,
};
for (const [name, value] of Object.entries(outputs)) {
  writeFileSync(
    resolve(outputDirectory, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
writeFileSync(
  resolve(outputDirectory, "temecula-reconciliation.jsonl"),
  `${clusters
    .sort((a, b) => a.dataLabId.localeCompare(b.dataLabId))
    .map((cluster) => JSON.stringify(cluster))
    .join("\n")}\n`,
);
writeFileSync(
  resolve(outputDirectory, "temecula-selected-provider-frame.jsonl"),
  `${selectedProviderClusters
    .sort((a, b) => a.dataLabId.localeCompare(b.dataLabId))
    .map((cluster) => JSON.stringify(cluster))
    .join("\n")}\n`,
);
writeFileSync(
  resolve(root, "data-lab/TEMECULA_DEVELOPMENT_COHORT.jsonl"),
  `${frozenDevelopmentCohort
    .sort((a, b) => a.dataLabId.localeCompare(b.dataLabId))
    .map((cluster) =>
      JSON.stringify({
        schemaVersion: 1,
        stablePublicId: cluster.dataLabId,
        publicName: cluster.publicName,
        addressLine: cluster.addressLine,
        city: cluster.city,
        state: cluster.state,
        postalCode: cluster.postalCode,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        businessType: cluster.businessType,
        chainIndependent: cluster.chainIndependent,
        websiteHost: cluster.websiteHost,
        status: cluster.proposedStatus,
        providerIds: cluster.providerIds,
        evidenceTimestamps: cluster.evidenceTimestamps,
        sourceLicenses: cluster.sourceLicenses,
      }),
    )
    .join("\n")}\n`,
);
writeFileSync(
  resolve(root, "data-lab/TEMECULA_STATUS_LEDGER.jsonl"),
  `${closureLedger
    .sort((a, b) => a.dataLabId.localeCompare(b.dataLabId))
    .map((cluster) =>
      JSON.stringify({
        schemaVersion: 1,
        stablePublicId: cluster.dataLabId,
        publicName: cluster.publicName,
        addressLine: cluster.addressLine,
        city: cluster.city,
        state: cluster.state,
        postalCode: cluster.postalCode,
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        status: cluster.proposedStatus,
        providerIds: cluster.providerIds,
        evidenceTimestamps: cluster.evidenceTimestamps,
        sourceLicenses: cluster.sourceLicenses,
      }),
    )
    .join("\n")}\n`,
);

console.log(JSON.stringify(summary, null, 2));
