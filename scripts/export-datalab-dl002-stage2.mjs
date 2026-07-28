#!/usr/bin/env node

/**
 * Builds DL-002 Stage 2 without opening the clear national holdout.
 * National selection is matched only by registered SHA-256 public-ID hashes.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import sharp from "sharp";
import {
  aggregateCoverage,
  buildCohortPreferences,
  maximumUniqueEntityAssignment,
  metricFlags,
  sha256,
  stableSampleRank,
} from "./datalab-stage2-lib.mjs";

const ROOT = process.cwd();
const OUTPUT = path.join(
  ROOT,
  "data-lab/raw/baseline/DL-002/main-thread-stage2"
);
const MAX_CLAIMS = 100;
const MAX_EVIDENCE_ENTITIES = 150;
const MAX_EVIDENCE_PHOTOS = 1500;
const SECRET_ENV_NAMES = [
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "VISION_API_KEY",
  "PLACES_API_KEY",
  "SCRAPFLY_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

function parseArgs(argv) {
  const result = { mirror: null, hashes: null, temecula: null };
  for (let index = 2; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--mirror") result.mirror = argv[++index];
    else if (name === "--hashes") result.hashes = argv[++index];
    else if (name === "--temecula") result.temecula = argv[++index];
    else throw new Error(`Unknown argument: ${name}`);
  }
  for (const name of ["mirror", "hashes", "temecula"]) {
    if (!result[name] || !path.isAbsolute(result[name])) {
      throw new Error(`--${name} requires an absolute path`);
    }
  }
  return result;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(target)));
    else result.push(target);
  }
  return result.sort();
}

async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(target, values) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    `${values.map((value) => JSON.stringify(value)).join("\n")}${
      values.length ? "\n" : ""
    }`,
    "utf8"
  );
}

async function makeReadOnly(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await makeReadOnly(target);
      await chmod(target, 0o500);
    } else {
      await chmod(target, 0o400);
    }
  }
  await chmod(root, 0o500);
}

function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const parsed = new URL(raw);
  if (process.env.SUPABASE_DB_PASSWORD) {
    parsed.password = process.env.SUPABASE_DB_PASSWORD;
  }
  return parsed.toString();
}

const IDENTITY_QUERY = String.raw`
select i.entity_id::text, i.provider, i.provider_id, e.lat, e.lng
from restaurant_identities i
join restaurant_entities e on e.id = i.entity_id
union all
select e.id::text, 'entity_legacy', e.legacy_place_id, e.lat, e.lng
from restaurant_entities e
where e.legacy_place_id is not null
union all
select r.entity_id::text, 'seefood', r.place_id, e.lat, e.lng
from restaurants r
join restaurant_entities e on e.id = r.entity_id
where r.entity_id is not null
`.trim();

const METRIC_QUERY = String.raw`
with scoped_entities as (
  select unnest($1::uuid[]) as entity_id
), scoped_restaurants as (
  select r.place_id, r.entity_id
  from restaurants r join scoped_entities e on e.entity_id = r.entity_id
), menu_counts as (
  select r.entity_id,
    count(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
      filter (where m.active) as menu_count
  from scoped_restaurants r
  left join menu_items m on m.restaurant_id = r.place_id
  group by r.entity_id
), physical_photos as (
  select r.entity_id, p.id, p.photo_author_type,
    coalesce(p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    ) as primary_dish_key
  from scoped_restaurants r
  join photos p on p.restaurant_id = r.place_id
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
), photo_associations as (
  select entity_id, id, photo_author_type, primary_dish_key as dish_key
  from physical_photos
  union
  select p.entity_id, p.id, p.photo_author_type,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text)
  from physical_photos p
  join photo_menu_item_links l on l.photo_id = p.id
  join menu_items m on m.id = l.menu_item_id and m.active
), photo_counts as (
  select entity_id,
    count(distinct id) as photo_count,
    count(distinct id) filter (where dish_key is not null) as matched_photo_count,
    count(distinct dish_key) filter (where dish_key is not null) as matched_dish_count
  from photo_associations group by entity_id
), comparisons as (
  select entity_id, count(*) as comparison_dish_count,
    array_agg(dish_key order by dish_key) as claim_keys
  from (
    select entity_id, dish_key
    from photo_associations
    where dish_key is not null
    group by entity_id, dish_key
    having bool_or(photo_author_type = 'management')
       and bool_or(photo_author_type = 'customer')
  ) claims group by entity_id
), rollup as (
  select e.entity_id::text,
    coalesce(m.menu_count, 0)::int as menu_count,
    coalesce(p.photo_count, 0)::int as photo_count,
    coalesce(p.matched_photo_count, 0)::int as matched_photo_count,
    coalesce(p.matched_dish_count, 0)::int as matched_dish_count,
    coalesce(c.comparison_dish_count, 0)::int as comparison_dish_count,
    coalesce(c.claim_keys, array[]::text[]) as claim_keys
  from scoped_entities e
  left join menu_counts m on m.entity_id = e.entity_id
  left join photo_counts p on p.entity_id = e.entity_id
  left join comparisons c on c.entity_id = e.entity_id
), totals as (
  select jsonb_build_object(
    'identifiedRestaurants', count(*),
    'menuCoverage', count(*) filter (where menu_count >= 1),
    'basicPhotoCoverage', count(*) filter (where photo_count >= 7),
    'basicMenuPhotoCoverage', count(*) filter (where matched_photo_count >= 7),
    'twentyPercentMenuPhotoCoverage', count(*) filter (
      where menu_count > 0 and matched_photo_count >= 7
        and matched_dish_count >= ceil(menu_count * 0.2)
    ),
    'fiftyPercentMenuPhotoCoverage', count(*) filter (
      where menu_count > 0 and matched_photo_count >= 7
        and matched_dish_count >= ceil(menu_count * 0.5)
    ),
    'comparisonCoverage', count(*) filter (where comparison_dish_count >= 1)
  ) as metrics from rollup
)
select r.*, t.metrics as sql_metrics
from rollup r cross join totals t
order by r.entity_id
`.trim();

const MENU_QUERY = String.raw`
select r.entity_id::text, m.id::text as menu_item_id, m.restaurant_id,
  m.canonical_dish_id::text, m.name, m.source, m.confidence, m.active,
  m.source_snapshot_id::text, m.source_key,
  m.first_seen_at::date::text as first_observed_date,
  m.last_seen_at::date::text as last_observed_date
from menu_items m
join restaurants r on r.place_id = m.restaurant_id
where r.entity_id = any($1::uuid[])
order by r.entity_id, m.id
`.trim();

const PHOTO_QUERY = String.raw`
with links as (
  select p.id as photo_id,
    array_agg(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text)
      order by coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
      filter (where m.id is not null) as linked_dish_keys,
    count(distinct m.id)::int as linked_menu_count
  from photos p
  join restaurants r on r.place_id = p.restaurant_id
  left join photo_menu_item_links l on l.photo_id = p.id
  left join menu_items m on m.id = l.menu_item_id
  where r.entity_id = any($1::uuid[])
  group by p.id
), origins as (
  select po.photo_id,
    jsonb_agg(jsonb_build_object(
      'source', po.source,
      'storageUrl', po.storage_url,
      'originUrl', po.origin_url,
      'contentHash', po.content_hash
    ) order by po.id) as origin_rows,
    count(*)::int as origin_count,
    count(distinct po.source)::int as origin_source_count,
    count(distinct po.origin_url)::int as distinct_origin_url_count
  from photo_origins po
  join restaurants r on r.place_id = po.restaurant_id
  where r.entity_id = any($1::uuid[])
  group by po.photo_id
)
select r.entity_id::text, p.id::text as photo_id, p.restaurant_id,
  p.menu_item_id::text, p.canonical_dish_id::text, p.gemini_label,
  p.source, p.source_platform, p.attribution, p.photo_author_type,
  p.attribution_confidence, p.trust_label, p.active, p.moderation_status,
  p.is_orderable, p.is_storefront, p.is_menu_photo, p.comparison_ready,
  p.width, p.height, p.first_seen_at::date::text as first_observed_date,
  p.last_seen_at::date::text as last_observed_date, p.content_hash,
  p.perceptual_hash, p.duplicate_hash, p.duplicate_of_photo_id::text,
  p.dedupe_reason, p.rights_status, p.storage_url, p.origin_url,
  array_remove(array_cat(
    array[coalesce(p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end)],
    coalesce(l.linked_dish_keys, array[]::text[])
  ), null) as dish_keys,
  coalesce(l.linked_menu_count, 0) as linked_menu_count,
  coalesce(o.origin_rows, '[]'::jsonb) as origins,
  coalesce(o.origin_count, 0) as origin_count,
  coalesce(o.origin_source_count, 0) as origin_source_count,
  coalesce(o.distinct_origin_url_count, 0) as distinct_origin_url_count
from photos p
join restaurants r on r.place_id = p.restaurant_id
left join links l on l.photo_id = p.id
left join origins o on o.photo_id = p.id
where r.entity_id = any($1::uuid[])
order by r.entity_id, p.id
`.trim();

const FUNCTION_QUERY = String.raw`
select pg_get_functiondef(p.oid) as function_source
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'coverage_v2_metrics'
order by p.oid desc limit 1
`.trim();

const SCHEMA_QUERY = String.raw`
select jsonb_object_agg(table_name, columns order by table_name) as schema
from (
  select table_name, array_agg(column_name order by ordinal_position) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = any($1::text[])
  group by table_name
) relevant
`.trim();

function opaqueEntityId(namespace, publicHash) {
  return `E-${sha256(`${namespace}|${publicHash}`).slice(0, 24)}`;
}
function opaqueMenuId(value) {
  return `M-${sha256(`menu|${value}`).slice(0, 24)}`;
}
function opaquePhotoId(value) {
  return `P-${sha256(`photo|${value}`).slice(0, 24)}`;
}
function dishHash(value) {
  return value ? sha256(`dish|${value}`) : null;
}

function authorEvidence(photo) {
  const source = String(photo.source || "").toLowerCase();
  if (["user_upload", "user_suggested"].includes(source)) {
    return { basis: "first_party_submission", strength: "direct" };
  }
  if (
    [
      "merchant",
      "website",
      "schema_org",
      "menufy",
      "toast",
      "square",
      "clover",
      "chownow",
      "olo",
      "popmenu",
      "doordash",
      "grubhub",
    ].includes(source)
  ) {
    return {
      basis: "management_catalog_source",
      strength: "heuristic_guardian_review_required",
    };
  }
  return {
    basis: "stored_author_classification",
    strength: "unverified_guardian_review_required",
  };
}

function r2Key(locator) {
  if (!locator?.startsWith("/api/r2-photo?")) return null;
  return new URL(locator, "https://local.invalid").searchParams.get("key");
}

function locatorKeys(photo) {
  return [
    photo.storage_url,
    ...photo.origins.map((origin) => origin.storageUrl),
  ]
    .map(r2Key)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function recordedHttpLocators(photo) {
  return [
    photo.origin_url,
    ...photo.origins.map((origin) => origin.originUrl),
  ]
    .filter((value) => /^https:\/\//iu.test(value || ""))
    .filter((value) => {
      try {
        const host = new URL(value).hostname.toLowerCase();
        return !["maps.googleapis.com", "places.googleapis.com"].includes(host);
      } catch {
        return false;
      }
    })
    .filter((value, index, all) => all.indexOf(value) === index);
}

function createR2Reader() {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ];
  if (required.some((name) => !process.env[name])) return null;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return async (key) => {
    const response = await client.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    if (!response.Body) throw new Error("R2 object has no body");
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (bytes.length > 15 * 1024 * 1024) {
      throw new Error("R2 object exceeds 15 MiB evidence limit");
    }
    return bytes;
  };
}

async function dHash64(bytes) {
  const pixels = await sharp(bytes)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let result = "";
  for (let index = 0; index < bits.length; index += 4) {
    result += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return result;
}

async function renderStoredEvidence(photo, target, readR2) {
  const errors = [];
  const candidates = [
    ...locatorKeys(photo).map((key) => ({
      mechanism: "existing_r2_object_read",
      locatorHash: sha256(`r2|${key}`),
      read: async () => {
        if (!readR2) throw new Error("r2_configuration_unavailable");
        return readR2(key);
      },
    })),
    ...recordedHttpLocators(photo).map((locator) => ({
      mechanism: "existing_recorded_source_http_read",
      locatorHash: sha256(`http|${locator}`),
      read: async () => {
        const response = await fetch(locator, {
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
          headers: { "user-agent": "SeeFood-DL002-Stage2/1.0" },
        });
        if (!response.ok) throw new Error(`http_${response.status}`);
        const declared = Number(response.headers.get("content-length") || 0);
        if (declared > 15 * 1024 * 1024) {
          throw new Error("http_object_too_large");
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 15 * 1024 * 1024) {
          throw new Error("http_object_too_large");
        }
        return bytes;
      },
    })),
  ];
  for (const candidate of candidates) {
    try {
      const original = await candidate.read();
      const metadata = await sharp(original).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("stored bytes did not decode");
      }
      const normalized = await sharp(original).rotate().toBuffer();
      const rendered = await sharp(normalized)
        .resize({
          width: 512,
          height: 512,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
      await writeFile(target, rendered);
      return {
        accessible: true,
        mechanism: candidate.mechanism,
        locatorSha256: candidate.locatorHash,
        originalSha256: sha256(original),
        renderedSha256: sha256(rendered),
        renderedBytes: rendered.length,
        decoded: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
        },
        computedDHash64: await dHash64(normalized),
      };
    } catch (error) {
      errors.push(String(error.message || "read_error").slice(0, 80));
    }
  }
  return {
    accessible: false,
    reason: candidates.length
      ? "existing_recorded_image_unavailable"
      : "no_existing_recorded_image_locator",
    attemptedRecordedLocators: candidates.length,
    errorClasses: [...new Set(errors)],
  };
}

function sanitizeMenu(row, entityOpaqueId) {
  return {
    entityId: entityOpaqueId,
    menuItemId: opaqueMenuId(row.menu_item_id),
    restaurantJoinHash: sha256(`restaurant|${row.restaurant_id}`),
    canonicalDishKey: dishHash(row.canonical_dish_id),
    dishKey: dishHash(
      row.canonical_dish_id || `menu-${row.menu_item_id}`
    ),
    itemName: row.name,
    source: row.source,
    sourceRecordKeyHash: row.source_key
      ? sha256(`source-key|${row.source_key}`)
      : null,
    confidence: row.confidence,
    active: row.active,
    orderability: row.active ? "currently_active_record" : "inactive_record",
    firstObservedDate: row.first_observed_date,
    lastObservedDate: row.last_observed_date,
    sourceSnapshotHash: row.source_snapshot_id
      ? sha256(`snapshot|${row.source_snapshot_id}`)
      : null,
    managementControlEvidence:
      row.source === "merchant"
        ? "direct_merchant_source"
        : "not_directly_established",
  };
}

function sanitizePhoto(row, entityOpaqueId) {
  return {
    entityId: entityOpaqueId,
    photoId: opaquePhotoId(row.photo_id),
    restaurantJoinHash: sha256(`restaurant|${row.restaurant_id}`),
    menuItemId: row.menu_item_id ? opaqueMenuId(row.menu_item_id) : null,
    canonicalDishKey: dishHash(row.canonical_dish_id),
    attachedDishKeys: [...new Set(row.dish_keys.map(dishHash))].sort(),
    attachedMenuItemCount: row.linked_menu_count,
    label: row.gemini_label,
    source: row.source,
    sourcePlatform: row.source_platform,
    declaredAuthorType: row.photo_author_type,
    authorEvidence: authorEvidence(row),
    attributionConfidence: row.attribution_confidence,
    trustLabel: row.trust_label,
    firstObservedDate: row.first_observed_date,
    lastObservedDate: row.last_observed_date,
    state: {
      active: row.active,
      moderation: row.moderation_status,
      useful:
        row.active &&
        row.moderation_status === "approved" &&
        row.is_orderable !== false &&
        !row.is_storefront &&
        !row.is_menu_photo &&
        !row.dedupe_reason,
      storefront: row.is_storefront,
      menuPhoto: row.is_menu_photo,
      storedComparisonReady: row.comparison_ready,
    },
    dimensions: { width: row.width, height: row.height },
    hashes: {
      storedContentSha256: row.content_hash,
      storedPerceptualHash: row.perceptual_hash,
      legacyDuplicateHash: row.duplicate_hash,
      duplicateOfPhotoHash: row.duplicate_of_photo_id
        ? opaquePhotoId(row.duplicate_of_photo_id)
        : null,
      dedupeReason: row.dedupe_reason,
    },
    rightsStatus: row.rights_status,
    provenance: {
      originCount: row.origin_count,
      distinctOriginUrlCount: row.distinct_origin_url_count,
      sourceCount: row.origin_source_count,
    },
    accessibilityEvidence:
      locatorKeys(row).length + recordedHttpLocators(row).length > 0
        ? "existing_recorded_locator_present"
        : "no_existing_recorded_locator",
  };
}

async function createManifest(root) {
  const lines = [];
  for (const file of await listFiles(root)) {
    if (path.basename(file) === "SHA256SUMS") continue;
    lines.push(
      `${sha256(await readFile(file))}  ${path.relative(root, file)}`
    );
  }
  await writeFile(path.join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

function scanText(text, secretValues) {
  const findings = [];
  if (
    secretValues.some(
      (value) => value.length >= 8 && text.includes(value)
    )
  ) {
    findings.push("loaded_environment_secret");
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(text)) {
    findings.push("email");
  }
  if (
    /(^|[^\d])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/u.test(
      text
    )
  ) {
    findings.push("phone");
  }
  if (/postgres(?:ql)?:\/\//iu.test(text)) findings.push("connection_string");
  if (/https?:\/\//iu.test(text)) findings.push("full_live_url");
  if (
    /"(?:contributorId|contributorName|customerName|email|phone|visitorId|sessionId|deviceId|paymentId)"\s*:/u.test(
      text
    )
  ) {
    findings.push("forbidden_personal_data_key");
  }
  return findings;
}

async function scanBundle(root, secretValues) {
  const results = [];
  const failures = [];
  for (const file of await listFiles(root)) {
    const relative = path.relative(root, file);
    const bytes = await readFile(file);
    let findings = [];
    let imageMetadata = null;
    if (file.endsWith(".webp")) {
      const metadata = await sharp(bytes).metadata();
      imageMetadata = {
        decoded: metadata.format === "webp",
        exifPresent: Boolean(metadata.exif),
        xmpPresent: Boolean(metadata.xmp),
        iccPresent: Boolean(metadata.icc),
      };
      if (
        !imageMetadata.decoded ||
        imageMetadata.exifPresent ||
        imageMetadata.xmpPresent ||
        imageMetadata.iccPresent
      ) {
        findings.push("image_decode_or_metadata");
      }
    } else {
      findings = scanText(bytes.toString("utf8"), secretValues);
    }
    if (findings.length) failures.push(`${relative}:${findings.join(",")}`);
    results.push({
      path: relative,
      sha256: sha256(bytes),
      scanStatus: "completed",
      result: findings.length ? "failed" : "passed",
      findings,
      imageMetadata,
    });
  }
  if (failures.length) {
    throw new Error(`Redaction scan failed: ${failures.join("; ")}`);
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  if (await exists(OUTPUT)) throw new Error(`Refusing to overwrite ${OUTPUT}`);
  if (await exists(args.mirror)) {
    throw new Error(`Refusing to overwrite ${args.mirror}`);
  }
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  const secretValues = SECRET_ENV_NAMES.map((name) => process.env[name]).filter(
    (value) => typeof value === "string"
  );
  const hashBytes = await readFile(args.hashes);
  const hashInput = JSON.parse(hashBytes);
  const selectedHashes = new Set(hashInput.selectedStablePublicIdSha256);
  const alternateHashes = new Set(hashInput.alternateStablePublicIdSha256);
  if (selectedHashes.size !== 120 || alternateHashes.size !== 12) {
    throw new Error("Registered Stage 2 hash input is not exactly 120+12");
  }
  if (
    [...selectedHashes].some((value) => alternateHashes.has(value)) ||
    [...selectedHashes, ...alternateHashes].some(
      (value) => !/^[a-f0-9]{64}$/.test(value)
    )
  ) {
    throw new Error("Registered Stage 2 hashes are invalid or overlapping");
  }
  const temeculaBytes = await readFile(args.temecula);
  const temecula = temeculaBytes
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
    .sort((left, right) =>
      left.stablePublicId.localeCompare(right.stablePublicId)
    );
  if (temecula.length !== 396) {
    throw new Error(`Expected 396 Temecula cohort rows, found ${temecula.length}`);
  }

  const temporaryParent = await mkdtemp(path.join(tmpdir(), "seefood-dl002-s2-"));
  const staging = path.join(temporaryParent, "main-thread-stage2");
  await mkdir(path.join(staging, "evidence/images"), { recursive: true });
  await mkdir(path.join(staging, "guardian"), { recursive: true });
  const startedAtUtc = new Date().toISOString();
  const parsedDatabase = new URL(databaseUrl());
  const client = new pg.Client({
    connectionString: parsedDatabase.toString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120_000,
    application_name: "seefood_dl002_stage2_read_only_export",
  });
  let connected = false;

  try {
    await client.connect();
    connected = true;
    await client.query(
      "begin transaction isolation level repeatable read read only"
    );
    const mode = (
      await client.query(
        "select current_setting('transaction_read_only') as read_only, current_setting('transaction_isolation') as isolation"
      )
    ).rows[0];
    if (mode.read_only !== "on" || mode.isolation !== "repeatable read") {
      throw new Error("Database did not confirm the forced read-only mode");
    }
    const walBefore = (
      await client.query("select pg_current_wal_lsn()::text as wal_lsn")
    ).rows[0].wal_lsn;
    const identityRows = (await client.query(IDENTITY_QUERY)).rows;
    const preferences = buildCohortPreferences(temecula, identityRows);
    const entityByCohort = maximumUniqueEntityAssignment(preferences);
    const matchedEntityIds = entityByCohort.filter(Boolean);
    const nationalMatches = identityRows
      .map((row) => ({
        entityId: row.entity_id,
        publicIdHash: sha256(row.provider_id),
      }))
      .filter(
        (row) =>
          selectedHashes.has(row.publicIdHash) ||
          alternateHashes.has(row.publicIdHash)
      );
    const temeculaEntitySet = new Set(matchedEntityIds);
    if (
      nationalMatches.some((row) => temeculaEntitySet.has(row.entityId))
    ) {
      throw new Error("Temecula and national production entities overlap");
    }
    const evidenceEntityIds = [
      ...new Set([
        ...matchedEntityIds,
        ...nationalMatches.map((row) => row.entityId),
      ]),
    ];
    const metricRows = evidenceEntityIds.length
      ? (await client.query(METRIC_QUERY, [evidenceEntityIds])).rows
      : [];
    const menuRows = evidenceEntityIds.length
      ? (await client.query(MENU_QUERY, [evidenceEntityIds])).rows
      : [];
    const photoRows = evidenceEntityIds.length
      ? (await client.query(PHOTO_QUERY, [evidenceEntityIds])).rows
      : [];
    const functionSource = (await client.query(FUNCTION_QUERY)).rows[0]
      .function_source;
    const schema = (
      await client.query(SCHEMA_QUERY, [
        [
          "restaurant_entities",
          "restaurant_identities",
          "restaurants",
          "menu_items",
          "canonical_dishes",
          "photos",
          "photo_origins",
          "photo_menu_item_links",
          "source_snapshots",
        ],
      ])
    ).rows[0].schema;
    const walAfter = (
      await client.query("select pg_current_wal_lsn()::text as wal_lsn")
    ).rows[0].wal_lsn;
    await client.query("rollback");
    await client.end();
    connected = false;

    const metricByEntity = new Map(
      metricRows.map((row) => [row.entity_id, row])
    );
    const sqlMetric = metricRows[0]?.sql_metrics || aggregateCoverage([]);
    const recomputedMetric = aggregateCoverage(metricRows);
    if (
      Object.keys(recomputedMetric).some(
        (key) => Number(sqlMetric[key]) !== Number(recomputedMetric[key])
      )
    ) {
      throw new Error("SQL/JavaScript production-semantic parity failed");
    }

    const temeculaEntities = temecula.map((row, index) => {
      const publicHash = sha256(row.stablePublicId);
      const productionEntityId = entityByCohort[index];
      const metric = productionEntityId
        ? metricByEntity.get(productionEntityId)
        : null;
      return {
        entityId: opaqueEntityId("temecula", publicHash),
        cohort: "temecula_development",
        selectionRole: "selected",
        publicIdentityHash: publicHash,
        publicName: row.publicName,
        publicStatus: row.status,
        productionMatch: productionEntityId
          ? {
              matched: true,
              entityJoinHash: sha256(`entity|${productionEntityId}`),
              basis: "maximum_one_to_one_public_provider_id_assignment",
            }
          : {
              matched: false,
              basis:
                preferences[index].length === 0
                  ? "no_production_public_provider_id_match"
                  : "production_entity_already_assigned_to_another_accepted_identity",
            },
        claimedProductionMetrics: {
          menu_count: metric?.menu_count || 0,
          photo_count: metric?.photo_count || 0,
          matched_photo_count: metric?.matched_photo_count || 0,
          matched_dish_count: metric?.matched_dish_count || 0,
          comparison_dish_count: metric?.comparison_dish_count || 0,
        },
        claimedCoverageFlags: metricFlags(metric),
      };
    });
    function nationalEntity(publicHash, role) {
      const match = nationalMatches.find(
        (row) => row.publicIdHash === publicHash
      );
      const metric = match ? metricByEntity.get(match.entityId) : null;
      return {
        entityId: opaqueEntityId("national", publicHash),
        cohort: "national_hidden",
        selectionRole: role,
        publicIdentityHash: publicHash,
        productionMatch: match
          ? {
              matched: true,
              entityJoinHash: sha256(`entity|${match.entityId}`),
              basis: "registered_public_id_sha256_match",
            }
          : {
              matched: false,
              basis: "no_production_public_provider_id_hash_match",
            },
        claimedProductionMetrics: {
          menu_count: metric?.menu_count || 0,
          photo_count: metric?.photo_count || 0,
          matched_photo_count: metric?.matched_photo_count || 0,
          matched_dish_count: metric?.matched_dish_count || 0,
          comparison_dish_count: metric?.comparison_dish_count || 0,
        },
        claimedCoverageFlags: metricFlags(metric),
      };
    }
    const nationalSelected = [...selectedHashes]
      .sort()
      .map((hash) => nationalEntity(hash, "selected"));
    const nationalAlternates = [...alternateHashes]
      .sort()
      .map((hash) =>
        nationalEntity(hash, "registered_alternate_not_in_denominator")
      );
    const baselineEntities = [
      ...temeculaEntities,
      ...nationalSelected,
      ...nationalAlternates,
    ];
    const denominatorEntities = [...temeculaEntities, ...nationalSelected];
    const baselineMetrics = aggregateCoverage(
      denominatorEntities.map((row) => row.claimedProductionMetrics)
    );

    const opaqueByProductionEntity = new Map();
    temeculaEntities.forEach((row, index) => {
      if (entityByCohort[index]) {
        opaqueByProductionEntity.set(entityByCohort[index], row.entityId);
      }
    });
    for (const row of [...nationalSelected, ...nationalAlternates]) {
      const match = nationalMatches.find(
        (candidate) => candidate.publicIdHash === row.publicIdentityHash
      );
      if (match) opaqueByProductionEntity.set(match.entityId, row.entityId);
    }
    const baselineMenus = menuRows.map((row) =>
      sanitizeMenu(row, opaqueByProductionEntity.get(row.entity_id))
    );
    const baselinePhotos = photoRows.map((row) =>
      sanitizePhoto(row, opaqueByProductionEntity.get(row.entity_id))
    );

    const claimCandidates = metricRows.flatMap((metric) =>
      metric.claim_keys.map((claimKey) => ({
        entityId: metric.entity_id,
        entityOpaqueId: opaqueByProductionEntity.get(metric.entity_id),
        claimKey,
        rank: stableSampleRank(
          "DL-002-STAGE2-CLAIM-v1",
          `${opaqueByProductionEntity.get(metric.entity_id)}|${dishHash(claimKey)}`
        ),
      }))
    );
    const claims =
      claimCandidates.length <= MAX_CLAIMS
        ? claimCandidates
        : claimCandidates
            .sort((left, right) => left.rank.localeCompare(right.rank))
            .slice(0, MAX_CLAIMS);
    const claimEntityIds = new Set(claims.map((claim) => claim.entityId));
    const controlMetrics = metricRows
      .filter(
        (metric) =>
          !claimEntityIds.has(metric.entity_id) &&
          metric.menu_count >= 7 &&
          metric.photo_count >= 7 &&
          metric.comparison_dish_count === 0
      )
      .sort((left, right) =>
        stableSampleRank(
          "DL-002-STAGE2-RICH-CONTROL-v1",
          opaqueByProductionEntity.get(left.entity_id)
        ).localeCompare(
          stableSampleRank(
            "DL-002-STAGE2-RICH-CONTROL-v1",
            opaqueByProductionEntity.get(right.entity_id)
          )
        )
      )
      .slice(0, 25);
    const evidenceEntityIdsSet = new Set([
      ...claims.map((claim) => claim.entityId),
      ...controlMetrics.map((metric) => metric.entity_id),
    ]);
    if (evidenceEntityIdsSet.size > MAX_EVIDENCE_ENTITIES) {
      throw new Error("Gold evidence entity cap would be exceeded");
    }
    const evidencePhotos = [];
    for (const claim of claims) {
      evidencePhotos.push(
        ...photoRows.filter(
          (photo) =>
            photo.entity_id === claim.entityId &&
            photo.dish_keys.includes(claim.claimKey)
        )
      );
    }
    for (const control of controlMetrics) {
      evidencePhotos.push(
        ...photoRows
          .filter(
            (photo) =>
              photo.entity_id === control.entity_id &&
              photo.active &&
              photo.moderation_status === "approved" &&
              photo.is_orderable !== false &&
              !photo.is_storefront &&
              !photo.is_menu_photo &&
              !photo.dedupe_reason
          )
          .sort((left, right) =>
            stableSampleRank(
              "DL-002-STAGE2-CONTROL-PHOTO-v1",
              opaquePhotoId(left.photo_id)
            ).localeCompare(
              stableSampleRank(
                "DL-002-STAGE2-CONTROL-PHOTO-v1",
                opaquePhotoId(right.photo_id)
              )
            )
          )
          .slice(0, 10)
      );
    }
    const uniqueEvidencePhotos = [
      ...new Map(
        evidencePhotos.map((photo) => [photo.photo_id, photo])
      ).values(),
    ];
    if (uniqueEvidencePhotos.length > MAX_EVIDENCE_PHOTOS) {
      throw new Error("Gold evidence photo cap would be exceeded");
    }

    const shuffleSeed = randomBytes(32).toString("hex");
    const shuffledClaims = [...claims].sort((left, right) =>
      sha256(`${shuffleSeed}|${left.entityId}|${left.claimKey}`).localeCompare(
        sha256(`${shuffleSeed}|${right.entityId}|${right.claimKey}`)
      )
    );
    const claimIdByKey = new Map(
      shuffledClaims.map((claim, index) => [
        `${claim.entityId}|${claim.claimKey}`,
        `G${String(index + 1).padStart(3, "0")}`,
      ])
    );
    const readR2 = createR2Reader();
    const goldPhotoRows = [];
    for (let index = 0; index < uniqueEvidencePhotos.length; index += 1) {
      const photo = uniqueEvidencePhotos[index];
      const evidenceId = `IMG${String(index + 1).padStart(4, "0")}`;
      const target = path.join(staging, "evidence/images", `${evidenceId}.webp`);
      const rendered = await renderStoredEvidence(photo, target, readR2);
      goldPhotoRows.push({
        evidenceId,
        entityId: opaqueByProductionEntity.get(photo.entity_id),
        photoId: opaquePhotoId(photo.photo_id),
        attachedDishKeys: [...new Set(photo.dish_keys.map(dishHash))].sort(),
        source: photo.source,
        declaredAuthorType: photo.photo_author_type,
        authorEvidence: authorEvidence(photo),
        state: {
          active: photo.active,
          moderation: photo.moderation_status,
          useful:
            photo.active &&
            photo.moderation_status === "approved" &&
            photo.is_orderable !== false &&
            !photo.is_storefront &&
            !photo.is_menu_photo &&
            !photo.dedupe_reason,
          storefront: photo.is_storefront,
          menuPhoto: photo.is_menu_photo,
        },
        rightsStatus: photo.rights_status,
        itemAttachmentEvidence: {
          attachedMenuItemCount: photo.linked_menu_count,
          attachedDishKeyCount: new Set(photo.dish_keys).size,
        },
        storedHashes: {
          contentSha256: photo.content_hash,
          perceptualHash: photo.perceptual_hash,
          duplicateHash: photo.duplicate_hash,
          dedupeReason: photo.dedupe_reason,
        },
        provenanceEvidence: {
          originCount: photo.origin_count,
          sourceCount: photo.origin_source_count,
          distinctOriginUrlCount: photo.distinct_origin_url_count,
        },
        accessibilityAndRenderedEvidence: rendered.accessible
          ? {
              ...rendered,
              file: `evidence/images/${evidenceId}.webp`,
              storedContentHashMatchesBytes:
                photo.content_hash != null &&
                photo.content_hash === rendered.originalSha256,
            }
          : {
              ...rendered,
              verdict: "unverifiable_no_missing_image_download_attempted",
            },
      });
    }
    const goldClaims = shuffledClaims.map((claim) => ({
      guardianClaimId: claimIdByKey.get(
        `${claim.entityId}|${claim.claimKey}`
      ),
      cohort: temeculaEntities.some(
        (entity) => entity.entityId === claim.entityOpaqueId
      )
        ? "temecula_development"
        : "national_hidden",
      claimedDishKey: dishHash(claim.claimKey),
      claimedStatus: "claimed_not_verified",
      currentMenuEvidence: baselineMenus
        .filter(
          (menu) =>
            menu.entityId === claim.entityOpaqueId &&
            menu.dishKey === dishHash(claim.claimKey)
        )
        .map((menu) => ({
          menuItemId: menu.menuItemId,
          itemName: menu.itemName,
          source: menu.source,
          active: menu.active,
          lastObservedDate: menu.lastObservedDate,
          managementControlEvidence: menu.managementControlEvidence,
        })),
      photoEvidenceIds: goldPhotoRows
        .filter(
          (photo) =>
            photo.entityId === claim.entityOpaqueId &&
            photo.attachedDishKeys.includes(dishHash(claim.claimKey))
        )
        .map((photo) => photo.evidenceId),
    }));

    await writeJsonLines(
      path.join(staging, "baseline-entities.jsonl"),
      baselineEntities
    );
    await writeJsonLines(
      path.join(staging, "baseline-menu-items.jsonl"),
      baselineMenus
    );
    await writeJsonLines(
      path.join(staging, "baseline-photo-records.jsonl"),
      baselinePhotos
    );
    await writeJsonLines(
      path.join(staging, "baseline-comparison-claims.jsonl"),
      goldClaims
    );
    await writeJson(
      path.join(staging, "baseline-coverage-metrics.json"),
      {
        status: "claimed_not_verified",
        denominator: {
          temeculaSelected: 396,
          nationalSelected: 120,
          nationalAlternatesExcluded: 12,
          total: 516,
        },
        sevenRungs: baselineMetrics,
        productionEntitySemanticParity: {
          matchedProductionEntities: metricRows.length,
          sqlResult: sqlMetric,
          independentlyRecomputedResult: recomputedMetric,
          exact: true,
        },
      }
    );
    await writeJsonLines(
      path.join(staging, "evidence/gold-photo-evidence.jsonl"),
      goldPhotoRows
    );
    await writeJson(
      path.join(staging, "evidence/rich-unpaired-controls.json"),
      controlMetrics.map((metric) => ({
        entityId: opaqueByProductionEntity.get(metric.entity_id),
        cohort: "temecula_development",
        claimedProductionMetrics: {
          menu_count: metric.menu_count,
          photo_count: metric.photo_count,
          matched_photo_count: metric.matched_photo_count,
          matched_dish_count: metric.matched_dish_count,
          comparison_dish_count: metric.comparison_dish_count,
        },
      }))
    );
    await writeJson(path.join(staging, "guardian/id-map.json"), {
      schemaVersion: "dl002-stage2-guardian-map-v1",
      shuffleSeed,
      records: shuffledClaims.map((claim) => ({
        guardianClaimId: claimIdByKey.get(
          `${claim.entityId}|${claim.claimKey}`
        ),
        entityId: claim.entityOpaqueId,
        claimedDishKey: dishHash(claim.claimKey),
      })),
    });
    await chmod(path.join(staging, "guardian/id-map.json"), 0o400);
    await writeFile(
      path.join(staging, "coverage-v2-production-function.sql"),
      functionSource,
      "utf8"
    );
    await writeFile(
      path.join(staging, "queries.sql"),
      [
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        "SELECT current_setting('transaction_read_only'), current_setting('transaction_isolation');",
        "SELECT pg_current_wal_lsn();",
        `${IDENTITY_QUERY};`,
        `${METRIC_QUERY};`,
        `${MENU_QUERY};`,
        `${PHOTO_QUERY};`,
        `${FUNCTION_QUERY};`,
        `${SCHEMA_QUERY};`,
        "SELECT pg_current_wal_lsn();",
        "ROLLBACK;",
        "",
      ].join("\n\n"),
      "utf8"
    );
    await writeJson(path.join(staging, "production-read-proof.json"), {
      transaction: {
        mode: "REPEATABLE READ READ ONLY",
        transactionReadOnly: mode.read_only,
        transactionIsolation: mode.isolation,
        walBefore,
        walAfter,
        endedWith: "ROLLBACK",
      },
      schema,
      inputProof: {
        stage2HashFileSha256: sha256(hashBytes),
        candidateFrameSha256: hashInput.candidateFrameSha256,
        seedCommitment: hashInput.seedCommitment,
        selectedHashCount: selectedHashes.size,
        alternateHashCount: alternateHashes.size,
        clearNationalManifestAccessed: false,
      },
      mappingProof: {
        temeculaCohortRows: temecula.length,
        temeculaCohortSha256: sha256(temeculaBytes),
        uniqueProductionEntitiesAssigned: matchedEntityIds.length,
        acceptedIdentitiesWithoutUniqueProductionEntity:
          temecula.length - matchedEntityIds.length,
        nationalSelectedProductionMatches: nationalSelected.filter(
          (row) => row.productionMatch.matched
        ).length,
        nationalAlternateProductionMatches: nationalAlternates.filter(
          (row) => row.productionMatch.matched
        ).length,
        temeculaNationalOverlap: 0,
      },
    });
    await writeJson(path.join(staging, "snapshot.json"), {
      stage: 2,
      status: "claimed_baseline_ready_for_blind_guardian_evaluation",
      startedAtUtc,
      finishedAtUtc: new Date().toISOString(),
      repositoryCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim(),
      schemaMigrationVersion: (
        await readdir(path.join(ROOT, "db/migrations"))
      )
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .at(-1),
      databaseFingerprint: {
        hostSha256: sha256(parsedDatabase.hostname),
        databaseNameSha256: sha256(
          parsedDatabase.pathname.replace(/^\//, "")
        ),
        roleNameSha256: sha256(
          decodeURIComponent(parsedDatabase.username)
        ),
      },
      productionCoverageFunctionSha256: sha256(functionSource),
      counts: {
        baselineEntities: baselineEntities.length,
        denominatorEntities: denominatorEntities.length,
        baselineMenuItems: baselineMenus.length,
        baselinePhotoRecords: baselinePhotos.length,
        claimedComparisonDishes: goldClaims.length,
        richUnpairedControls: controlMetrics.length,
        goldEvidenceEntities: evidenceEntityIdsSet.size,
        goldEvidencePhotos: goldPhotoRows.length,
        renderedEvidenceImages: goldPhotoRows.filter(
          (row) => row.accessibilityAndRenderedEvidence.accessible
        ).length,
        unverifiableEvidenceImages: goldPhotoRows.filter(
          (row) => !row.accessibilityAndRenderedEvidence.accessible
        ).length,
      },
      limits: {
        maximumClaims: MAX_CLAIMS,
        maximumEvidenceEntities: MAX_EVIDENCE_ENTITIES,
        maximumEvidencePhotos: MAX_EVIDENCE_PHOTOS,
      },
      piiRemoved: true,
      secretsRemoved: true,
      clearNationalManifestAccessed: false,
    });
    await writeFile(
      path.join(staging, "README.md"),
      `# DL-002 read-only handoff — Stage 2

This bundle contains the claimed production baseline and bounded gold evidence
for the frozen Temecula and hidden national cohorts. National selection used
only registered public-ID SHA-256 values. The clear national manifest, names,
locations, and selection seed were not accessed.

All production queries ran inside one REPEATABLE READ READ ONLY transaction
ending in ROLLBACK. No missing evidence was discovered or fetched. The exporter
read only already-recorded R2 or direct source-image locators, without paid API
calls; unavailable recorded evidence is marked unverifiable.

All coverage and comparison fields are claimed, not verified. DataLab and its
Benchmark Guardian must perform the blind claimed-versus-verified evaluation.
`,
      "utf8"
    );

    const firstScan = await scanBundle(staging, secretValues);
    await writeJson(path.join(staging, "redaction-log.json"), {
      status: "completed_before_publication",
      result: "passed",
      perFileResults: firstScan,
      controlFileSelfScan:
        "The serialized redaction log was scanned after creation and passed; its final SHA-256 is recorded in SHA256SUMS.",
    });
    await scanBundle(staging, secretValues);
    await createManifest(staging);
    await scanBundle(staging, secretValues);
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await rename(staging, OUTPUT);
    await mkdir(path.dirname(args.mirror), { recursive: true });
    await cp(OUTPUT, args.mirror, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await makeReadOnly(OUTPUT);
    await makeReadOnly(args.mirror);
    await rm(temporaryParent, { recursive: true, force: true });
    console.log(
      JSON.stringify(
        {
          status: "claimed_baseline_ready_for_blind_guardian_evaluation",
          output: OUTPUT,
          mirror: args.mirror,
          counts: {
            baselineEntities: baselineEntities.length,
            baselineMenuItems: baselineMenus.length,
            baselinePhotoRecords: baselinePhotos.length,
            claims: goldClaims.length,
            controls: controlMetrics.length,
            goldPhotos: goldPhotoRows.length,
          },
          claimedCoverage: baselineMetrics,
        },
        null,
        2
      )
    );
  } catch (error) {
    if (connected) {
      try {
        await client.query("rollback");
        await client.end();
      } catch {}
    }
    await rm(temporaryParent, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
