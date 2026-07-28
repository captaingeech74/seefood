#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const bundleDir = resolve(
  process.argv[2] ??
    "data-lab/raw/baseline/DL-007/main-thread-stage3",
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
const behavioral = jsonl("behavioral-prompt-targets.jsonl");
const gold = jsonl("gold-comparison-targets.jsonl");
const sample = jsonl("blind-rights-only-sample.jsonl");
const attempts = jsonl("contribution-attempts.jsonl");
const receipts = jsonl("contribution-receipts.jsonl");

const failCounts = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.flatMap((row) => row[field]))]
      .sort()
      .map((gate) => [
        gate,
        rows.filter((row) => row[field].includes(gate)).length,
      ]),
  );

const imageChecks = [];
for (const row of sample) {
  const image = read(row.evidence.file);
  const metadata = await sharp(image).metadata();
  imageChecks.push({
    rank: row.deterministicRank,
    file: row.evidence.file,
    hashMatches: sha256(image) === row.evidence.sha256,
    decodesAsWebp: metadata.format === "webp",
    width: metadata.width,
    height: metadata.height,
    hasExif: Boolean(metadata.exif),
    hasIcc: Boolean(metadata.icc),
    hasXmp: Boolean(metadata.xmp),
  });
}

const sampleRanks = sample.map((row) => row.deterministicRank);
const samplePhotos = new Set(sample.map((row) => row.opaquePhotoId));
const behavioralPriorRightsOnlyIntersection = gold.filter((row) => {
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
}).length;
const goldByDish = new Map(
  gold.map((row) => [
    `${row.opaqueEntityId}|${row.opaqueMenuItemId}`,
    row,
  ]),
);

const assertions = {
  allListedHashesPass: checksumRows.every((row) => row.passed),
  suppliedChecksumHashMatches:
    sha256(read("SHA256SUMS")) ===
    "e1dd7d08222b0f245ea740b9c8ac5e2288243d76d67971d48dbaf77f95e5e1dc",
  exporterCommitMatches:
    manifest.exporterCommit ===
    "51013a83716d85d246e4582e8778fc8c6a13b8c4",
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
    imageChecks.length === manifest.rowCounts.evidenceImages,
  summaryCountsMatch:
    behavioral.filter((row) => row.behavioralPromptCandidate).length ===
      summary.behavioralPromptCandidates &&
    gold.filter((row) => row.goldComparisonCandidate).length ===
      summary.goldComparisonCandidates &&
    gold.filter((row) =>
      row.goldFailedGates.includes("reviewedDisplayRights"),
    ).length === summary.recordedRightsFailures,
  behavioralAndGoldRowsJoin:
    behavioral.every((row) => {
      const paired = goldByDish.get(
        `${row.opaqueEntityId}|${row.opaqueMenuItemId}`,
      );
      return (
        paired &&
        paired.opaquePhotoId === row.opaquePhotoId &&
        paired.behavioralPromptCandidate ===
          row.behavioralPromptCandidate
      );
    }),
  sampleRowsJoinGoldRoster:
    sample.every((row) => {
      const paired = goldByDish.get(
        `${row.opaqueEntityId}|${row.opaqueMenuItemId}`,
      );
      return paired && paired.opaquePhotoId === row.opaquePhotoId;
    }),
  sampleRanksUniqueAndOrdered:
    new Set(sampleRanks).size === sample.length &&
    sampleRanks.every(
      (rank, index) => index === 0 || rank > sampleRanks[index - 1],
    ),
  samplePhotosUnique: samplePhotos.size === sample.length,
  allEvidenceDecodesAndMatches:
    imageChecks.every(
      (row) => row.hashMatches && row.decodesAsWebp,
    ),
  allEvidenceMetadataStripped:
    imageChecks.every(
      (row) => !row.hasExif && !row.hasIcc && !row.hasXmp,
    ),
  treatmentDisabled:
    summary.treatmentPromptEnabled === false &&
    summary.behavioralOrCoverageClaimAuthorized === false,
  noBehavioralResults: attempts.length === 0 && receipts.length === 0,
};

const output = {
  experiment: "DL-007",
  stage: 3,
  evaluatedAt: new Date().toISOString(),
  bundleDir,
  bundleSha256SumsHash: sha256(read("SHA256SUMS")),
  assertions,
  passed: Object.values(assertions).every(Boolean),
  reproduced: {
    dishRows: gold.length,
    entities: new Set(gold.map((row) => row.opaqueEntityId)).size,
    restaurants: new Set(gold.map((row) => row.opaqueRestaurantId))
      .size,
    behavioralCandidates: behavioral.filter(
      (row) => row.behavioralPromptCandidate,
    ).length,
    behavioralCandidateEntities: new Set(
      behavioral
        .filter((row) => row.behavioralPromptCandidate)
        .map((row) => row.opaqueEntityId),
    ).size,
    goldCandidates: gold.filter((row) => row.goldComparisonCandidate)
      .length,
    behavioralFailedGateCounts: failCounts(
      behavioral,
      "behavioralFailedGates",
    ),
    goldFailedGateCounts: failCounts(gold, "goldFailedGates"),
    priorContractRightsOnlyPopulation:
      summary.priorContractRightsOnlyPopulation,
    behavioralPriorRightsOnlyIntersection,
    stage2TopPhotoFirstRightsOnlyPopulation: 4876,
    selectionDifference: summary.priorContractRightsOnlyPopulation - 4876,
    sampleRows: sample.length,
    sampleEntities: new Set(sample.map((row) => row.opaqueEntityId))
      .size,
    sampleSourceFamilies: Object.fromEntries(
      [...new Set(sample.map((row) => row.evidenceBasis.managementSourceFamily))]
        .sort()
        .map((source) => [
          source,
          sample.filter(
            (row) =>
              row.evidenceBasis.managementSourceFamily === source,
          ).length,
        ]),
    ),
    attempts: attempts.length,
    receipts: receipts.length,
  },
  evidenceLimitations: [
    "The sample omits menu-item names and descriptions, so exact or strong visual item matching cannot be independently audited.",
    "Independent Management provenance, display rights, and near-duplicate review are false for every sampled row by construction.",
    "Cross-stage row-level reconciliation of the six-row selection difference is unavailable because Stage 2 and Stage 3 use different opaque seeds and no reconciliation ledger is supplied.",
  ],
  interpretation: {
    conversionMeasurable: false,
    coverageImprovement: 0,
    treatmentMayBeEnabledFromThisBundleAlone: false,
  },
};

console.log(JSON.stringify(output, null, 2));
if (!output.passed) process.exitCode = 1;
