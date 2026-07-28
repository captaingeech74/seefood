#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundleDir = resolve(
  process.argv[2] ??
    "data-lab/raw/baseline/DL-007/main-thread-stage1",
);

const readJson = (name) =>
  JSON.parse(readFileSync(resolve(bundleDir, name), "utf8"));
const readJsonl = (name) =>
  readFileSync(resolve(bundleDir, name), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const sha256 = (name) =>
  createHash("sha256")
    .update(readFileSync(resolve(bundleDir, name)))
    .digest("hex");
const asMillis = (value) =>
  Date.parse(value.replace(" ", "T").replace(/\+00$/, "Z"));
const uniqueNonNull = (rows, field) =>
  new Set(rows.map((row) => row[field]).filter(Boolean)).size;

const checksums = Object.fromEntries(
  readFileSync(resolve(bundleDir, "SHA256SUMS"), "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const [hash, name] = line.trim().split(/\s+/);
      return [name, hash];
    }),
);

const hashResults = Object.entries(checksums).map(([name, expected]) => ({
  name,
  expected,
  actual: sha256(name),
  passed: expected === sha256(name),
}));

const manifest = readJson("snapshot-manifest.json");
const declared = readJson("aggregates.json");
const eligibilityDefinition = readJson("eligibility-definition.json");
const gaps = readJson("instrumentation-gaps.json");
const events = readJsonl("app-events.jsonl");
const photos = readJsonl("first-party-contribution-photos.jsonl");
const entities = readJsonl("entity-contribution-eligibility.jsonl");

const snapshotMillis = asMillis(manifest.snapshotTime);
const windows = {
  allTime: Number.POSITIVE_INFINITY,
  days90: 90,
  days30: 30,
  days7: 7,
};

const inWindow = (row, days) =>
  days === Number.POSITIVE_INFINITY ||
  asMillis(row.createdAt) >= snapshotMillis - days * 86_400_000;

const recomputeWindow = (days) => {
  const windowEvents = events.filter((row) => inWindow(row, days));
  const windowPhotos = photos.filter((row) => inWindow(row, days));
  const appOpens = windowEvents.filter((row) => row.eventName === "app_open");
  const uploadEvents = windowEvents.filter(
    (row) => row.eventName === "photo_add",
  );
  const eligibleSuccessfulPhotos = windowPhotos.filter(
    (row) =>
      row.evaluationEligibleEntity &&
      row.active &&
      row.moderationStatus === "approved" &&
      ["user_upload", "user_suggested"].includes(row.source),
  );

  return {
    visits: appOpens.length,
    uniqueVisitors: uniqueNonNull(appOpens, "opaqueVisitorId"),
    sessions: uniqueNonNull(windowEvents, "opaqueSessionId"),
    uploadSessions: uniqueNonNull(uploadEvents, "opaqueSessionId"),
    successfulUploads: eligibleSuccessfulPhotos.length,
    successfulUploadEvents: uploadEvents.length,
    excludedTestFixtureContributionRecords: windowPhotos.filter(
      (row) => !row.evaluationEligibleEntity,
    ).length,
    uniqueContributors: uniqueNonNull(
      eligibleSuccessfulPhotos,
      "opaqueContributorId",
    ),
    dishDetailUploads: uploadEvents.filter(
      (row) => row.photoAddSurface === "dish_detail",
    ).length,
    missingDishUploads: uploadEvents.filter(
      (row) => row.photoAddSurface === "missing_dish",
    ).length,
    attachedUploads: eligibleSuccessfulPhotos.filter(
      (row) => row.attachedToCurrentMenu,
    ).length,
    comparisonReadyContributions: eligibleSuccessfulPhotos.filter(
      (row) => row.currentMechanicalComparisonReady,
    ).length,
    uniqueRestaurantsImproved: uniqueNonNull(
      eligibleSuccessfulPhotos.filter((row) => row.attachedToCurrentMenu),
      "opaqueEntityId",
    ),
  };
};

const recomputedWindows = Object.fromEntries(
  Object.entries(windows).map(([name, days]) => [
    name,
    recomputeWindow(days),
  ]),
);

const eligibilityTotals = {
  entities: entities.length,
  withCurrentMenu: entities.filter((row) => row.hasCurrentMenu).length,
  withManagementPhoto: entities.filter((row) => row.hasManagementPhoto).length,
  withDirectFirstPartyCustomerPhoto: entities.filter(
    (row) => row.hasDirectFirstPartyCustomerPhoto,
  ).length,
  withVerifiedCustomerPhoto: entities.filter(
    (row) => row.hasVerifiedCustomerPhoto,
  ).length,
  targetedContributionEligible: entities.filter(
    (row) => row.targetedContributionEligible,
  ).length,
};

