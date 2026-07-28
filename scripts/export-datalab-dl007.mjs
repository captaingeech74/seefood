#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  WINDOWS,
  aggregateWindow,
  opaqueId,
  scanText,
  sha256,
} from "./datalab-dl007-lib.mjs";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  ROOT,
  "data-lab/raw/baseline/DL-007/main-thread-stage1"
);
const SEED_OUTPUT = path.join(
  ROOT,
  "data-lab/raw/main-thread-private/DL-007-stage1-opaque-seed.json"
);
const SECRET_ENV_NAMES = [
  "DATABASE_URL",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "VISION_API_KEY",
  "PLACES_API_KEY",
  "SCRAPFLY_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];
const VERIFIED_RIGHTS = [
  "approved",
  "granted",
  "licensed",
  "first_party_authorized",
  "user_granted",
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const index = args.indexOf("--mirror");
  if (index === -1) return { mirror: null };
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error("--mirror requires an absolute path");
  }
  return { mirror: path.resolve(args[index + 1]) };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

async function writeJson(target, value) {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(target, rows) {
  await writeFile(
    target,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}${rows.length ? "\n" : ""}`,
    "utf8"
  );
}

async function makeReadOnly(root) {
  const directories = new Set(["."]);
  for (const relative of await listFiles(root)) {
    await chmod(path.join(root, relative), 0o400);
    let directory = path.dirname(relative);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.dirname(directory);
    }
  }
  for (const directory of [...directories].sort().reverse()) {
    await chmod(path.join(root, directory), 0o500);
  }
}

function databaseConnectionString() {
  const value = process.env.DATABASE_URL?.replace(
    "[YOUR-PASSWORD]",
    encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "")
  );
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

const QUERIES = {
  proof: `
select
  current_setting('transaction_read_only') as transaction_read_only,
  current_setting('transaction_isolation') as transaction_isolation,
  transaction_timestamp()::text as transaction_timestamp,
  pg_current_wal_lsn()::text as wal_lsn
`.trim(),
  events: `
select
  a.event_name,
  a.created_at::text as created_at,
  a.restaurant_id,
  r.entity_id,
  a.visitor_id,
  nullif(a.metadata->>'sessionId', '') as session_id,
  case
    when a.event_name = 'photo_add'
      and a.metadata->>'surface' in ('dish_detail', 'missing_dish')
    then a.metadata->>'surface'
    else null
  end as photo_add_surface
from app_events a
left join restaurants r on r.place_id = a.restaurant_id
where a.created_at <= $1::timestamptz
order by a.created_at, a.id
`.trim(),
  contributions: `
with active_menu_links as (
  select
    p.id as photo_id,
    array_agg(distinct m.id order by m.id) filter (where m.id is not null) as menu_item_ids,
    array_agg(distinct m.canonical_dish_id order by m.canonical_dish_id)
      filter (where m.canonical_dish_id is not null) as canonical_dish_ids
  from photos p
  left join lateral (
    select m.id, m.canonical_dish_id
    from menu_items m
    where m.active and m.id = p.menu_item_id
    union
    select m.id, m.canonical_dish_id
    from photo_menu_item_links l
    join menu_items m on m.id = l.menu_item_id and m.active
    where l.photo_id = p.id
  ) m on true
  group by p.id
), useful_associations as (
  select
    r.entity_id,
    p.id as photo_id,
    p.photo_author_type,
    coalesce(
      p.canonical_dish_id::text,
      case when mi.active then 'menu-' || mi.id::text end
    ) as dish_key
  from photos p
  join restaurants r on r.place_id = p.restaurant_id
  left join menu_items mi on mi.id = p.menu_item_id
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
  union
  select
    r.entity_id,
    p.id,
    p.photo_author_type,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text)
  from photos p
  join restaurants r on r.place_id = p.restaurant_id
  join photo_menu_item_links l on l.photo_id = p.id
  join menu_items m on m.id = l.menu_item_id and m.active
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
), comparison_dishes as (
  select entity_id, dish_key
  from useful_associations
  where dish_key is not null
  group by entity_id, dish_key
  having bool_or(photo_author_type = 'management')
     and bool_or(photo_author_type = 'customer')
), exact_groups as (
  select restaurant_id, content_hash, count(*)::int as row_count
  from photos
  where content_hash is not null
  group by restaurant_id, content_hash
)
select
  p.id as photo_id,
  p.restaurant_id,
  r.entity_id,
  coalesce(e.status, '') <> 'test_fixture' as evaluation_eligible_entity,
  p.menu_item_id,
  p.canonical_dish_id,
  coalesce(l.menu_item_ids, '{}'::bigint[]) as linked_menu_item_ids,
  coalesce(l.canonical_dish_ids, '{}'::uuid[]) as linked_canonical_dish_ids,
  p.created_at::text as created_at,
  p.active,
  p.source,
  p.photo_author_type,
  p.contributor_id,
  p.moderation_status,
  p.rights_status,
  p.comparison_ready as stored_comparison_ready,
  p.content_hash is not null as has_content_hash,
  p.perceptual_hash is not null as has_perceptual_hash,
  p.duplicate_hash is not null as has_submission_duplicate_hash,
  p.duplicate_of_photo_id is not null as has_duplicate_parent,
  p.dedupe_reason is not null as has_dedupe_reason,
  coalesce(g.row_count, 0)::int as exact_content_group_size,
  cardinality(coalesce(l.menu_item_ids, '{}'::bigint[])) > 0 as attached_to_current_menu,
  exists (
    select 1
    from useful_associations a
    join comparison_dishes c
      on c.entity_id = a.entity_id and c.dish_key = a.dish_key
    where a.photo_id = p.id
  ) as current_mechanical_comparison_ready
from photos p
join restaurants r on r.place_id = p.restaurant_id
left join restaurant_entities e on e.id = r.entity_id
left join active_menu_links l on l.photo_id = p.id
left join exact_groups g
  on g.restaurant_id = p.restaurant_id and g.content_hash = p.content_hash
where p.source in ('user_upload', 'user_suggested')
  and p.created_at <= $1::timestamptz
order by p.created_at, p.id
`.trim(),
  eligibility: `
with entity_menu as (
  select r.entity_id, count(distinct m.id)::int as current_menu_items
  from restaurants r
  join menu_items m on m.restaurant_id = r.place_id and m.active
  group by r.entity_id
), entity_photos as (
  select
    r.entity_id,
    count(distinct p.id) filter (
      where p.active
        and p.photo_author_type = 'management'
        and not coalesce(p.is_storefront, false)
        and not coalesce(p.is_menu_photo, false)
    )::int as management_photos,
    count(distinct p.id) filter (
      where p.active
        and p.source in ('user_upload', 'user_suggested')
        and p.photo_author_type = 'customer'
    )::int as direct_customer_photos,
    count(distinct p.id) filter (
      where p.active
        and p.source in ('user_upload', 'user_suggested')
        and p.photo_author_type = 'customer'
        and p.moderation_status = 'approved'
        and p.rights_status = any($2::text[])
        and (p.storage_url is not null or p.origin_url is not null)
        and (
          exists (select 1 from menu_items m where m.id = p.menu_item_id and m.active)
          or exists (
            select 1
            from photo_menu_item_links l
            join menu_items m on m.id = l.menu_item_id and m.active
            where l.photo_id = p.id
          )
        )
    )::int as verified_customer_photos
  from restaurants r
  left join photos p on p.restaurant_id = r.place_id
    and p.created_at <= $1::timestamptz
  group by r.entity_id
)
select
  e.id as entity_id,
  coalesce(m.current_menu_items, 0)::int as current_menu_items,
  coalesce(p.management_photos, 0)::int as management_photos,
  coalesce(p.direct_customer_photos, 0)::int as direct_customer_photos,
  coalesce(p.verified_customer_photos, 0)::int as verified_customer_photos
from restaurant_entities e
left join entity_menu m on m.entity_id = e.id
left join entity_photos p on p.entity_id = e.id
where e.status <> 'test_fixture'
  and (
    coalesce(m.current_menu_items, 0) > 0
    or coalesce(p.management_photos, 0) > 0
    or coalesce(p.direct_customer_photos, 0) > 0
    or coalesce(p.verified_customer_photos, 0) > 0
  )
order by e.id
`.trim(),
  schema: `
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'app_events',
    'photos',
    'photo_menu_item_links',
    'menu_items',
    'restaurants',
    'restaurant_entities'
  )
order by table_name, ordinal_position
`.trim(),
};

function publicEvent(row, seed) {
  return {
    eventName: row.event_name,
    createdAt: row.created_at,
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
    opaqueVisitorId: opaqueId(seed, "visitor", row.visitor_id),
    opaqueSessionId: opaqueId(seed, "session", row.session_id),
    photoAddSurface: row.photo_add_surface,
  };
}

function publicContribution(row, seed) {
  return {
    opaquePhotoId: opaqueId(seed, "photo", row.photo_id),
    opaqueRestaurantId: opaqueId(seed, "restaurant", row.restaurant_id),
    opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
    opaqueContributorId: opaqueId(seed, "visitor", row.contributor_id),
    opaqueMenuItemId: opaqueId(seed, "menu_item", row.menu_item_id),
    opaqueCanonicalDishId: opaqueId(seed, "canonical_dish", row.canonical_dish_id),
    opaqueLinkedMenuItemIds: row.linked_menu_item_ids.map((id) =>
      opaqueId(seed, "menu_item", id)
    ),
    opaqueLinkedCanonicalDishIds: row.linked_canonical_dish_ids.map((id) =>
      opaqueId(seed, "canonical_dish", id)
    ),
    createdAt: row.created_at,
    evaluationEligibleEntity: row.evaluation_eligible_entity,
    active: row.active,
    source: row.source,
    authorClassification: row.photo_author_type,
    authorClassificationBasis: "direct_first_party_submission_source",
    moderationStatus: row.moderation_status,
    rightsStatus: row.rights_status,
    attachedToCurrentMenu: row.attached_to_current_menu,
    hasCanonicalAttachment:
      Boolean(row.canonical_dish_id) || row.linked_canonical_dish_ids.length > 0,
    storedHistoricalComparisonReady: row.stored_comparison_ready,
    currentMechanicalComparisonReady: row.current_mechanical_comparison_ready,
    duplicateIndicators: {
      exactContentHashPresent: row.has_content_hash,
      perceptualHashPresent: row.has_perceptual_hash,
      submissionDuplicateHashPresent: row.has_submission_duplicate_hash,
      duplicateParentPresent: row.has_duplicate_parent,
      dedupeReasonPresent: row.has_dedupe_reason,
      exactContentGroupSize: row.exact_content_group_size,
    },
  };
}

async function main() {
  const { mirror } = parseArgs(process.argv);
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  if (await exists(OUTPUT)) throw new Error(`Refusing to overwrite ${OUTPUT}`);
  if (mirror && (await exists(mirror))) {
    throw new Error(`Refusing to overwrite ${mirror}`);
  }
  if (await exists(SEED_OUTPUT)) {
    throw new Error(`Refusing to overwrite private seed ${SEED_OUTPUT}`);
  }

  const seed = randomBytes(32).toString("hex");
  const secretValues = SECRET_ENV_NAMES.map((name) => process.env[name]).filter(
    (value) => typeof value === "string" && value.length >= 8
  );
  const tempParent = await mkdtemp(path.join(tmpdir(), "seefood-dl007-"));
  const staging = path.join(tempParent, "main-thread-stage1");
  await mkdir(staging, { recursive: true });
  const client = new Client({
    connectionString: databaseConnectionString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    application_name: "seefood_dl007_forced_read_only_export",
  });
  let transactionOpen = false;

  try {
    await client.connect();
    await client.query("begin transaction isolation level repeatable read read only");
    transactionOpen = true;
    const proofBefore = (await client.query(QUERIES.proof)).rows[0];
    if (
      proofBefore.transaction_read_only !== "on" ||
      proofBefore.transaction_isolation !== "repeatable read"
    ) {
      throw new Error("Production did not confirm forced read-only mode");
    }
    const snapshot = proofBefore.transaction_timestamp;
    const eventsRaw = (await client.query(QUERIES.events, [snapshot])).rows;
    const contributionsRaw = (
      await client.query(QUERIES.contributions, [snapshot])
    ).rows;
    const eligibilityRaw = (
      await client.query(QUERIES.eligibility, [snapshot, VERIFIED_RIGHTS])
    ).rows;
    const schemaRows = (await client.query(QUERIES.schema)).rows;
    const proofAfter = (await client.query(QUERIES.proof)).rows[0];
    await client.query("rollback");
    transactionOpen = false;
    await client.end();

    const events = eventsRaw.map((row) => publicEvent(row, seed));
    const contributions = contributionsRaw.map((row) =>
      publicContribution(row, seed)
    );
    const eligibility = eligibilityRaw.map((row) => {
      const currentMenuItems = Number(row.current_menu_items);
      const managementPhotos = Number(row.management_photos);
      const directCustomerPhotos = Number(row.direct_customer_photos);
      const verifiedCustomerPhotos = Number(row.verified_customer_photos);
      return {
        opaqueEntityId: opaqueId(seed, "entity", row.entity_id),
        hasCurrentMenu: currentMenuItems > 0,
        currentMenuItemCount: currentMenuItems,
        hasManagementPhoto: managementPhotos > 0,
        managementPhotoCount: managementPhotos,
        hasDirectFirstPartyCustomerPhoto: directCustomerPhotos > 0,
        directFirstPartyCustomerPhotoCount: directCustomerPhotos,
        hasVerifiedCustomerPhoto: verifiedCustomerPhotos > 0,
        verifiedCustomerPhotoCount: verifiedCustomerPhotos,
        targetedContributionEligible:
          currentMenuItems > 0 &&
          managementPhotos > 0 &&
          verifiedCustomerPhotos === 0,
      };
    });
    const aggregates = Object.fromEntries(
      WINDOWS.map(({ key, days }) => [
        key,
        aggregateWindow(events, contributions, snapshot, days),
      ])
    );
    const eventCounts = Object.fromEntries(
      [...new Set(events.map((row) => row.eventName))]
        .sort()
        .map((name) => [
          name,
          events.filter((row) => row.eventName === name).length,
        ])
    );
    const measurableSurfaces = Object.fromEntries(
      ["dish_detail", "missing_dish"].map((surface) => [
        surface,
        events.filter((row) => row.photoAddSurface === surface).length,
      ])
    );

    await writeJsonLines(path.join(staging, "app-events.jsonl"), events);
    await writeJsonLines(
      path.join(staging, "first-party-contribution-photos.jsonl"),
      contributions
    );
    await writeJsonLines(
      path.join(staging, "entity-contribution-eligibility.jsonl"),
      eligibility
    );
    await writeJson(path.join(staging, "aggregates.json"), {
      snapshotTime: snapshot,
      windows: aggregates,
      definitions: {
        visits: "app_open event rows",
        uniqueVisitors: "distinct opaque visitor IDs among app_open events",
        sessions: "distinct non-null opaque session IDs among all event rows",
        uploadSessions: "distinct non-null session IDs among photo_add events",
        successfulUploads:
          "active approved first-party contribution photo records on non-test entities created in the window",
        successfulUploadEvents:
          "photo_add events; recorded only after the upload API returned success",
        uniqueContributors:
          "distinct non-null contributor IDs on active approved first-party photo records",
        attachedUploads:
          "active approved first-party photo records attached to at least one current menu item",
        comparisonReadyContributions:
          "active approved first-party photos on a current mechanically paired Management/Customer dish; not a Guardian verification",
        uniqueRestaurantsImproved:
          "distinct entities receiving an active approved first-party contribution attached to a current menu item",
        excludedTestFixtureContributionRecords:
          "first-party records attached to entities explicitly marked test_fixture; retained in the evidence file but excluded from funnel results",
      },
    });
    await writeJson(path.join(staging, "instrumentation-gaps.json"), {
      verdict:
        "Only visits, photo views, and completed contribution records are currently observable. The pre-upload funnel is not instrumented.",
      eventCounts,
      recordedPhotoAddSurfaces: measurableSurfaces,
      measurable: [
        "app_open visits and unique visitors",
        "sessions when an event contains sessionId",
        "successful contribution photo records",
        "photo_add success events when the client request reaches the event route",
        "dish_detail versus missing_dish surface only for photo_add success events",
        "current attachment, moderation, rights, duplicate, and mechanical comparison state",
      ],
      notMeasurable: [
        "contribution prompt impressions",
        "contribution prompt opens",
        "file-picker or upload starts",
        "user cancellations",
        "client-side optimization failures",
        "upload API failures",
        "event-delivery failures",
        "conversion between any of those missing stages",
      ],
      knownCaveats: [
        "photo_add is a best-effort client event emitted only after upload success; it is not the authoritative photo record",
        "historical contribution photo records may have no corresponding photo_add event or surface/session evidence",
        "records on test_fixture entities are shown but excluded from contribution-success aggregates",
        "a missing visitor/session value is reported as missing and never inferred",
        "stored comparison_ready is historical; currentMechanicalComparisonReady is recomputed separately and is still not a verified DataLab gold claim",
        "rights_status=unreviewed does not count as a verified Customer photo",
      ],
    });
    await writeJson(path.join(staging, "eligibility-definition.json"), {
      target:
        "entities with at least one active menu item and one active useful Management-classified photo, but no verified first-party Customer photo",
      frame:
        "one row per non-test entity having at least one current menu item, Management photo, or direct first-party Customer photo; all-zero entities are omitted because they cannot satisfy the target definition",
      verifiedCustomerPhotoRequires: [
        "active photo",
        "source user_upload or user_suggested",
        "photo_author_type customer",
        "moderation_status approved",
        `rights_status in ${VERIFIED_RIGHTS.join(", ")}`,
        "a recorded image locator",
        "attachment to a current menu item",
      ],
      warning:
        "Eligibility is a targeting baseline, not permission to contact anyone or a claim that a prompt will convert.",
      totals: {
        entities: eligibility.length,
        withCurrentMenu: eligibility.filter((row) => row.hasCurrentMenu).length,
        withManagementPhoto: eligibility.filter((row) => row.hasManagementPhoto).length,
        withDirectFirstPartyCustomerPhoto: eligibility.filter(
          (row) => row.hasDirectFirstPartyCustomerPhoto
        ).length,
        withVerifiedCustomerPhoto: eligibility.filter(
          (row) => row.hasVerifiedCustomerPhoto
        ).length,
        targetedContributionEligible: eligibility.filter(
          (row) => row.targetedContributionEligible
        ).length,
      },
    });
    await writeJson(path.join(staging, "snapshot-manifest.json"), {
      experiment: "DL-007",
      stage: 1,
      snapshotTime: snapshot,
      mainCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim(),
      opaqueIdFormula:
        "kind + '_' + first 24 hex characters of SHA-256(withheld_bundle_seed + '|' + kind + '|' + raw_id)",
      opaqueSeedCommitmentSha256: sha256(seed),
      opaqueSeedDeliveredToDataLab: false,
      sourceRows: {
        appEvents: events.length,
        firstPartyContributionPhotos: contributions.length,
        entityEligibilityRows: eligibility.length,
      },
      outputLimits: {
        names: 0,
        contactInformation: 0,
        urls: 0,
        freeText: 0,
        rawMetadata: 0,
        imageBytes: 0,
        credentials: 0,
        hiddenNationalIdentities: 0,
      },
      transaction: {
        begin: "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        end: "ROLLBACK",
        readOnlyBefore: proofBefore.transaction_read_only,
        isolationBefore: proofBefore.transaction_isolation,
        readOnlyAfter: proofAfter.transaction_read_only,
        isolationAfter: proofAfter.transaction_isolation,
        transactionTimestampBefore: proofBefore.transaction_timestamp,
        transactionTimestampAfter: proofAfter.transaction_timestamp,
        walBefore: proofBefore.wal_lsn,
        walAfter: proofAfter.wal_lsn,
      },
      schemaSha256: sha256(JSON.stringify(schemaRows)),
    });
    await writeJson(path.join(staging, "schema-fingerprint.json"), {
      sha256: sha256(JSON.stringify(schemaRows)),
      columns: schemaRows,
    });
    await writeFile(
      path.join(staging, "queries.sql"),
      [
        "-- Exact DL-007 production queries. $1 is the fixed transaction timestamp.",
        "-- The eligibility query also receives $2 as the documented verified-rights enum list.",
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        QUERIES.proof + ";",
        QUERIES.events + ";",
        QUERIES.contributions + ";",
        QUERIES.eligibility + ";",
        QUERIES.schema + ";",
        QUERIES.proof + ";",
        "ROLLBACK;",
        "",
      ].join("\n\n"),
      "utf8"
    );

    const redactionRows = [];
    const scanFailures = [];
    for (const relative of await listFiles(staging)) {
      const bytes = await readFile(path.join(staging, relative));
      const findings = scanText(bytes.toString("utf8"), secretValues);
      redactionRows.push({
        path: relative,
        sha256: sha256(bytes),
        environmentSecretValueScan: {
          status: "completed",
          result: findings.includes("loaded_environment_secret_value")
            ? "failed"
            : "passed",
        },
        piiAndCredentialPatternScan: {
          status: "completed",
          result: findings.length ? "failed" : "passed",
          findings,
        },
      });
      if (findings.length) scanFailures.push({ relative, findings });
    }
    if (scanFailures.length) {
      throw new Error(`Redaction scan failed: ${JSON.stringify(scanFailures)}`);
    }
    await writeJson(path.join(staging, "redaction-report.json"), {
      status: "passed",
      scanCompletedBeforePublication: true,
      filesScanned: redactionRows.length,
      note:
        "This report and SHA256SUMS are self-excluded from the pre-publication per-file scan to avoid a circular self-hash; both are hashed in SHA256SUMS where applicable.",
      files: redactionRows,
    });
    const manifestLines = [];
    for (const relative of await listFiles(staging)) {
      if (relative === "SHA256SUMS") continue;
      manifestLines.push(
        `${sha256(await readFile(path.join(staging, relative)))}  ${relative}`
      );
    }
    await writeFile(path.join(staging, "SHA256SUMS"), `${manifestLines.join("\n")}\n`);

    await mkdir(path.dirname(SEED_OUTPUT), { recursive: true });
    await writeJson(SEED_OUTPUT, {
      warning: "Main-thread private. Never deliver to DataLab.",
      experiment: "DL-007",
      stage: 1,
      seed,
      seedCommitmentSha256: sha256(seed),
      output: OUTPUT,
    });
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await rename(staging, OUTPUT);
    if (mirror) {
      await mkdir(path.dirname(mirror), { recursive: true });
      await cp(OUTPUT, mirror, { recursive: true });
    }
    await makeReadOnly(OUTPUT);
    if (mirror) await makeReadOnly(mirror);
    console.log(
      JSON.stringify(
        {
          output: OUTPUT,
          mirror,
          snapshot,
          rows: {
            events: events.length,
            contributions: contributions.length,
            eligibility: eligibility.length,
          },
          seedCommitmentSha256: sha256(seed),
          manifestSha256: sha256(
            await readFile(path.join(OUTPUT, "SHA256SUMS"))
          ),
        },
        null,
        2
      )
    );
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("rollback");
      } catch {}
    }
    try {
      await client.end();
    } catch {}
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
