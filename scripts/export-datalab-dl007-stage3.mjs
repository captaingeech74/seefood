#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import sharp from "sharp";
import { opaqueId, scanText, sha256 } from "./datalab-dl007-lib.mjs";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data-lab/raw/baseline/DL-007/main-thread-stage3");
const SEED_OUTPUT = path.join(ROOT, "data-lab/raw/main-thread-private/DL-007-stage3-opaque-seed.json");
const RIGHTS = ["approved", "granted", "licensed", "first_party_authorized"];
const SECRET_NAMES = ["DATABASE_URL", "SUPABASE_DB_PASSWORD", "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

const QUERIES = {
  proof: `select current_setting('transaction_read_only') read_only,
    current_setting('transaction_isolation') isolation,
    transaction_timestamp()::text snapshot_time`,
  targets: `
with photo_candidates as (
  select e.id entity_id, e.status entity_status, e.operating_status,
    r.place_id restaurant_id, r.status restaurant_status,
    m.id menu_item_id, m.canonical_dish_id, m.active menu_active,
    m.missing_streak menu_missing_streak, m.last_seen_at::text menu_last_seen_at,
    m.source menu_source, m.source_snapshot_id menu_snapshot_id,
    ms.status menu_snapshot_status, ms.completed_at::text menu_snapshot_completed_at,
    p.id photo_id, p.active photo_active, p.photo_author_type,
    p.source photo_source, p.source_platform, p.trust_label,
    p.source_snapshot_id photo_snapshot_id, ps.status photo_snapshot_status,
    ps.completed_at::text photo_snapshot_completed_at,
    p.first_seen_at::text photo_first_seen_at, p.last_seen_at::text photo_last_seen_at,
    p.moderation_status, p.rights_status, p.rights_scope,
    p.is_orderable photo_orderable, p.is_storefront, p.is_menu_photo,
    p.storage_url, p.origin_url,
    p.content_hash is not null has_content_hash,
    p.perceptual_hash is not null has_perceptual_hash,
    p.duplicate_review_status, p.duplicate_of_photo_id is not null has_duplicate_parent,
    p.dedupe_reason is not null has_dedupe_reason,
    p.menu_item_id = m.id direct_item_link,
    exists(select 1 from photo_menu_item_links l
      where l.photo_id=p.id and l.menu_item_id=m.id) explicit_item_link,
    count(*) over(partition by p.restaurant_id,p.content_hash) exact_hash_rows,
    count(*) over(partition by p.restaurant_id,p.perceptual_hash) perceptual_hash_rows,
    count(*) over(partition by e.id,m.id) candidate_photo_count,
    exists(
      select 1 from restaurants cr join photos cp on cp.restaurant_id=cr.place_id
      where cr.entity_id=e.id and cp.active and cp.photo_author_type='customer'
        and cp.moderation_status='approved' and cp.rights_status='user_granted'
        and cp.rights_version='customer-photo-rights-v1'
        and cp.rights_scope='display_with_dish' and cp.published_at is not null
        and cp.item_match_status in ('exact','strong')
        and cp.duplicate_review_status='unique'
        and (cp.menu_item_id=m.id or
          (m.canonical_dish_id is not null and cp.canonical_dish_id=m.canonical_dish_id))
    ) has_verified_customer,
    row_number() over(partition by e.id,m.id order by
      (p.active and p.moderation_status='approved'
        and not coalesce(p.is_storefront,false)
        and not coalesce(p.is_menu_photo,false)
        and (p.storage_url is not null or p.origin_url is not null)
        and (p.menu_item_id=m.id or exists(select 1 from photo_menu_item_links l
          where l.photo_id=p.id and l.menu_item_id=m.id))) desc,
      (p.rights_status in ('approved','granted','licensed','first_party_authorized')) desc,
      p.photo_quality_score desc nulls last, p.id
    ) selected_rank
  from restaurant_entities e
  join restaurants r on r.entity_id=e.id
  join menu_items m on m.restaurant_id=r.place_id and m.active
  join photos p on p.restaurant_id=r.place_id
    and p.photo_author_type='management'
    and (p.menu_item_id=m.id or exists(select 1 from photo_menu_item_links l
      where l.photo_id=p.id and l.menu_item_id=m.id))
  left join source_snapshots ms on ms.id=m.source_snapshot_id
  left join source_snapshots ps on ps.id=p.source_snapshot_id
)
select * from photo_candidates where selected_rank=1
order by md5(entity_id::text||':'||menu_item_id::text||':dl007-stage3'),
  entity_id,menu_item_id`,
  attempts: `select id,restaurant_id,menu_item_id,experiment_key,variant_key,surface,
    traffic_class,target_class,status,created_at::text
    from contribution_attempts order by created_at,id`,
  receipts: `select attempt_id,event_name,event_source,outcome,occurred_at::text
    from contribution_funnel_events order by occurred_at,id`,
  schema: `select table_name,column_name,data_type,is_nullable
    from information_schema.columns where table_schema='public' and table_name in
    ('contribution_attempts','contribution_funnel_events','photos','menu_items',
     'restaurants','restaurant_entities','source_snapshots')
    order by table_name,ordinal_position`,
};

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
async function json(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
async function jsonl(file, rows) {
  await writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}
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
    "[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "")
  );
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}
function behavioral(row, snapshot) {
  const fresh = new Date(row.menu_last_seen_at).getTime() >=
    new Date(snapshot).getTime() - 30 * 86_400_000;
  return {
    activeRestaurantAndEntity: row.restaurant_status === "active" && row.entity_status === "active",
    operatingStatusNotClosed: !["closed", "permanently_closed"].includes(row.operating_status ?? ""),
    currentObservationWithin30Days: fresh,
    orderabilityEvidence: row.menu_active && Number(row.menu_missing_streak) === 0,
    stableMenuItemId: Number.isSafeInteger(Number(row.menu_item_id)),
  };
}
function gold(row, behavior) {
  return {
    ...behavior,
    activeUsefulManagementPhoto: row.photo_active && row.photo_orderable !== false &&
      !row.is_storefront && !row.is_menu_photo,
    accessibleRecordedLocator: Boolean(row.storage_url || row.origin_url),
    recordedSourceFamily: Boolean(row.photo_source && row.source_platform),
    sourceSnapshotLineage: Boolean(row.photo_snapshot_id && row.photo_snapshot_status),
    independentProvenanceReview: false,
    moderationApproved: row.moderation_status === "approved",
    reviewedDisplayRights: RIGHTS.includes(row.rights_status),
    exactOrExplicitItemLink: row.direct_item_link || row.explicit_item_link,
    exactHashUniqueAtRestaurant: row.has_content_hash && Number(row.exact_hash_rows) === 1,
    perceptualHashMeasured: row.has_perceptual_hash,
    independentlyReviewedNearDuplicate: row.duplicate_review_status === "unique",
    noRecordedDuplicateParentOrReason: !row.has_duplicate_parent && !row.has_dedupe_reason,
    lacksVerifiedCustomerSameDish: !row.has_verified_customer,
  };
}
function failed(gates) {
  return Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
}
async function fetchEvidence(row, target, opaquePhotoId) {
  const locator = row.storage_url || row.origin_url;
  if (!locator) return { status: "unavailable", reason: "no_recorded_locator" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(new URL(locator, "https://seefood-rho.vercel.app"), {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return { status: "unavailable", reason: `http_${response.status}` };
    const input = Buffer.from(await response.arrayBuffer());
    if (input.length > 15_000_000) return { status: "unavailable", reason: "over_15mb" };
    const output = await sharp(input).rotate().resize({
      width: 1200, height: 1200, fit: "inside", withoutEnlargement: true,
    }).webp({ quality: 82 }).toBuffer();
    const name = `${opaquePhotoId}.webp`;
    await writeFile(path.join(target, name), output);
    return {
      status: "included", file: `evidence/${name}`,
      sha256: createHash("sha256").update(output).digest("hex"),
      metadataStripped: true,
    };
  } catch (error) {
    return { status: "unavailable", reason: error?.name === "AbortError" ? "timeout" : "decode_or_fetch_failure" };
  }
}

async function main() {
  const { mirror } = args();
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  if (await exists(OUTPUT) || (mirror && await exists(mirror)) || await exists(SEED_OUTPUT)) {
    throw new Error("Refusing to overwrite Stage 3 output or private seed");
  }
  const seed = randomBytes(32).toString("hex");
  const staging = path.join(await mkdtemp(path.join(tmpdir(), "seefood-dl007-stage3-")), "bundle");
  await mkdir(path.join(staging, "queries"), { recursive: true });
  await mkdir(path.join(staging, "evidence"), { recursive: true });
  const client = new Client({ connectionString: connectionString(),
    ssl: { rejectUnauthorized: false }, statement_timeout: 120_000,
    application_name: "seefood_dl007_stage3_read_only" });
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
  const snapshot = before.snapshot_time;
  const rows = targetRows.map((row, index) => {
    const behavior = behavioral(row, snapshot);
    const goldGates = gold(row, behavior);
    return {
      deterministicRank: index + 1,
      opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
      opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
      opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
      opaquePhotoId: opaqueId(seed, "photo", row.photo_id),
      candidatePhotoCount: Number(row.candidate_photo_count),
      selectedAfterEvaluatingAllCandidatePhotos: true,
      behavioralGateEvidence: behavior,
      behavioralFailedGates: failed(behavior),
      behavioralPromptCandidate: failed(behavior).length === 0,
      goldGateEvidence: goldGates,
      goldFailedGates: failed(goldGates),
      goldComparisonCandidate: failed(goldGates).length === 0,
      evidenceBasis: {
        menuSourceFamily: row.menu_source,
        menuLastSeenAt: row.menu_last_seen_at,
        menuMissingStreak: Number(row.menu_missing_streak),
        menuSnapshotStatus: row.menu_snapshot_status,
        menuSnapshotCompletedAt: row.menu_snapshot_completed_at,
        managementSourceFamily: row.photo_source,
        managementSourcePlatform: row.source_platform,
        managementTrustLabel: row.trust_label,
        managementFirstSeenAt: row.photo_first_seen_at,
        managementLastSeenAt: row.photo_last_seen_at,
        managementSnapshotStatus: row.photo_snapshot_status,
        managementSnapshotCompletedAt: row.photo_snapshot_completed_at,
        moderationStatus: row.moderation_status,
        recordedRightsStatus: row.rights_status,
        recordedRightsScope: row.rights_scope,
        itemLinkBasis: row.direct_item_link ? "direct_menu_item_id" :
          row.explicit_item_link ? "photo_menu_item_link" : "none",
        exactHash: { measured: row.has_content_hash, restaurantGroupSize: Number(row.exact_hash_rows) },
        perceptualHash: { measured: row.has_perceptual_hash, restaurantGroupSize: Number(row.perceptual_hash_rows) },
        independentNearDuplicateReview: row.duplicate_review_status,
      },
      _source: row,
    };
  });
  const priorRightsOnly = rows.filter((entry) => {
    const row = entry._source;
    const prior = {
      activeNonTestEntity: ["active", "open"].includes(row.entity_status),
      currentOrderableItem: row.menu_active,
      activeUsefulManagementPhoto: row.photo_active && row.photo_orderable !== false &&
        !row.is_storefront && !row.is_menu_photo,
      accessible: Boolean(row.storage_url || row.origin_url),
      explicitProvenance: Boolean(row.photo_source && row.source_platform && row.trust_label),
      moderationApproved: row.moderation_status === "approved",
      reviewedRights: RIGHTS.includes(row.rights_status),
      exactOrStrongItemAttachment: row.direct_item_link || row.explicit_item_link,
      robustDuplicateEvidence: row.has_content_hash && row.has_perceptual_hash &&
        !row.has_duplicate_parent && !row.has_dedupe_reason && Number(row.exact_hash_rows) === 1,
      lacksVerifiedCustomerSameDish: !row.has_verified_customer,
    };
    const misses = failed(prior);
    return misses.length === 1 && misses[0] === "reviewedRights";
  }).slice(0, 100);
  const sample = [];
  for (const entry of priorRightsOnly) {
    const evidence = await fetchEvidence(entry._source, path.join(staging, "evidence"), entry.opaquePhotoId);
    sample.push({ ...Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "_source")), evidence });
  }
  const publicRows = rows.map((entry) =>
    Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "_source"))
  );
  const opaqueAttempts = attemptRows.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.id),
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
    experiment: row.experiment_key, variant: row.variant_key, surface: row.surface,
    trafficClass: row.traffic_class, targetClass: row.target_class,
    status: row.status, createdAt: row.created_at,
  }));
  const opaqueReceipts = receiptRows.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.attempt_id),
    eventName: row.event_name, eventSource: row.event_source,
    outcome: row.outcome, occurredAt: row.occurred_at,
  }));
  await jsonl(path.join(staging, "behavioral-prompt-targets.jsonl"),
    publicRows.map((row) => ({ ...row, goldGateEvidence: undefined, goldFailedGates: undefined })));
  await jsonl(path.join(staging, "gold-comparison-targets.jsonl"), publicRows);
  await jsonl(path.join(staging, "blind-rights-only-sample.jsonl"), sample);
  await jsonl(path.join(staging, "contribution-attempts.jsonl"), opaqueAttempts);
  await jsonl(path.join(staging, "contribution-receipts.jsonl"), opaqueReceipts);
  await json(path.join(staging, "target-summary.json"), {
    totalDishRows: rows.length,
    behavioralPromptCandidates: rows.filter((row) => row.behavioralPromptCandidate).length,
    goldComparisonCandidates: rows.filter((row) => row.goldComparisonCandidate).length,
    priorRightsOnlyPopulation: rows.filter((entry) => {
      const miss = entry.goldFailedGates;
      return miss.includes("reviewedDisplayRights");
    }).length,
    blindSampleRows: sample.length,
    evidenceImagesIncluded: sample.filter((row) => row.evidence.status === "included").length,
    treatmentPromptEnabled: false,
    behavioralOrCoverageClaimAuthorized: false,
  });
  await json(path.join(staging, "schema.json"), schemaRows);
  for (const [name, sql] of Object.entries(QUERIES)) await writeFile(path.join(staging, "queries", `${name}.sql`), `${sql}\n`);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  await json(path.join(staging, "snapshot-manifest.json"), {
    bundle: "DL-007 main-thread Stage 3", snapshotTime: snapshot, exporterCommit: commit,
    transaction: { before, after, terminalStatement: "ROLLBACK" },
    selectionFormula: "md5(entity_id:menu_item_id:dl007-stage3), first 100 prior-contract rights-only rows",
    rowCounts: { targets: rows.length, sample: sample.length, attempts: opaqueAttempts.length,
      receipts: opaqueReceipts.length, evidenceImages: sample.filter((row) => row.evidence.status === "included").length },
  });
  await mkdir(path.dirname(SEED_OUTPUT), { recursive: true });
  await json(SEED_OUTPUT, { purpose: "DL-007 Stage 3 bundle-only opaque joins", seed });
  await chmod(SEED_OUTPUT, 0o600);
  const secrets = SECRET_NAMES.map((name) => process.env[name]).filter((value) => typeof value === "string" && value.length >= 8);
  const scans = [];
  for (const relative of await files(staging)) {
    const body = await readFile(path.join(staging, relative));
    if (relative.endsWith(".webp")) {
      const meta = await sharp(body).metadata();
      scans.push({ file: relative, sha256: sha256(body), passed: meta.format === "webp",
        scan: "decoded metadata-stripped image evidence" });
    } else {
      const findings = scanText(body.toString("utf8"), secrets);
      scans.push({ file: relative, sha256: sha256(body), passed: findings.length === 0, findings });
    }
  }
  if (scans.some((row) => !row.passed)) throw new Error("redaction scan failed");
  await json(path.join(staging, "redaction-report.json"), {
    completed: true, environmentSecretScan: "passed", piiScan: "passed",
    urlsAndRawMetadataExcluded: true, files: scans,
  });
  const sums = [];
  for (const relative of await files(staging)) {
    const body = await readFile(path.join(staging, relative));
    sums.push(`${createHash("sha256").update(body).digest("hex")}  ${relative}`);
  }
  await writeFile(path.join(staging, "SHA256SUMS"), `${sums.join("\n")}\n`);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await rename(staging, OUTPUT); await readOnly(OUTPUT);
  if (mirror) { await mkdir(path.dirname(mirror), { recursive: true }); await cp(OUTPUT, mirror, { recursive: true }); await readOnly(mirror); }
  console.log(JSON.stringify({ output: OUTPUT, mirror,
    sha256SumsHash: sha256(await readFile(path.join(OUTPUT, "SHA256SUMS"))) }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
