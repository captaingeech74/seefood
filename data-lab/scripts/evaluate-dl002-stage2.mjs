#!/usr/bin/env node

import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const bundle = resolve(
  root,
  "data-lab/raw/baseline/DL-002/main-thread-stage2",
);
const output = resolve(
  root,
  "data-lab/artifacts/DL-002/stage2/structural-evaluation.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values);
}

function percent(count, denominator) {
  return Math.round((count / denominator) * 1000) / 10;
}

const checksumLines = readFileSync(resolve(bundle, "SHA256SUMS"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const checksumResults = checksumLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert(match, `Invalid SHA256SUMS line: ${line}`);
  const [, expected, relativePath] = match;
  const path = resolve(bundle, relativePath);
  assert(existsSync(path), `Missing checksummed file: ${relativePath}`);
  const actual = sha256(readFileSync(path));
  return { relativePath, expected, actual, matches: actual === expected };
});
assert(
  checksumResults.every((result) => result.matches),
  "One or more bundle hashes failed",
);

const snapshot = readJson(resolve(bundle, "snapshot.json"));
const readProof = readJson(resolve(bundle, "production-read-proof.json"));
const redaction = readJson(resolve(bundle, "redaction-log.json"));
const coverage = readJson(resolve(bundle, "baseline-coverage-metrics.json"));
const stage2Hashes = readJson(
  resolve(root, "data-lab/raw/holdout/national-v1-stage2-hashes.json"),
);
const entities = readJsonl(resolve(bundle, "baseline-entities.jsonl"));
const menus = readJsonl(resolve(bundle, "baseline-menu-items.jsonl"));
const photos = readJsonl(resolve(bundle, "baseline-photo-records.jsonl"));
const claims = readJsonl(resolve(bundle, "baseline-comparison-claims.jsonl"));
const evidence = readJsonl(
  resolve(bundle, "evidence/gold-photo-evidence.jsonl"),
);
const controls = readJson(resolve(bundle, "evidence/rich-unpaired-controls.json"));

const temecula = entities.filter(
  (row) =>
    row.cohort === "temecula_development" && row.selectionRole === "selected",
);
const national = entities.filter(
  (row) => row.cohort === "national_hidden" && row.selectionRole === "selected",
);
const alternates = entities.filter(
  (row) =>
    row.cohort === "national_hidden" &&
    row.selectionRole === "registered_alternate_not_in_denominator",
);
assert(temecula.length === 396, `Expected 396 Temecula rows; got ${temecula.length}`);
assert(national.length === 120, `Expected 120 national rows; got ${national.length}`);
assert(alternates.length === 12, `Expected 12 alternates; got ${alternates.length}`);
assert(
  national.every((row) => row.publicName == null && row.publicStatus == null),
  "Hidden national rows leak a name or status",
);

const selectedHashes = new Set(stage2Hashes.selectedStablePublicIdSha256);
const alternateHashes = new Set(stage2Hashes.alternateStablePublicIdSha256);
assert(
  national.every((row) => selectedHashes.has(row.publicIdentityHash)),
  "A national selected row is not in the registered hash handoff",
);
assert(
  alternates.every((row) => alternateHashes.has(row.publicIdentityHash)),
  "A national alternate is not in the registered hash handoff",
);
assert(
  unique(national.map((row) => row.publicIdentityHash)).size === 120,
  "National selected hashes are not unique",
);
assert(
  unique(alternates.map((row) => row.publicIdentityHash)).size === 12,
  "National alternate hashes are not unique",
);

const cohortRows = readJsonl(
  resolve(root, "data-lab/TEMECULA_DEVELOPMENT_COHORT.jsonl"),
);
const cohortHashes = new Set(
  cohortRows.map((row) => sha256(Buffer.from(row.stablePublicId, "utf8"))),
);
assert(
  temecula.every((row) => cohortHashes.has(row.publicIdentityHash)),
  "A Temecula row is not in the frozen development cohort",
);

