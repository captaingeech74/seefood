#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundleDir = resolve(
  process.argv[2] ??
    "data-lab/raw/baseline/DL-007/main-thread-stage2",
);

const read = (name) => readFileSync(resolve(bundleDir, name));
const json = (name) => JSON.parse(read(name).toString("utf8"));
const jsonl = (name) => {
  const body = read(name).toString("utf8").trim();
  return body ? body.split("\n").map((line) => JSON.parse(line)) : [];
};
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const checksumRows = read("SHA256SUMS")
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const [expected, name] = line.trim().split(/\s+/);
    const actual = sha256(read(name));
    return { name, expected, actual, passed: expected === actual };
  });

const manifest = json("snapshot-manifest.json");
const aggregates = json("aggregates.json");
const targetSummary = json("dish-target-summary.json");
const contract = json("instrumentation-contract.json");
const legacyEvents = jsonl("legacy-app-events.jsonl");
const attempts = jsonl("contribution-attempts.jsonl");
const funnelEvents = jsonl("contribution-funnel-events.jsonl");
const targets = jsonl("dish-target-roster.jsonl");

const failCounts = Object.fromEntries(
  [...new Set(targets.flatMap((row) => row.failedGates))]
    .sort()
    .map((gate) => [
      gate,
      targets.filter((row) => row.failedGates.includes(gate)).length,
    ]),
);

const eventCount = (eventName, trafficClass) =>
  legacyEvents.filter(
    (row) =>
      row.eventName === eventName &&
      (!trafficClass || row.trafficClass === trafficClass),
  ).length;

const onlyReviewedRightsFails = targets.filter(
  (row) =>
    row.failedGates.length === 1 &&
    row.failedGates[0] === "reviewedRights",
).length;

const assertions = {
  allListedHashesPass: checksumRows.every((row) => row.passed),
  suppliedChecksumHashMatches:
    sha256(read("SHA256SUMS")) ===
    "9405ffc06311a71b0a247ad4e0290abad1a51fd376405574de867f3538cec8a5",
  exporterCommitMatches:
    manifest.exporterCommit ===
    "ebda99f51dd094a697815caad52eacaeae156c79",
  readOnlySnapshotEvidence:
    manifest.transaction.before.read_only === "on" &&
    manifest.transaction.after.read_only === "on" &&
    manifest.transaction.before.isolation === "repeatable read" &&
    manifest.transaction.after.isolation === "repeatable read" &&
    manifest.transaction.before.snapshot_time ===
      manifest.transaction.after.snapshot_time &&
    manifest.transaction.terminalStatement === "ROLLBACK",
  rowCountsMatch:
    manifest.rowCounts.legacyAppEvents === legacyEvents.length &&
    manifest.rowCounts.contributionAttempts === attempts.length &&
    manifest.rowCounts.contributionFunnelEvents === funnelEvents.length &&
    manifest.rowCounts.dishTargetRoster === targets.length,
  deterministicRanksComplete:
    new Set(targets.map((row) => row.deterministicRank)).size ===
      targets.length &&
    Math.min(...targets.map((row) => row.deterministicRank)) === 1 &&
    Math.max(...targets.map((row) => row.deterministicRank)) ===
      targets.length,
  oneRowPerEntityDish:
    new Set(
      targets.map(
        (row) => `${row.opaqueEntityId}|${row.opaqueMenuItemId}`,
      ),
    ).size === targets.length,
  failedGateCountsMatch:
    JSON.stringify(failCounts) ===
    JSON.stringify(targetSummary.failedGateCounts),
  qualifiedCountMatches:
    targets.filter((row) => row.qualified).length ===
      targetSummary.qualifiedDishTargets &&
    targetSummary.qualifiedDishTargets ===
      manifest.rowCounts.qualifiedDishTargets,
  noBehavioralRows:
    attempts.length === 0 &&
    funnelEvents.length === 0 &&
    Object.values(aggregates.windows).every(
      (window) => Object.values(window).every((value) => value === 0),
    ),
  legacyCountsMatch:
    eventCount("app_open") === aggregates.legacyAppOpen.rows &&
    new Set(
      legacyEvents
        .filter((row) => row.eventName === "app_open")
        .map((row) => row.opaqueBrowserId),
    ).size === aggregates.legacyAppOpen.opaqueBrowserIds,
  historicalTrafficNotEligible: legacyEvents.every(
    (row) => !row.eligibleForBehavioralAnalysis,
  ),
  treatmentDisabled:
    contract.treatmentPromptEnabled === false &&
    contract.behavioralConversionClaimAuthorized === false &&
    contract.coverageClaimAuthorized === false,
};

const output = {
  experiment: "DL-007",
  stage: 2,
  evaluatedAt: new Date().toISOString(),
  bundleDir,
  bundleSha256SumsHash: sha256(read("SHA256SUMS")),
  assertions,
  passed: Object.values(assertions).every(Boolean),
  reproduced: {
    rosterRows: targets.length,
    entities: new Set(targets.map((row) => row.opaqueEntityId)).size,
    restaurants: new Set(targets.map((row) => row.opaqueRestaurantId))
      .size,
    qualifiedDishTargets: targets.filter((row) => row.qualified).length,
    failedGateCounts: failCounts,
    onlyReviewedRightsFails,
    attempts: attempts.length,
    funnelEvents: funnelEvents.length,
    legacyEvents: legacyEvents.length,
    appOpenRows: eventCount("app_open"),
    fixtureAppOpenRows: eventCount("app_open", "fixture"),
    publicUnverifiedAppOpenRows: eventCount(
      "app_open",
      "public_unverified",
    ),
    behaviorallyEligibleLegacyRows: legacyEvents.filter(
      (row) => row.eligibleForBehavioralAnalysis,
    ).length,
  },
  interpretation: {
    conversionMeasurable: false,
    coverageImprovement: 0,
    treatmentMayBeEnabled: false,
    reason:
      "There are no qualified targets or contribution attempts, and implementation review found unresolved target-linkage and terminal-review defects.",
  },
};

console.log(JSON.stringify(output, null, 2));
if (!output.passed) process.exitCode = 1;
