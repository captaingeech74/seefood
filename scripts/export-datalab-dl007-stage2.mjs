#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { opaqueId, scanText, sha256 } from "./datalab-dl007-lib.mjs";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data-lab/raw/baseline/DL-007/main-thread-stage2");
const SEED_OUTPUT = path.join(ROOT, "data-lab/raw/main-thread-private/DL-007-stage2-opaque-seed.json");
const RIGHTS = ["approved", "granted", "licensed", "first_party_authorized"];
const SECRET_ENV_NAMES = [
  "DATABASE_URL", "SUPABASE_DB_PASSWORD", "SUPABASE_URL", "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY", "R2_BUCKET",
];

const QUERIES = {
  proof: `select current_setting('transaction_read_only') as read_only,
    current_setting('transaction_isolation') as isolation,
    transaction_timestamp()::text as snapshot_time,
    pg_current_wal_lsn()::text as wal_lsn`,
  legacyEvents: `
select a.id, a.event_name, a.created_at::text, a.restaurant_id, r.entity_id,
  e.status as entity_status, a.visitor_id,
  nullif(a.metadata->>'sessionId', '') as session_id,
  case when e.status = 'test_fixture' then 'fixture'
    when lower(coalesce(a.metadata->>'trafficClass','')) in ('staff','internal') then 'staff'
    when lower(coalesce(a.metadata->>'trafficClass','')) = 'automation' then 'automation'
    when e.id is null or coalesce(e.status,'') not in ('active','open') then 'ineligible_entity'
    else 'public_unverified' end as traffic_class
from app_events a
left join restaurants r on r.place_id = a.restaurant_id
left join restaurant_entities e on e.id = r.entity_id
where a.created_at <= $1::timestamptz
order by a.created_at, a.id`,
  attempts: `
select ca.id, ca.created_at::text, ca.updated_at::text, ca.restaurant_id,
  r.entity_id, ca.menu_item_id, ca.visitor_id, ca.session_id,
  ca.experiment_key, ca.variant_key, ca.surface, ca.traffic_class,
  ca.entity_status, ca.rights_version, ca.rights_granted_at::text, ca.status
from contribution_attempts ca
join restaurants r on r.place_id = ca.restaurant_id
where ca.created_at <= $1::timestamptz
order by ca.created_at, ca.id`,
  funnelEvents: `
select f.attempt_id, f.event_name, f.event_source, f.outcome, f.occurred_at::text
from contribution_funnel_events f
where f.occurred_at <= $1::timestamptz
order by f.occurred_at, f.attempt_id, f.event_name`,
  dishTargets: `
with candidate_photos as (
  select r.entity_id, r.place_id as restaurant_id, e.status as entity_status,
    m.id as menu_item_id, m.canonical_dish_id, m.active as item_current,
    m.active as item_orderable,
    p.id as photo_id, p.active as photo_active, p.photo_author_type,
    p.source, p.source_platform, p.trust_label,
    p.moderation_status, p.rights_status, p.is_orderable as photo_orderable,
    p.is_storefront, p.is_menu_photo, p.storage_url is not null as has_storage,
    p.origin_url is not null as has_origin, p.content_hash is not null as has_hash,
    p.perceptual_hash is not null as has_perceptual_hash,
    p.duplicate_of_photo_id is not null as has_duplicate_parent,
    p.dedupe_reason is not null as has_dedupe_reason,
    p.menu_item_id = m.id as direct_item_link,
    exists (select 1 from photo_menu_item_links l
      where l.photo_id = p.id and l.menu_item_id = m.id) as explicit_item_link,
    count(*) over (partition by p.restaurant_id, p.content_hash) as exact_hash_rows,
    row_number() over (partition by r.entity_id, m.id order by
      (p.menu_item_id = m.id) desc, p.photo_quality_score desc nulls last, p.id) as photo_rank,
    exists (
      select 1 from restaurants cr join photos cp on cp.restaurant_id = cr.place_id
      where cr.entity_id = r.entity_id and cp.active
        and cp.photo_author_type = 'customer' and cp.moderation_status = 'approved'
        and cp.rights_status = 'user_granted' and cp.rights_version is not null
        and cp.published_at is not null and cp.item_match_status in ('exact','strong')
        and cp.duplicate_review_status = 'unique'
        and (cp.menu_item_id = m.id or
          (m.canonical_dish_id is not null and cp.canonical_dish_id = m.canonical_dish_id))
    ) as has_verified_customer_photo
  from restaurant_entities e
  join restaurants r on r.entity_id = e.id
  join menu_items m on m.restaurant_id = r.place_id and m.active
  join photos p on p.restaurant_id = r.place_id and (
    p.menu_item_id = m.id or exists (
      select 1 from photo_menu_item_links l
      where l.photo_id = p.id and l.menu_item_id = m.id
    )
  )
  where p.photo_author_type = 'management'
)
select * from candidate_photos
where photo_rank = 1
order by md5(entity_id::text || ':' || menu_item_id::text || ':dl007-stage2'),
  entity_id, menu_item_id`,
  schema: `
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in (
  'app_events','contribution_attempts','contribution_funnel_events',
  'photos','photo_menu_item_links','menu_items','restaurants','restaurant_entities'
)
order by table_name, ordinal_position`,
};

