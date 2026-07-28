#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const bundleDir = resolve(
  process.argv[2] ??
    "data-lab/raw/baseline/DL-007/main-thread-stage4",
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
const summary = json("target-summary.json");
const geography = json("candidate-geography.json");
const fixture = json("fixture-state-machine-results.json");
const behavioral = jsonl("behavioral-prompt-targets.jsonl");
const gold = jsonl("gold-comparison-targets.jsonl");
const sample = jsonl("blind-rights-only-sample.jsonl");
const attempts = jsonl("contribution-attempts.jsonl");
const receipts = jsonl("contribution-receipts.jsonl");
const reconciliation = jsonl("selection-reconciliation.jsonl");

const imageChecks = [];
for (const row of sample) {
  const image = read(row.evidence.file);
  const metadata = await sharp(image).metadata();
  imageChecks.push({
    file: row.evidence.file,
    hashMatches: sha256(image) === row.evidence.sha256,
    decodesAsWebp: metadata.format === "webp",
    metadataStripped:
      !metadata.exif && !metadata.icc && !metadata.xmp,
  });
}

const dishKey = (row) =>
  `${row.opaqueEntityId}|${row.opaqueMenuItemId}`;
const goldByDish = new Map(gold.map((row) => [dishKey(row), row]));
const sampleIntersection = gold.filter((row) => {
  const gate = row.goldGateEvidence;
  return (
    row.behavioralPromptCandidate &&
    gate.activeUsefulManagementPhoto &&
    gate.accessibleRecordedLocator &&
    gate.recordedSourceFamily &&
    Boolean(row.evidenceBasis.managementTrustLabel) &&
    gate.moderationApproved &&
    !gate.reviewedDisplayRights &&
    gate.exactOrExplicitItemLink &&
    gate.exactHashUniqueAtRestaurant &&
    gate.perceptualHashMeasured &&
    gate.noRecordedDuplicateParentOrReason &&
    gate.lacksVerifiedCustomerSameDish
  );
});

const assertions = {
  allListedHashesPass: checksumRows.every((row) => row.passed),
  suppliedChecksumHashMatches:
    sha256(read("SHA256SUMS")) ===
    "7256b48109d765573a9997d6e74f49d927da9e800ef53858c6a5c54fbb809833",
  exporterCommitMatches:
    manifest.exporterCommit ===
    "1a21d5520efc8494080fb35f40528b9840c2841a",
  readOnlySnapshotEvidence:
    manifest.transaction.before.read_only === "on" &&
    manifest.transaction.after.read_only === "on" &&
    manifest.transaction.before.isolation === "repeatable read" &&
    manifest.transaction.after.isolation === "repeatable read" &&
    manifest.transaction.before.snapshot_time ===
      manifest.transaction.after.snapshot_time &&
    manifest.transaction.terminalStatement === "ROLLBACK",
  rowCountsMatch:
    behavioral.length === manifest.rowCounts.targets &&
    gold.length === manifest.rowCounts.targets &&
    sample.length === manifest.rowCounts.sample &&
    attempts.length === manifest.rowCounts.attempts &&
    receipts.length === manifest.rowCounts.receipts &&
    reconciliation.length ===
      manifest.rowCounts.selectionReconciliation &&
    imageChecks.length === manifest.rowCounts.evidenceImages,
  summaryCountsMatch:
    behavioral.filter((row) => row.behavioralPromptCandidate).length ===
      summary.behavioralPromptCandidates &&
    gold.filter((row) => row.goldComparisonCandidate).length ===
      summary.goldComparisonCandidates &&
    sampleIntersection.length ===
      summary.behavioralPriorRightsOnlyIntersection,
  rostersJoin:
    behavioral.every((row) => {
      const paired = goldByDish.get(dishKey(row));
      return (
        paired &&
        paired.opaquePhotoId === row.opaquePhotoId &&
        paired.behavioralPromptCandidate ===
          row.behavioralPromptCandidate
      );
    }),
  sampleIsUniqueAndInIntersection:
    new Set(sample.map(dishKey)).size === sample.length &&
    new Set(sample.map((row) => row.opaquePhotoId)).size ===
      sample.length &&
    sample.every((row) =>
      sampleIntersection.some(
        (candidate) =>
          dishKey(candidate) === dishKey(row) &&
          candidate.opaquePhotoId === row.opaquePhotoId,
      ),
    ),
  reconciliationRowsAreUniqueAndSameSnapshot:
    new Set(
      reconciliation.map((row) => row.stableOpaqueDishJoin),
    ).size === reconciliation.length &&
    reconciliation.every(
      (row) => row.sameSnapshot === manifest.snapshotTime,
    ),
  allEvidenceDecodesHashesAndIsMetadataStripped:
    imageChecks.every(
      (row) =>
        row.hashMatches &&
        row.decodesAsWebp &&
        row.metadataStripped,
    ),
  aggregateGeographyOnly:
    geography.privacy?.startsWith("Aggregate only") === true,
  treatmentDisabled:
    summary.treatmentPromptEnabled === false &&
    summary.behavioralOrCoverageClaimAuthorized === false,
  noBehavioralResults: attempts.length === 0 && receipts.length === 0,
  fixtureIsNotPresentedAsProduction:
    fixture.fixtureOnly === true &&
    fixture.productionAttemptsUsed === 0 &&
    fixture.conversionOrCoverageClaim === false,
};

const output = {
  experiment: "DL-007",
  stage: 4,
  evaluatedAt: new Date().toISOString(),
  bundleDir,
  bundleSha256SumsHash: sha256(read("SHA256SUMS")),
  assertions,
  bundleIntegrityPassed: Object.values(assertions).every(Boolean),
  reproduced: {
    dishRows: gold.length,
    entities: new Set(gold.map((row) => row.opaqueEntityId)).size,
    behavioralCandidates: behavioral.filter(
      (row) => row.behavioralPromptCandidate,
    ).length,
    behavioralCandidateEntities: new Set(
      behavioral
        .filter((row) => row.behavioralPromptCandidate)
        .map((row) => row.opaqueEntityId),
    ).size,
    goldCandidates: gold.filter(
      (row) => row.goldComparisonCandidate,
    ).length,
    priorContractRightsOnlyPopulation:
      summary.priorContractRightsOnlyPopulation,
    behavioralPriorRightsOnlyIntersection: sampleIntersection.length,
    reconciliationRows: reconciliation.length,
    sampleRows: sample.length,
    sampleEntities: new Set(sample.map((row) => row.opaqueEntityId))
      .size,
    attempts: attempts.length,
    receipts: receipts.length,
  },
  independentAuditRequiredForClaims: true,
  interpretation: {
    conversionMeasurable: false,
    coverageImprovement: 0,
    treatmentMayBeEnabledFromThisBundleAlone: false,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!output.bundleIntegrityPassed) process.exitCode = 1;