const evidenceIds = unique(evidence.map((row) => row.evidenceId));
assert(evidenceIds.size === 320, "Evidence IDs are not unique or do not total 320");
const referencedEvidenceIds = unique(claims.flatMap((claim) => claim.photoEvidenceIds));
const evidenceById = new Map(evidence.map((row) => [row.evidenceId, row]));
const claimEntityIds = unique(
  [...referencedEvidenceIds].map((id) => evidenceById.get(id)?.entityId).filter(Boolean),
);
assert(
  [...referencedEvidenceIds].every((id) => evidenceIds.has(id)),
  "A claim references missing evidence",
);
const imageFiles = readdirSync(resolve(bundle, "evidence/images"))
  .filter((name) => name.endsWith(".webp"))
  .sort();
const accessibleEvidence = evidence.filter(
  (row) => row.accessibilityAndRenderedEvidence.accessible === true,
);
assert(accessibleEvidence.length === 214, "Expected 214 accessible evidence rows");
assert(imageFiles.length === 214, "Expected 214 rendered image files");
assert(
  accessibleEvidence.every((row) =>
    existsSync(resolve(bundle, row.accessibilityAndRenderedEvidence.file)),
  ),
  "An accessible evidence row lacks its local render",
);
assert(
  evidence.length - accessibleEvidence.length === 106,
  "Expected 106 unverifiable evidence rows",
);

const queryText = readFileSync(resolve(bundle, "queries.sql"), "utf8");
const forbiddenSql = /\b(?:insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy)\b/i;
assert(!forbiddenSql.test(queryText), "queries.sql contains a write/DDL keyword");
assert(
  /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/i.test(queryText),
  "queries.sql lacks forced read-only transaction",
);
assert(/\bROLLBACK;\s*$/i.test(queryText), "queries.sql does not end in ROLLBACK");
assert(readProof.transaction.transactionReadOnly === "on", "Read-only proof is off");
assert(readProof.transaction.endedWith === "ROLLBACK", "Read proof did not roll back");
assert(redaction.result === "passed", "Redaction result did not pass");
assert(snapshot.clearNationalManifestAccessed === false, "Exporter accessed clear holdout");
assert(snapshot.counts.goldEvidencePhotos === 320, "Snapshot evidence count mismatch");

const rungKeys = [
  "menuCoverage",
  "basicPhotoCoverage",
  "basicMenuPhotoCoverage",
  "twentyPercentMenuPhotoCoverage",
  "fiftyPercentMenuPhotoCoverage",
  "comparisonCoverage",
];
function rungSummary(rows, denominator = rows.length) {
  return Object.fromEntries(
    rungKeys.map((key) => {
      const count = rows.filter((row) => row.claimedCoverageFlags[key] === true).length;
      return [key, { count, percentage: percent(count, denominator) }];
    }),
  );
}

const currentMenuRows = menus.filter(
  (row) => row.active === true && row.lastObservedDate >= "2026-06-28",
);
const currentMenuEntities = unique(currentMenuRows.map((row) => row.entityId));
const currentMenuKeysByEntity = new Map();
for (const row of currentMenuRows) {
  const keys = currentMenuKeysByEntity.get(row.entityId) ?? new Set();
  keys.add(row.dishKey);
  currentMenuKeysByEntity.set(row.entityId, keys);
}
const activeUsefulPhotos = photos.filter(
  (row) =>
    row.state.active === true &&
    row.state.useful === true &&
    row.state.storefront !== true &&
    row.state.menuPhoto !== true,
);
const currentMenuAttachmentRows = [...currentMenuKeysByEntity].map(
  ([entityId, menuKeys]) => {
    const attachedPhotos = activeUsefulPhotos.filter(
      (photo) =>
        photo.entityId === entityId &&
        photo.attachedDishKeys.some((key) => menuKeys.has(key)),
    );
    const matchedDishKeys = unique(
      attachedPhotos.flatMap((photo) =>
        photo.attachedDishKeys.filter((key) => menuKeys.has(key)),
      ),
    );
    return {
      entityId,
      menuCount: menuKeys.size,
      matchedPhotoCount: unique(attachedPhotos.map((photo) => photo.photoId)).size,
      matchedDishCount: matchedDishKeys.size,
    };
  },
);
const aboveFoldCurrentMenuCandidates = currentMenuAttachmentRows.filter(
  (row) => row.matchedPhotoCount >= 7,
);
const twentyPercentCurrentMenuCandidates =
  aboveFoldCurrentMenuCandidates.filter(
    (row) => row.matchedDishCount >= Math.ceil(row.menuCount * 0.2),
  );