function parseArgs() {
  const index = process.argv.indexOf("--mirror");
  if (index >= 0 && !process.argv[index + 1]) throw new Error("--mirror requires a path");
  return { mirror: index < 0 ? null : path.resolve(process.argv[index + 1]) };
}

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

async function listFiles(root, relative = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(root, child)));
    if (entry.isFile()) result.push(child);
  }
  return result.sort();
}

async function json(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function jsonl(target, rows) {
  await writeFile(target, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

async function makeReadOnly(root) {
  const directories = new Set(["."]);
  for (const relative of await listFiles(root)) {
    await chmod(path.join(root, relative), 0o400);
    for (let parent = path.dirname(relative); parent !== "."; parent = path.dirname(parent)) directories.add(parent);
  }
  for (const directory of [...directories].sort().reverse()) await chmod(path.join(root, directory), 0o500);
}

function connectionString() {
  const value = process.env.DATABASE_URL?.replace(
    "[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "")
  );
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

function gates(row) {
  return {
    activeNonTestEntity: ["active", "open"].includes(row.entity_status),
    currentOrderableItem: row.item_current && row.item_orderable,
    activeUsefulManagementPhoto: row.photo_active && row.photo_author_type === "management" &&
      row.photo_orderable !== false && !row.is_storefront && !row.is_menu_photo,
    accessible: row.has_storage || row.has_origin,
    explicitProvenance: Boolean(row.source && row.source_platform && row.trust_label),
    moderationApproved: row.moderation_status === "approved",
    reviewedRights: RIGHTS.includes(row.rights_status),
    exactOrStrongItemAttachment: row.direct_item_link || row.explicit_item_link,
    robustDuplicateEvidence: row.has_hash && row.has_perceptual_hash &&
      !row.has_duplicate_parent && !row.has_dedupe_reason && Number(row.exact_hash_rows) === 1,
    lacksVerifiedCustomerSameDish: !row.has_verified_customer_photo,
  };
}

function aggregate(snapshot, attempts, events, days) {
  const start = days == null ? -Infinity : new Date(snapshot).getTime() - days * 86400000;
  const included = attempts.filter((row) => new Date(row.createdAt).getTime() >= start);
  const ids = new Set(included.map((row) => row.opaqueAttemptId));
  const eventRows = events.filter((row) => ids.has(row.opaqueAttemptId));
  const count = (name, outcome) => eventRows.filter(
    (row) => row.eventName === name && (!outcome || row.outcome === outcome)
  ).length;
  return {
    attempts: included.length,
    eligiblePublicUnverifiedAttempts: included.filter((row) => row.trafficClass === "public_unverified").length,
    promptImpressions: count("eligible_prompt_impression"),
    promptOpens: count("prompt_open"),
    fileSelections: count("file_selected"),
    cancellations: count("file_cancelled"),
    serverUploadRequests: count("server_upload_received"),
    photoRecordsCreated: count("photo_record_result", "success"),
    verifiedComparisonsCreated: count("verified_comparison_created", "created"),
  };
}

async function main() {
  const { mirror } = parseArgs();
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  if (await exists(OUTPUT) || (mirror && (await exists(mirror)))) {
    throw new Error("Refusing to overwrite an existing Stage 2 bundle");
  }
  if (await exists(SEED_OUTPUT)) throw new Error("Refusing to overwrite the private seed");

  const seed = randomBytes(32).toString("hex");
  const staging = path.join(await mkdtemp(path.join(tmpdir(), "seefood-dl007-stage2-")), "bundle");
  await mkdir(path.join(staging, "queries"), { recursive: true });
  await mkdir(path.join(staging, "evidence"), { recursive: true });
  const client = new Client({
    connectionString: connectionString(), ssl: { rejectUnauthorized: false },
    statement_timeout: 120_000, application_name: "seefood_dl007_stage2_forced_read_only",
  });
  let open = false;
  let proofBefore, proofAfter, legacyRaw, attemptsRaw, funnelRaw, targetsRaw, schema;
  try {
    await client.connect();
    await client.query("begin transaction isolation level repeatable read read only");
    open = true;
    proofBefore = (await client.query(QUERIES.proof)).rows[0];
    if (proofBefore.read_only !== "on" || proofBefore.isolation !== "repeatable read") {
      throw new Error("Database did not confirm REPEATABLE READ READ ONLY");
    }
    const snapshot = proofBefore.snapshot_time;
    legacyRaw = (await client.query(QUERIES.legacyEvents, [snapshot])).rows;
    attemptsRaw = (await client.query(QUERIES.attempts, [snapshot])).rows;
    funnelRaw = (await client.query(QUERIES.funnelEvents, [snapshot])).rows;
    targetsRaw = (await client.query(QUERIES.dishTargets)).rows;
    schema = (await client.query(QUERIES.schema)).rows;
    proofAfter = (await client.query(QUERIES.proof)).rows[0];
    await client.query("rollback");
    open = false;
  } finally {
    if (open) await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
  }

  const snapshot = proofBefore.snapshot_time;
  const legacy = legacyRaw.map((row) => ({
    eventName: row.event_name, createdAt: row.created_at,
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
    opaqueBrowserId: opaqueId(seed, "browser", row.visitor_id),
    opaqueSessionId: opaqueId(seed, "session", row.session_id),
    entityStatus: row.entity_status, trafficClass: row.traffic_class,
    eligibleForBehavioralAnalysis: false,
    eligibilityReason: row.traffic_class === "public_unverified"
      ? "historical traffic lacks affirmative staff/automation exclusion"
      : `excluded_${row.traffic_class}`,
  }));
  const attempts = attemptsRaw.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.id), createdAt: row.created_at,
    updatedAt: row.updated_at,
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
    opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
    opaqueBrowserId: opaqueId(seed, "browser", row.visitor_id),
    opaqueSessionId: opaqueId(seed, "session", row.session_id),
    experiment: row.experiment_key, variant: row.variant_key, surface: row.surface,
    trafficClass: row.traffic_class, entityStatus: row.entity_status,
    rightsVersionPresent: Boolean(row.rights_version),
    rightsGrantedAtPresent: Boolean(row.rights_granted_at), status: row.status,
  }));
  const funnel = funnelRaw.map((row) => ({
    opaqueAttemptId: opaqueId(seed, "attempt", row.attempt_id),
    eventName: row.event_name, eventSource: row.event_source,
    outcome: row.outcome, occurredAt: row.occurred_at,
  }));
  const roster = targetsRaw.map((row, index) => {
    const gateResults = gates(row);
    const failedGates = Object.entries(gateResults).filter(([, pass]) => !pass).map(([name]) => name);
    return {
      deterministicRank: index + 1,
      opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
      opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
      opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
      opaqueCanonicalDishId: opaqueId(seed, "canonical_dish", row.canonical_dish_id),
      opaqueManagementPhotoId: opaqueId(seed, "photo", row.photo_id),
      managementPhotoRankForDish: Number(row.photo_rank),
      candidatePhotoCountBasis: "one deterministically top-ranked Management photo per current dish",
      gateResults, failedGates, qualified: failedGates.length === 0,
    };
  });

  await jsonl(path.join(staging, "legacy-app-events.jsonl"), legacy);
  await jsonl(path.join(staging, "contribution-attempts.jsonl"), attempts);
  await jsonl(path.join(staging, "contribution-funnel-events.jsonl"), funnel);
  await jsonl(path.join(staging, "dish-target-roster.jsonl"), roster);
  await json(path.join(staging, "dish-target-summary.json"), {
    totalCurrentDishCandidatesWithManagementAttachment: roster.length,
    qualifiedDishTargets: roster.filter((row) => row.qualified).length,
    failedGateCounts: Object.fromEntries(
      [...new Set(roster.flatMap((row) => row.failedGates))].sort()
        .map((gate) => [gate, roster.filter((row) => row.failedGates.includes(gate)).length])
    ),
    evidenceCandidateLimit: 100, evidenceImagesIncluded: 0,
    evidenceImageReason: "No image bytes were required to establish database gate failures; treatment remains disabled.",
  });
  await json(path.join(staging, "aggregates.json"), {
    snapshotTime: snapshot,
    definitions: {
      legacyAppOpen: "app_open database rows and distinct opaque browser IDs; never people or restaurant visits",
      attempt: "one idempotent contribution_attempt UUID",
      behavioralEligibility: "only explicitly classified contribution attempts; historical public_unverified rows are upper bounds",
    },
    windows: Object.fromEntries(
      [["allTime", null], ["90Day", 90], ["30Day", 30], ["7Day", 7]]
        .map(([key, days]) => [key, aggregate(snapshot, attempts, funnel, days)])
    ),
    legacyAppOpen: {
      rows: legacy.filter((row) => row.eventName === "app_open").length,
      opaqueBrowserIds: new Set(legacy.filter((row) => row.eventName === "app_open")
        .map((row) => row.opaqueBrowserId)).size,
      behavioralClaimAuthorized: false,
    },
  });
  await json(path.join(staging, "instrumentation-contract.json"), {
    experiment: "dl007_known_dish_v1", deployedVariant: "passive_existing_surface",
    treatmentPromptEnabled: false, coverageClaimAuthorized: false,
    behavioralConversionClaimAuthorized: false,
    stableKeys: ["attempt UUID", "session ID", "restaurant ID", "current menu-item ID"],
    clientReceipts: ["eligible_prompt_impression", "prompt_open", "photo_source_choice",
      "file_selected", "file_cancelled", "client_preparation_result"],
    authoritativeReceipts: ["server_upload_received", "storage_result", "photo_record_result",
      "rights_grant_recorded", "moderation_result", "item_match_result",
      "duplicate_result", "verified_comparison_created"],
    publicationRule: "Known-dish submissions remain inactive and unpublished until rights, moderation, item-match, and duplicate review all pass.",
  });
  await json(path.join(staging, "schema.json"), schema);
  for (const [name, sql] of Object.entries(QUERIES)) {
    await writeFile(path.join(staging, "queries", `${name}.sql`), `${sql.trim()}\n`);
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  await json(path.join(staging, "snapshot-manifest.json"), {
    bundle: "DL-007 main-thread Stage 2", snapshotTime: snapshot, exporterCommit: commit,
    transaction: { before: proofBefore, after: proofAfter, terminalStatement: "ROLLBACK" },
    rowCounts: {
      legacyAppEvents: legacy.length, contributionAttempts: attempts.length,
      contributionFunnelEvents: funnel.length, dishTargetRoster: roster.length,
      qualifiedDishTargets: roster.filter((row) => row.qualified).length, evidenceImages: 0,
    },
  });
  await mkdir(path.dirname(SEED_OUTPUT), { recursive: true });
  await json(SEED_OUTPUT, { purpose: "DL-007 Stage 2 bundle-only opaque joins", seed });
  await chmod(SEED_OUTPUT, 0o600);

  const secretValues = SECRET_ENV_NAMES.map((name) => process.env[name])
    .filter((value) => typeof value === "string" && value.length >= 8);
  const scanResults = [];
  for (const relative of await listFiles(staging)) {
    const text = await readFile(path.join(staging, relative), "utf8");
    const findings = scanText(text, secretValues);
    scanResults.push({ file: relative, sha256: sha256(text), passed: findings.length === 0, findings });
  }
  if (scanResults.some((row) => !row.passed)) throw new Error("Redaction scan failed");
  await json(path.join(staging, "redaction-report.json"), {
    completed: true, environmentSecretScan: "passed", piiScan: "passed",
    forbiddenContent: ["names", "contact information", "coordinates", "URLs", "free text",
      "raw metadata", "image bytes", "credentials", "hidden national identities"],
    files: scanResults,
  });
  const sums = [];
  for (const relative of await listFiles(staging)) {
    if (relative === "SHA256SUMS") continue;
    const content = await readFile(path.join(staging, relative));
    sums.push(`${createHash("sha256").update(content).digest("hex")}  ${relative}`);
  }
  await writeFile(path.join(staging, "SHA256SUMS"), `${sums.join("\n")}\n`);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await rename(staging, OUTPUT);
  await makeReadOnly(OUTPUT);
  if (mirror) {
    await mkdir(path.dirname(mirror), { recursive: true });
    await cp(OUTPUT, mirror, { recursive: true });
    await makeReadOnly(mirror);
  }
  console.log(JSON.stringify({
    output: OUTPUT, mirror,
    sha256SumsHash: sha256(await readFile(path.join(OUTPUT, "SHA256SUMS"), "utf8")),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
