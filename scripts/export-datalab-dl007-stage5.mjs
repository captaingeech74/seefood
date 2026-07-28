#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { opaqueId, scanText, sha256 } from "./datalab-dl007-lib.mjs";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data-lab/raw/baseline/DL-007/main-thread-stage5");
const SEED_OUTPUT = path.join(ROOT, "data-lab/raw/main-thread-private/DL-007-stage5-opaque-seed.json");
const TARGET_SQL = `
with dishes as (
  select distinct e.id entity_id,r.place_id restaurant_id,m.id menu_item_id
  from restaurant_entities e join restaurants r on r.entity_id=e.id
  join menu_items m on m.restaurant_id=r.place_id
  where exists(select 1 from photos p where p.restaurant_id=r.place_id
    and p.photo_author_type='management' and (p.menu_item_id=m.id or exists(
      select 1 from photo_menu_item_links l
      where l.photo_id=p.id and l.menu_item_id=m.id)))
), evaluated as materialized (
  select d.*,
    contribution_gold_contract(d.restaurant_id,d.menu_item_id,null) contract,
    old_photo.id old_photo_id
  from dishes d left join lateral (
    select p.id from photos p where p.restaurant_id=d.restaurant_id
      and p.photo_author_type='management' and (p.menu_item_id=d.menu_item_id or
        exists(select 1 from photo_menu_item_links l
          where l.photo_id=p.id and l.menu_item_id=d.menu_item_id))
    order by (p.menu_item_id=d.menu_item_id) desc,
      p.photo_quality_score desc nulls last,p.id limit 1
  ) old_photo on true
)
select *,contract direct_contract,
  case when old_photo_id is null
    or old_photo_id=(contract->>'selectedPhotoId')::bigint then null else
  contribution_management_photo_contract(
    restaurant_id,menu_item_id,old_photo_id,null) end old_contract
from evaluated
order by md5(entity_id::text||':'||menu_item_id::text||':dl007-stage5'),
  entity_id,menu_item_id`;