const knownFixtureEntityIds = new Set(
  photos
    .filter((row) => !row.evaluationEligibleEntity)
    .map((row) => row.opaqueEntityId),
);
const knownFixtureEvents = events.filter((row) =>
  knownFixtureEntityIds.has(row.opaqueEntityId),
);
const remainingEvents = events.filter(
  (row) => !knownFixtureEntityIds.has(row.opaqueEntityId),
);
const remainingAppOpens = remainingEvents.filter(
  (row) => row.eventName === "app_open",
);

const assertions = {
  allListedHashesPass: hashResults.every((row) => row.passed),
  sourceRowCountsMatch:
    manifest.sourceRows.appEvents === events.length &&
    manifest.sourceRows.firstPartyContributionPhotos === photos.length &&
    manifest.sourceRows.entityEligibilityRows === entities.length,
  aggregateWindowsMatch:
    JSON.stringify(recomputedWindows) === JSON.stringify(declared.windows),
  eligibilityTotalsMatch:
    JSON.stringify(eligibilityTotals) ===
    JSON.stringify(eligibilityDefinition.totals),
  opaqueEntityIdsUnique:
    new Set(entities.map((row) => row.opaqueEntityId)).size === entities.length,
  targetDefinitionInternallyConsistent: entities.every(
    (row) =>
      row.targetedContributionEligible ===
      (row.hasCurrentMenu &&
        row.hasManagementPhoto &&
        !row.hasVerifiedCustomerPhoto),
  ),
  eventInventoryMatches:
    events.filter((row) => row.eventName === "app_open").length ===
      gaps.eventCounts.app_open &&
    events.filter((row) => row.eventName === "photo_view").length ===
      gaps.eventCounts.photo_view &&
    events.every((row) => ["app_open", "photo_view"].includes(row.eventName)),
  noEligibleContributionRecords: photos.every(
    (row) => !row.evaluationEligibleEntity,
  ),
  noSuccessfulUploadEvents: events.every(
    (row) => row.eventName !== "photo_add",
  ),
  readOnlySnapshotEvidence:
    manifest.transaction.begin.includes("READ ONLY") &&
    manifest.transaction.end === "ROLLBACK" &&
    manifest.transaction.readOnlyBefore === "on" &&
    manifest.transaction.readOnlyAfter === "on" &&
    manifest.transaction.walBefore === manifest.transaction.walAfter,
};

const result = {
  experiment: "DL-007",
  stage: 1,
  evaluatedAt: new Date().toISOString(),
  bundleDir,
  bundleSha256SumsHash: sha256("SHA256SUMS"),
  manifestMainCommit: manifest.mainCommit,
  counts: {
    events: events.length,
    photos: photos.length,
    entities: entities.length,
    eventTypes: Object.fromEntries(
      [...new Set(events.map((row) => row.eventName))]
        .sort()
        .map((name) => [
          name,
          events.filter((row) => row.eventName === name).length,
        ]),
    ),
    eligibilityTotals,
    recomputedWindows,
    knownFixtureContamination: {
      knownFixtureEntities: knownFixtureEntityIds.size,
      excludedEvents: knownFixtureEvents.length,
      excludedVisits: knownFixtureEvents.filter(
        (row) => row.eventName === "app_open",
      ).length,
      excludedPhotoViews: knownFixtureEvents.filter(
        (row) => row.eventName === "photo_view",
      ).length,
      remainingEventsUpperBound: remainingEvents.length,
      remainingVisitsUpperBound: remainingAppOpens.length,
      remainingVisitorsUpperBound: uniqueNonNull(
        remainingAppOpens,
        "opaqueVisitorId",
      ),
      remainingSessionsUpperBound: uniqueNonNull(
        remainingEvents,
        "opaqueSessionId",
      ),
      warning:
        "These are upper bounds, not verified real-user counts, because event rows do not carry entity status or an evaluation-eligibility flag.",
    },
  },
  assertions,
  passed: Object.values(assertions).every(Boolean),
  interpretation: {
    observedRealContributionPhotos: 0,
    observedImprovedRestaurants: 0,
    excludedTestFixturePhotos: photos.length,
    promptConversionCanBeEstimated: false,
    reason:
      "There are no prompt-impression, prompt-open, upload-start, cancel, or upload-failure events, so visits are not an exposure denominator.",
  },
};

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