const fiftyPercentCurrentMenuCandidates =
  aboveFoldCurrentMenuCandidates.filter(
    (row) => row.matchedDishCount >= Math.ceil(row.menuCount * 0.5),
  );
const claimedUsefulPhotoEntities = unique(
  photos
    .filter(
      (row) =>
        row.state.active === true &&
        row.state.useful === true &&
        row.state.storefront !== true &&
        row.state.menuPhoto !== true,
    )
    .map((row) => row.entityId),
);
const photoSummary = {
  rows: photos.length,
  activeRows: photos.filter((row) => row.state.active === true).length,
  withRecordedLocator: photos.filter(
    (row) => row.accessibilityEvidence === "existing_recorded_locator_present",
  ).length,
  declaredManagementRows: photos.filter(
    (row) => row.declaredAuthorType === "management",
  ).length,
  declaredCustomerRows: photos.filter(
    (row) => row.declaredAuthorType === "customer",
  ).length,
  reviewedRightsRows: photos.filter((row) => row.rightsStatus !== "unreviewed").length,
  declaredManagementUsefulEntities: unique(
    photos
      .filter(
        (row) =>
          row.declaredAuthorType === "management" &&
          row.state.active === true &&
          row.state.useful === true,
      )
      .map((row) => row.entityId),
  ).size,
  declaredManagementMatchedEntities: unique(
    photos
      .filter(
        (row) =>
          row.declaredAuthorType === "management" &&
          row.state.active === true &&
          row.state.useful === true &&
          row.attachedDishKeys.length > 0,
      )
      .map((row) => row.entityId),
  ).size,
  declaredCustomerUsefulEntities: unique(
    photos
      .filter(
        (row) =>
          row.declaredAuthorType === "customer" &&
          row.state.active === true &&
          row.state.useful === true,
      )
      .map((row) => row.entityId),
  ).size,
  declaredCustomerMatchedEntities: unique(
    photos
      .filter(
        (row) =>
          row.declaredAuthorType === "customer" &&
          row.state.active === true &&
          row.state.useful === true &&
          row.attachedDishKeys.length > 0,
      )
      .map((row) => row.entityId),
  ).size,
};
const currentMenuAndDeclaredManagement = [...currentMenuEntities].filter((entityId) =>
  photos.some(
    (row) =>
      row.entityId === entityId &&
      row.declaredAuthorType === "management" &&
      row.state.active === true &&
      row.state.useful === true &&
      row.state.storefront !== true &&
      row.state.menuPhoto !== true,
  ),
);
const currentMenuAndDeclaredMatchedManagement = [
  ...currentMenuEntities,
].filter((entityId) =>
  photos.some(
    (row) =>
      row.entityId === entityId &&
      row.declaredAuthorType === "management" &&
      row.state.active === true &&
      row.state.useful === true &&
      row.state.storefront !== true &&
      row.state.menuPhoto !== true &&
      row.attachedDishKeys.length > 0,
  ),
);
const accessibleManagementEvidence = accessibleEvidence.filter(
  (row) => row.declaredAuthorType === "management",
);
const accessibleCustomerEvidence = accessibleEvidence.filter(
  (row) => row.declaredAuthorType === "customer",
);
const externallyReadEvidence = accessibleEvidence.filter(
  (row) =>
    row.accessibilityAndRenderedEvidence.mechanism ===
    "existing_recorded_source_http_read",
);