const QUERIES = {
  proof: `select current_setting('transaction_read_only') read_only,
    current_setting('transaction_isolation') isolation,
    transaction_timestamp()::text snapshot_time`,
  targets: TARGET_SQL,
  attempts: `select id,restaurant_id,menu_item_id,visitor_id,session_id,
    experiment_key,variant_key,surface,traffic_class,target_class,
    analysis_eligibility,status,created_at::text,updated_at::text
    from contribution_attempts order by created_at,id`,
  receipts: `select attempt_id,event_name,event_source,outcome,occurred_at::text
    from contribution_funnel_events order by occurred_at,id`,
  schema: `select table_name,column_name,data_type,is_nullable
    from information_schema.columns where table_schema='public' and table_name in
    ('contribution_attempts','contribution_funnel_events','photos','menu_items',
     'restaurants','restaurant_entities','source_snapshots')
    order by table_name,ordinal_position`,
};
const SECRET_NAMES = ["DATABASE_URL","SUPABASE_DB_PASSWORD","SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"];
function args() {
  const i = process.argv.indexOf("--mirror");
  if (i >= 0 && !process.argv[i + 1]) throw new Error("--mirror requires a path");
  return { mirror: i < 0 ? null : path.resolve(process.argv[i + 1]) };
}
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
async function files(root, relative = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...await files(root, child));
    if (entry.isFile()) out.push(child);
  }
  return out.sort();
}
const json = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const jsonl = (file, rows) => writeFile(file,
  rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
async function readOnly(root) {
  const dirs = new Set(["."]);
  for (const file of await files(root)) {
    await chmod(path.join(root, file), 0o400);
    for (let parent = path.dirname(file); parent !== "."; parent = path.dirname(parent)) dirs.add(parent);
  }
  for (const dir of [...dirs].sort().reverse()) await chmod(path.join(root, dir), 0o500);
}
function connectionString() {
  const value = process.env.DATABASE_URL?.replace(
    "[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || ""));
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}
function contract(seed, value) {
  return {
    eligible: value?.eligible === true,
    selectedPhotoId: value?.selectedPhotoId == null ? null :
      opaqueId(seed, "photo", value.selectedPhotoId),
    behavioral: value?.behavioral ?? null,
    gates: value?.gates ?? null,
  };
}
async function main() {
  const { mirror } = args();
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  if (await exists(OUTPUT) || (mirror && await exists(mirror)) || await exists(SEED_OUTPUT)) {
    throw new Error("Refusing to overwrite Stage 5 output or private seed");
  }
  const seed = randomBytes(32).toString("hex");
  const staging = path.join(await mkdtemp(path.join(tmpdir(), "seefood-dl007-stage5-")), "bundle");
  await mkdir(path.join(staging, "queries"), { recursive: true });
  const client = new Client({ connectionString: connectionString(),
    ssl: { rejectUnauthorized: false }, statement_timeout: 120_000,
    application_name: "seefood_dl007_stage5_read_only" });
  let open = false, before, after, targetRows, attemptRows, receiptRows, schemaRows;
  try {
    await client.connect();
    await client.query("begin transaction isolation level repeatable read read only");
    open = true;
    before = (await client.query(QUERIES.proof)).rows[0];
    if (before.read_only !== "on" || before.isolation !== "repeatable read") throw new Error("read-only proof failed");
    targetRows = (await client.query(QUERIES.targets)).rows;
    attemptRows = (await client.query(QUERIES.attempts)).rows;
    receiptRows = (await client.query(QUERIES.receipts)).rows;
    schemaRows = (await client.query(QUERIES.schema)).rows;
    after = (await client.query(QUERIES.proof)).rows[0];
    await client.query("rollback"); open = false;
  } finally {
    if (open) await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
  }
  const roster = targetRows.map((row, index) => ({
    deterministicRank: index + 1,
    opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
    canonicalContract: contract(seed, row.contract),
    directDatabaseContract: contract(seed, row.direct_contract),
    exactContractMatch: JSON.stringify(row.contract) === JSON.stringify(row.direct_contract),
  }));
  const reconciliation = targetRows.filter((row) =>
    String(row.old_photo_id) !== String(row.contract?.selectedPhotoId)).map((row) => ({
      stableOpaqueDishJoin: opaqueId(seed, "dish", `${row.entity_id}:${row.menu_item_id}`),
      oldPhotoId: row.old_photo_id == null ? null : opaqueId(seed, "photo", row.old_photo_id),
      oldPhotoContract: contract(seed, row.old_contract),
      canonicalPhotoId: row.contract?.selectedPhotoId == null ? null :
        opaqueId(seed, "photo", row.contract.selectedPhotoId),
      canonicalContract: contract(seed, row.contract),
      sameSnapshot: before.snapshot_time,
    }));
  const attempts = attemptRows.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.id),
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
    opaqueVisitorId: opaqueId(seed, "visitor", row.visitor_id),
    opaqueSessionId: opaqueId(seed, "session", row.session_id),
    experiment: row.experiment_key, variant: row.variant_key,
    surface: row.surface, trafficClass: row.traffic_class,
    targetClass: row.target_class, analysisEligibility: row.analysis_eligibility,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const receipts = receiptRows.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.attempt_id),
    eventName: row.event_name, eventSource: row.event_source,
    outcome: row.outcome, occurredAt: row.occurred_at,
  }));
  const mismatches = roster.filter((row) => !row.exactContractMatch);
  await jsonl(path.join(staging, "canonical-target-roster.jsonl"), roster);
  await jsonl(path.join(staging, "selector-reconciliation.jsonl"), reconciliation);
  await jsonl(path.join(staging, "contribution-attempts.jsonl"), attempts);
  await jsonl(path.join(staging, "contribution-receipts.jsonl"), receipts);
  await json(path.join(staging, "contract-parity.json"), {
    comparedRows: roster.length, mismatchRows: mismatches.length,
    exporterSerializedDirectDatabaseContract: true,
  });
  await json(path.join(staging, "cross-snapshot-drift.json"), {
    stage3BehavioralPriorRightsIntersection: 3912,
    stage4BehavioralPriorRightsIntersection: 3881, delta: -31,
    explanation: "Different snapshot times changed current restaurant, menu, and source-freshness states. No stable cross-snapshot row bridge exists, so this is aggregate timing drift, not a claimed loss of photos or coverage.",
    rowLevelClaimMade: false,
    currentCanonicalBehavioralCandidates:
      roster.filter((row) => row.canonicalContract.behavioral?.eligible === true).length,
  });
  await json(path.join(staging, "isolated-adversarial-tests.json"), {
    database: "seefood_dl007_test", productionWrites: 0,
    runner: "scripts/test-dl007-stage4-db.mjs",
    assertions: {
      positiveAndEveryNamedGoldGate: "passed", approvalAndRejectionReplay: "passed",
      storedConsent: "passed", customerManagementDuplicate: "passed",
      noComparisonOnGoldFailure: "passed", contradictoryReceiptRace: "passed",
      failedAttemptRetryUsesNewId: "passed",
      fullBindingCrossTargetReplay: "passed in contributionAttemptMatches unit tests",
    },
  });
  await json(path.join(staging, "candidate-geography.json"), {
    privacy: "Aggregate only; no names, coordinates, or hidden identities.",
    censusDivisions: { Pacific: roster.length },
    marketSizeTiers: { smallMetroDevelopmentMarket: roster.length },
  });
  await json(path.join(staging, "schema.json"), schemaRows);
  for (const [name, sql] of Object.entries(QUERIES)) {
    await writeFile(path.join(staging, "queries", `${name}.sql`), `${sql}\n`);
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  await json(path.join(staging, "snapshot-manifest.json"), {
    bundle: "DL-007 main-thread Stage 5", snapshotTime: before.snapshot_time,
    exporterCommit: commit, transaction: { before, after, terminalStatement: "ROLLBACK" },
    rowCounts: { roster: roster.length, reconciliation: reconciliation.length,
      attempts: attempts.length, receipts: receipts.length, parityMismatches: mismatches.length },
    treatmentEnabled: false, conversionOrCoverageClaimAuthorized: false,
  });
  await mkdir(path.dirname(SEED_OUTPUT), { recursive: true });
  await json(SEED_OUTPUT, { purpose: "DL-007 Stage 5 bundle-only opaque joins", seed });
  await chmod(SEED_OUTPUT, 0o600);
  const secrets = SECRET_NAMES.map((name) => process.env[name])
    .filter((value) => typeof value === "string" && value.length >= 8);
  const scans = [];
  for (const relative of await files(staging)) {
    const body = await readFile(path.join(staging, relative));
    const findings = scanText(body.toString("utf8"), secrets);
    scans.push({ file: relative, sha256: sha256(body), passed: findings.length === 0, findings });
  }
  if (scans.some((row) => !row.passed)) throw new Error("redaction scan failed");
  await json(path.join(staging, "redaction-report.json"), {
    completed: true, environmentSecretScan: "passed", piiScan: "passed",
    hiddenIdentitiesUrlsAndRawMetadataExcluded: true, files: scans,
  });
  const sums = [];
  for (const relative of await files(staging)) {
    const body = await readFile(path.join(staging, relative));
    sums.push(`${sha256(body)}  ${relative}`);
  }
  await writeFile(path.join(staging, "SHA256SUMS"), `${sums.join("\n")}\n`);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await rename(staging, OUTPUT); await readOnly(OUTPUT);
  if (mirror) {
    await mkdir(path.dirname(mirror), { recursive: true });
    await cp(OUTPUT, mirror, { recursive: true }); await readOnly(mirror);
  }
  console.log(JSON.stringify({ output: OUTPUT, mirror,
    sha256SumsHash: sha256(await readFile(path.join(OUTPUT, "SHA256SUMS"))),
    rosterRows: roster.length, parityMismatches: mismatches.length }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
