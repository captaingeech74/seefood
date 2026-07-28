#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundleDir = resolve(
  process.argv[2] ??
    "data-lab/raw/baseline/DL-007/main-thread-stage5",
);
const commit = "16608802c1a6b40ed1515f81c4356fdbea24785e";
const read = (name) => readFileSync(resolve(bundleDir, name));
const json = (name) => JSON.parse(read(name).toString("utf8"));
const jsonl = (name) => {
  const body = read(name).toString("utf8").trim();
  return body ? body.split("\n").map((line) => JSON.parse(line)) : [];
};
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const gitShow = (file) =>
  execFileSync("git", ["show", `${commit}:${file}`], {
    encoding: "utf8",
  });

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
const parity = json("contract-parity.json");
const drift = json("cross-snapshot-drift.json");
const adversarial = json("isolated-adversarial-tests.json");
const geography = json("candidate-geography.json");
const roster = jsonl("canonical-target-roster.jsonl");
const reconciliation = jsonl("selector-reconciliation.jsonl");
const attempts = jsonl("contribution-attempts.jsonl");
const receipts = jsonl("contribution-receipts.jsonl");

const booleanAnd = (object) =>
  Object.values(object).every((value) => value === true);
const semanticMismatches = roster.filter(
  (row) =>
    row.canonicalContract.behavioral.eligible !==
      booleanAnd(row.canonicalContract.behavioral.gates) ||
    row.canonicalContract.eligible !==
      booleanAnd(row.canonicalContract.gates),
);
const serializationMismatches = roster.filter(
  (row) =>
    JSON.stringify(row.canonicalContract) !==
      JSON.stringify(row.directDatabaseContract) ||
    row.exactContractMatch !== true,
);

const runtimeSource = gitShow("src/lib/db.ts");
const exporterSource = gitShow(
  "scripts/export-datalab-dl007-stage5.mjs",
);
const revealSource = gitShow("src/components/Reveal.tsx");
const dbTestSource = gitShow("scripts/test-dl007-stage4-db.mjs");

const assertions = {
  allListedHashesPass: checksumRows.every((row) => row.passed),
  suppliedChecksumHashMatches:
    sha256(read("SHA256SUMS")) ===
    "251aa26687a9d18a187e5d602626ab1a396db82e291869c156f694bee0f55fe1",
  exporterCommitMatches: manifest.exporterCommit === commit,
  readOnlySnapshotEvidence:
    manifest.transaction.before.read_only === "on" &&
    manifest.transaction.after.read_only === "on" &&
    manifest.transaction.before.isolation === "repeatable read" &&
    manifest.transaction.after.isolation === "repeatable read" &&
    manifest.transaction.before.snapshot_time ===
      manifest.transaction.after.snapshot_time &&
    manifest.transaction.terminalStatement === "ROLLBACK",
  rowCountsMatch:
    roster.length === manifest.rowCounts.roster &&
    reconciliation.length === manifest.rowCounts.reconciliation &&
    attempts.length === manifest.rowCounts.attempts &&
    receipts.length === manifest.rowCounts.receipts,
  ranksAreContiguous:
    roster.every((row, index) => row.deterministicRank === index + 1),
  serializedDatabaseContractsMatch:
    serializationMismatches.length === 0 &&
    parity.comparedRows === roster.length &&
    parity.mismatchRows === 0,
  contractEligibilityEqualsNamedGateAnd:
    semanticMismatches.length === 0,
  treatmentAndClaimsDisabled:
    manifest.treatmentEnabled === false &&
    manifest.conversionOrCoverageClaimAuthorized === false,
  noBehavioralResults: attempts.length === 0 && receipts.length === 0,
  aggregateGeographyOnly:
    geography.privacy?.startsWith("Aggregate only") === true &&
    Object.values(geography.censusDivisions).reduce(
      (sum, value) => sum + value,
      0,
    ) === roster.length,
  driftIsReportedWithoutRowClaim:
    drift.delta === -31 && drift.rowLevelClaimMade === false,
  runtimeReadsDatabaseBehavioralKey:
    /contract\\?\\.behavioral\\s*\\?\\?/.test(runtimeSource),
  parityUsesIndependentRuntimeOrSecondDatabasePath:
    !/contract direct_contract/.test(exporterSource),
  selectorPopulationDeltaIsProven:
    reconciliation.length > 0 &&
    reconciliation.every(
      (row) =>
        row.oldPhotoContract &&
        row.canonicalContract &&
        typeof row.oldPhotoContract.eligible === "boolean" &&
        typeof row.canonicalContract.eligible === "boolean",
    ),
  adversarialEvidenceIsAssertionLevel:
    Array.isArray(adversarial.tests) &&
    adversarial.tests.length > 0,
  concurrentTerminalReviewIsTested:
    /Promise\\.allSettled[\\s\\S]{0,1200}review_contribution_photo/.test(
      dbTestSource,
    ),
  failedGoldComparisonEventAbsenceIsTested:
    /verified_comparison_created/.test(dbTestSource),
  allBindingFieldsAreMutatedInReplayTests:
    [
      "visitorId",
      "sessionId",
      "experimentKey",
      "variantKey",
      "surface",
      "targetClass",
    ].every((field) =>
      new RegExp(`\\.\\.\\.original,\\s*${field}:`).test(dbTestSource),
    ),
  nonOkUploadRotatesAttempt:
    /if\\s*\\(!res\\.ok\\)[\\s\\S]{0,300}contributionAttempts\\.current\\.delete/.test(
      revealSource,
    ),
};

const output = {
  experiment: "DL-007",
  stage: 5,
  evaluatedAt: new Date().toISOString(),
  bundleDir,
  bundleSha256SumsHash: sha256(read("SHA256SUMS")),
  assertions,
  bundleIntegrityPassed:
    assertions.allListedHashesPass &&
    assertions.suppliedChecksumHashMatches &&
    assertions.exporterCommitMatches &&
    assertions.readOnlySnapshotEvidence &&
    assertions.rowCountsMatch &&
    assertions.ranksAreContiguous,
  exitGatePassed: Object.values(assertions).every(Boolean),
  reproduced: {
    rosterRows: roster.length,
    entities: new Set(roster.map((row) => row.opaqueEntityId)).size,
    restaurants: new Set(
      roster.map((row) => row.opaqueRestaurantId),
    ).size,
    behavioralCandidates: roster.filter(
      (row) => row.canonicalContract.behavioral.eligible,
    ).length,
    behavioralCandidateEntities: new Set(
      roster
        .filter((row) => row.canonicalContract.behavioral.eligible)
        .map((row) => row.opaqueEntityId),
    ).size,
    goldCandidates: roster.filter(
      (row) => row.canonicalContract.eligible,
    ).length,
    serializationMismatches: serializationMismatches.length,
    semanticMismatches: semanticMismatches.length,
    reconciliationRows: reconciliation.length,
    attempts: attempts.length,
    receipts: receipts.length,
  },
  interpretation: {
    treatmentMayBeEnabled: false,
    livePilotAuthorized: false,
    conversionMeasurable: false,
    coverageImprovement: 0,
    furtherDl007PushRequested: false,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!output.exitGatePassed) process.exitCode = 1;