const result = {
  schemaVersion: 1,
  decision: "revise_baseline_established",
  bundleSha256: sha256(
    Buffer.from(
      checksumResults.map((row) => `${row.expected}  ${row.relativePath}`).join("\n"),
      "utf8",
    ),
  ),
  integrity: {
    checksummedFiles: checksumResults.length,
    allHashesMatch: true,
    redactionPassed: true,
    readOnlyTransaction: readProof.transaction,
    productionParityExact: coverage.productionEntitySemanticParity.exact,
    stage2HashHandoffSha256: snapshot
      .productionReadProofSha256 ?? readProof.inputProof.stage2HashFileSha256,
    clearNationalManifestAccessed: false,
  },
  cohorts: {
    temeculaSelected: temecula.length,
    temeculaProductionMatches: temecula.filter(
      (row) => row.productionMatch.matched === true,
    ).length,
    nationalSelected: national.length,
    nationalProductionMatches: national.filter(
      (row) => row.productionMatch.matched === true,
    ).length,
    nationalAlternates: alternates.length,
    exporterDenominator: temecula.length + national.length,
    benchmarkActiveDenominator: temecula.length + 108,
    nationalStatusSentinels: 12,
  },
  claimedCoverage: {
    combinedActive: rungSummary([...temecula, ...national], temecula.length + 108),
    temecula: rungSummary(temecula),
    nationalHiddenActive: rungSummary(national, 108),
  },
  benchmarkLadderClaimCorrections: {
    identifiedActiveRestaurants: {
      count: 504,
      percentage: 100,
    },
    usefulFoodPhotoAtLeastOne: {
      count: claimedUsefulPhotoEntities.size,
      percentage: percent(claimedUsefulPhotoEntities.size, 504),
    },
    knownCurrentMenu: {
      count: currentMenuEntities.size,
      percentage: percent(currentMenuEntities.size, 504),
    },
    currentMenuAttachmentCandidateAboveFold: {
      count: aboveFoldCurrentMenuCandidates.length,
      percentage: percent(aboveFoldCurrentMenuCandidates.length, 504),
    },
    currentMenuAttachmentCandidateTwentyPercent: {
      count: twentyPercentCurrentMenuCandidates.length,
      percentage: percent(twentyPercentCurrentMenuCandidates.length, 504),
    },
    currentMenuAttachmentCandidateFiftyPercent: {
      count: fiftyPercentCurrentMenuCandidates.length,
      percentage: percent(fiftyPercentCurrentMenuCandidates.length, 504),
    },
    claimedComparisonReady: {
      count: 6,
      percentage: percent(6, 504),
    },
    verifiedComparisonReady: {
      count: 0,
      percentage: 0,
      disposition: {
        claimedDishes: 21,
        guardianUnverifiable: 21,
        adversarialDuplicateRejectCandidates: 6,
        adversarialRemainingUnverifiable: 15,
        evaluatorDisagreement:
          "Guardian retained all missing-Customer claims as unverifiable; Adversarial Verifier rejected six from stored cross-author perceptual-duplicate evidence.",
      },
    },
    note:
      "Rungs 2 and 4-6 remain claimed attachment candidates until visual item, usefulness, provenance, rights, accessibility, and duplicate audits pass.",
  },
  strategicManagementClaim: {
    currentMenuAndAtLeastOneDeclaredManagementPhoto: {
      count: currentMenuAndDeclaredManagement.length,
      percentage: percent(currentMenuAndDeclaredManagement.length, 504),
    },
    currentMenuAndAtLeastOneDeclaredMatchedManagementPhoto: {
      count: currentMenuAndDeclaredMatchedManagement.length,
      percentage: percent(
        currentMenuAndDeclaredMatchedManagement.length,
        504,
      ),
    },
    status: "claimed_not_visually_verified",
  },
  menuEvidence: {
    rows: menus.length,
    currentActiveRows: currentMenuRows.length,
    currentMenuEntities: currentMenuEntities.size,
  },
  photoEvidence: photoSummary,
  goldPacket: {
    claimedDishes: claims.length,
    distinctClaimIds: unique(claims.map((row) => row.guardianClaimId)).size,
    claimEntities: claimEntityIds.size,
    richUnpairedControls: controls.length,
    evidenceEntities: unique(evidence.map((row) => row.entityId)).size,
    evidencePhotos: evidence.length,
    renderedPhotos: accessibleEvidence.length,
    unverifiablePhotos: evidence.length - accessibleEvidence.length,
    renderedManagementPhotos: accessibleManagementEvidence.length,
    renderedCustomerPhotos: accessibleCustomerEvidence.length,
    externallyReadPhotos: externallyReadEvidence.length,
    referencedByClaims: referencedEvidenceIds.size,
    rightsStatusCounts: Object.fromEntries(
      [...unique(evidence.map((row) => row.rightsStatus))]
        .sort()
        .map((status) => [
          status,
          evidence.filter((row) => row.rightsStatus === status).length,
        ]),
    ),
  },
  independentAudit: {
    guardianDecision: "Revise",
    guardianReviewSha256:
      "117523ff21aa2faf358a31597482930f4f2035e7f487e13515342a2c3099452c",
    statusSentinels: {
      total: 12,
      assessable: 0,
      result: "unverifiable",
    },
    renderedItemMatch: {
      exact: 175,
      strong: 0,
      weak: 0,
      reject: 39,
      unverifiable: 106,
      successes: 175,
      audited: 214,
      pointPercentage: 81.78,
      wilson95: [76.06, 86.37],
    },
    usefulFoodRecords: 171,
    provenance: {
      verifiedManagement: 214,
      verifiedCustomer: 0,
      unknown: 106,
      managementPointPercentage: 100,
      managementWilson95: [98.24, 100],
      customerPrecision: "not_meaningful_zero_accessible_customer_photos",
    },
    sourceBreakdown: {
      doordash: {
        total: 168,
        exactItemMatch: 168,
        usefulFood: 164,
        verifiedManagementProvenance: 168,
      },
      schemaOrg: {
        total: 52,
        rendered: 46,
        exactItemMatch: 7,
        rejectItemMatch: 39,
        unverifiable: 6,
        usefulFood: 7,
        verifiedManagementProvenance: 46,
      },
      google: {
        total: 100,
        rendered: 0,
        unverifiable: 100,
        verifiedCustomerProvenance: 0,
      },
    },
    duplicateFailures: {
      exactRedundantRecords: 1,
      nearDuplicateRedundantRecords: 7,
    },
    richUnpairedControls: {
      temeculaAudited: 25,
      nationalAudited: 0,
      verifiedFalseNegatives: 0,
      unverifiableForMissingCustomer: 17,
      noCustomerCandidate: 8,
    },
  },
  caveats: [
    "Full-cohort photo and attachment rungs remain claimed; independent Guardian results are reported separately.",
    "The exporter incorrectly used all 120 national records in the content denominator. Benchmark percentages use 108 active national records plus 396 Temecula records (504 total); 12 national closure sentinels are scored separately.",
    "The exporter labeled seven-photo coverage as the second benchmark rung; the actual at-least-one useful-photo claim is 150 restaurants.",
    "No hidden national selected record matched a production entity, so every national claimed content rung is zero.",
    "All 12,911 production photo records and all 320 gold evidence records have rightsStatus=unreviewed.",
    "None of the 100 Customer evidence photos was locally renderable; all 214 rendered photos were declared Management.",
    "All 214 rendered images were fetched through already-recorded source locators under the bounded evidence cap; this is allowed by Benchmark Specification version 0.2.",
    "The gold packet can verify or reject all claimed comparisons and inspect false negatives, but it cannot fully visually audit every claimed rung-2-through-rung-6 restaurant.",
  ],
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
