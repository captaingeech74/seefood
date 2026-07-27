#!/usr/bin/env node

/**
 * Produces the bounded, sanitized evidence bundle requested by DataLab DL-001.
 *
 * Safety properties:
 * - one direct Postgres transaction, explicitly repeatable-read and read-only;
 * - only BEGIN/SHOW/SELECT/ROLLBACK statements;
 * - direct GetObject or HTTP GET image reads (never an application route);
 * - no Supabase client, RPC, cache fill, storage upload, or production write;
 * - output is staged, secret-scanned, hashed, then made filesystem read-only.
 */
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Client } from "pg";
import sharp from "sharp";
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
import { execFileSync } from "node:child_process";
import {
  authorBasis,
  classifyCandidate,
  findSecretLeaks,
  redactLocator,
  selectBucketCandidates,
  sha256,
  stableRank,
} from "./datalab-export-lib.mjs";

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, "data-lab/raw/baseline/DL-001");
const MAX_PHOTOS_PER_RESTAURANT = 10;
const MAX_PHOTOS_TOTAL = 120;
const BOUNDS = {
  minLat: 33.43,
  maxLat: 33.62,
  minLng: -117.3,
  maxLng: -117.05,
  meaning: "calibration_bounds_only_not_a_Temecula_census",
};
const MANAGEMENT_SOURCES = [
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
];
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

const CANDIDATE_QUERY = String.raw`
with scoped as (
  select
    r.place_id as restaurant_id,
    r.entity_id,
    r.name as restaurant_name,
    r.lat,
    r.lng,
    r.status as restaurant_status,
    e.status as entity_status
  from restaurants r
  join restaurant_entities e on e.id = r.entity_id
  where e.status <> 'test_fixture'
    and r.status <> 'test_fixture'
    and r.lat between $1 and $2
    and r.lng between $3 and $4
),
menu_counts as (
  select
    s.restaurant_id,
    count(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
      filter (where m.active) as current_menu_count,
    count(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
      filter (
        where m.active
          and (
            m.last_seen_at >= current_timestamp - interval '30 days'
            or (m.source = 'merchant' and m.last_seen_at >= current_timestamp - interval '90 days')
          )
      ) as benchmark_fresh_menu_count
  from scoped s
  left join menu_items m on m.restaurant_id = s.restaurant_id
  group by s.restaurant_id
),
physical_photos as (
  select
    s.restaurant_id,
    s.entity_id,
    p.id as photo_id,
    p.photo_author_type,
    coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    ) as primary_dish_key
  from scoped s
  join photos p on p.restaurant_id = s.restaurant_id
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
),
photo_associations as (
  select restaurant_id, entity_id, photo_id, photo_author_type, primary_dish_key as dish_key
  from physical_photos
  union
  select
    p.restaurant_id,
    p.entity_id,
    p.photo_id,
    p.photo_author_type,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text) as dish_key
  from physical_photos p
  join photo_menu_item_links l on l.photo_id = p.photo_id
  join menu_items m on m.id = l.menu_item_id and m.active
),
claims as (
  select
    restaurant_id,
    array_agg(dish_key order by dish_key) as sql_claim_keys,
    count(*)::int as sql_claim_count
  from (
    select restaurant_id, dish_key
    from photo_associations
    where dish_key is not null
    group by restaurant_id, dish_key
    having bool_or(photo_author_type = 'management')
       and bool_or(photo_author_type = 'customer')
  ) claim_dishes
  group by restaurant_id
),
useful_photos as (
  select
    s.restaurant_id,
    count(distinct p.id)::int as useful_photo_count
  from scoped s
  left join photos p
    on p.restaurant_id = s.restaurant_id
   and p.active
   and p.moderation_status = 'approved'
   and coalesce(p.is_orderable, true)
   and not coalesce(p.is_storefront, false)
   and not coalesce(p.is_menu_photo, false)
   and p.dedupe_reason is null
   and coalesce(p.storage_url, p.origin_url) is not null
  group by s.restaurant_id
),
stored_flags as (
  select
    s.restaurant_id,
    count(*) filter (where p.active and p.comparison_ready)::int as stored_active_flag_count,
    count(*) filter (where p.comparison_ready)::int as stored_all_flag_count,
    array_agg(distinct coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    )) filter (where p.active and p.comparison_ready) as stored_flag_keys
  from scoped s
  left join photos p on p.restaurant_id = s.restaurant_id
  group by s.restaurant_id
)
select
  s.*,
  coalesce(m.current_menu_count, 0)::int as current_menu_count,
  coalesce(m.benchmark_fresh_menu_count, 0)::int as benchmark_fresh_menu_count,
  coalesce(u.useful_photo_count, 0)::int as useful_photo_count,
  coalesce(c.sql_claim_count, 0)::int as sql_claim_count,
  coalesce(c.sql_claim_keys, array[]::text[]) as sql_claim_keys,
  coalesce(f.stored_active_flag_count, 0)::int as stored_active_flag_count,
  coalesce(f.stored_all_flag_count, 0)::int as stored_all_flag_count,
  coalesce(f.stored_flag_keys, array[]::text[]) as stored_flag_keys
from scoped s
left join menu_counts m using (restaurant_id)
left join useful_photos u using (restaurant_id)
left join claims c using (restaurant_id)
left join stored_flags f using (restaurant_id)
order by s.restaurant_id`;

const MENU_QUERY = String.raw`
select
  m.id::text as menu_item_id,
  m.restaurant_id,
  r.entity_id::text as entity_id,
  m.canonical_dish_id::text,
  m.name as item_name,
  m.source,
  m.confidence,
  m.active,
  m.source_snapshot_id::text,
  ss.source as snapshot_source,
  ss.status as snapshot_status,
  m.source_key,
  m.last_seen_at::date::text as observed_date,
  m.first_seen_at::date::text as first_observed_date,
  (
    m.last_seen_at >= current_timestamp - interval '30 days'
    or (m.source = 'merchant' and m.last_seen_at >= current_timestamp - interval '90 days')
  ) as benchmark_fresh,
  cd.name as canonical_name,
  cd.normalized_name as canonical_normalized_name,
  cd.confidence as canonical_confidence,
  case
    when bmt.id is not null then 'inherited_template_candidate'
    else 'location_observed'
  end as location_or_template,
  b.name as public_brand_name
from menu_items m
join restaurants r on r.place_id = m.restaurant_id
left join canonical_dishes cd on cd.id = m.canonical_dish_id
left join source_snapshots ss on ss.id = m.source_snapshot_id
left join restaurant_brand_memberships rbm on rbm.entity_id = r.entity_id
left join brands b on b.id = rbm.brand_id
left join brand_menu_templates bmt
  on bmt.brand_id = rbm.brand_id
 and bmt.normalized_name = cd.normalized_name
 and bmt.active
where m.restaurant_id = any($1::text[])
  and m.active
order by m.restaurant_id, coalesce(cd.normalized_name, lower(m.name)), m.source, m.id`;

const PHOTO_QUERY = String.raw`
with associations as (
  select
    p.id as photo_id,
    coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    ) as dish_key,
    p.menu_item_id::text as menu_item_id,
    p.canonical_dish_id::text as canonical_dish_id,
    'primary_photo_link'::text as link_basis
  from photos p
  where p.restaurant_id = any($1::text[])
  union
  select
    l.photo_id,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text) as dish_key,
    m.id::text,
    m.canonical_dish_id::text,
    'preserved_many_to_many_link'::text as link_basis
  from photo_menu_item_links l
  join menu_items m on m.id = l.menu_item_id and m.active
  where m.restaurant_id = any($1::text[])
),
association_rollup as (
  select
    photo_id,
    array_agg(distinct dish_key order by dish_key) filter (where dish_key is not null) as dish_keys,
    jsonb_agg(distinct jsonb_build_object(
      'menuItemId', menu_item_id,
      'canonicalDishId', canonical_dish_id,
      'dishKey', dish_key,
      'basis', link_basis
    )) filter (where dish_key is not null) as menu_links
  from associations
  group by photo_id
),
origin_rollup as (
  select
    po.photo_id,
    jsonb_agg(jsonb_build_object(
      'source', po.source,
      'originUrl', po.origin_url,
      'storageUrl', po.storage_url,
      'attribution', po.attribution,
      'photoAuthorType', po.photo_author_type,
      'contentHash', po.content_hash
    ) order by po.id) as origins,
    count(*)::int as origin_count,
    count(distinct po.source)::int as origin_source_count,
    count(*) filter (
      where exists (
        select 1 from photo_origins po2
        where po2.restaurant_id = po.restaurant_id
          and po2.origin_url = po.origin_url
          and po2.photo_id <> po.photo_id
      )
    )::int as repeated_origin_url_count
  from photo_origins po
  where po.restaurant_id = any($1::text[])
  group by po.photo_id
)
select
  p.id::text as photo_id,
  p.restaurant_id,
  r.entity_id::text as entity_id,
  p.menu_item_id::text,
  p.canonical_dish_id::text,
  p.gemini_label,
  p.source,
  p.source_platform,
  p.attribution,
  p.photo_author_type,
  p.attribution_confidence,
  p.trust_label,
  p.active,
  p.moderation_status,
  p.is_orderable,
  p.is_storefront,
  p.is_menu_photo,
  p.comparison_ready,
  p.tier,
  p.width,
  p.height,
  p.first_seen_at::date::text as first_observed_date,
  p.last_seen_at::date::text as last_observed_date,
  p.duplicate_hash,
  p.content_hash,
  p.perceptual_hash,
  p.duplicate_of_photo_id::text,
  p.dedupe_reason,
  p.rights_status,
  p.storage_url,
  p.origin_url,
  coalesce(a.dish_keys, array[]::text[]) as dish_keys,
  coalesce(a.menu_links, '[]'::jsonb) as menu_links,
  coalesce(o.origins, '[]'::jsonb) as origins,
  coalesce(o.origin_count, 0)::int as origin_count,
  coalesce(o.origin_source_count, 0)::int as origin_source_count,
  coalesce(o.repeated_origin_url_count, 0)::int as repeated_origin_url_count,
  case when p.content_hash is null then 0 else (
    select count(*) from photos x
    where x.restaurant_id = p.restaurant_id
      and x.active and x.content_hash = p.content_hash
  ) end::int as active_restaurant_exact_group_size,
  case when p.content_hash is null then 0 else (
    select count(distinct x.restaurant_id) from photos x
    where x.active and x.content_hash = p.content_hash
  ) end::int as active_cross_restaurant_exact_locations,
  case when p.perceptual_hash is null then 0 else (
    select count(*) from photos x
    where x.restaurant_id = p.restaurant_id
      and x.active and x.perceptual_hash = p.perceptual_hash
  ) end::int as active_restaurant_perceptual_group_size
from photos p
join restaurants r on r.place_id = p.restaurant_id
left join association_rollup a on a.photo_id = p.id
left join origin_rollup o on o.photo_id = p.id
where p.restaurant_id = any($1::text[])
  and p.active
  and not coalesce(p.is_storefront, false)
  and not coalesce(p.is_menu_photo, false)
order by p.restaurant_id, p.id`;

const SCHEMA_QUERY = String.raw`
select
  current_database() as database_name,
  current_schema() as schema_name,
  current_setting('server_version') as server_version,
  (
    select jsonb_object_agg(table_name, columns order by table_name)
    from (
      select table_name, array_agg(column_name order by ordinal_position) as columns
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (
          'restaurants', 'restaurant_entities', 'menu_items', 'canonical_dishes',
          'photos', 'photo_origins', 'photo_menu_item_links', 'source_snapshots',
          'brands', 'restaurant_brand_memberships', 'brand_menu_templates'
        )
      group by table_name
    ) table_columns
  ) as relevant_schema`;

function parseArgs(argv) {
  const args = { mirror: null };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--mirror") {
      args.mirror = argv[++index];
      if (!args.mirror) throw new Error("--mirror requires an absolute path");
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (args.mirror && !path.isAbsolute(args.mirror)) {
    throw new Error("--mirror must be an absolute path");
  }
  return args;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    else files.push(fullPath);
  }
  return files.sort();
}

async function makeReadOnly(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await makeReadOnly(fullPath);
      await chmod(fullPath, 0o555);
    } else {
      await chmod(fullPath, 0o444);
    }
  }
  await chmod(root, 0o555);
}

function parseR2Key(rawUrl) {
  if (!rawUrl?.startsWith("/api/r2-photo?")) return null;
  return new URL(rawUrl, "https://local.invalid").searchParams.get("key");
}

function parseGoogleReference(rawUrl) {
  if (!rawUrl?.startsWith("/api/photo?")) return null;
  return new URL(rawUrl, "https://local.invalid").searchParams.get("ref");
}

async function readResponseBytes(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > 15 * 1024 * 1024) throw new Error("image exceeds 15 MiB limit");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) throw new Error("image exceeds 15 MiB limit");
  return bytes;
}

function createR2Reader() {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
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
    const result = await client.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    if (!result.Body) throw new Error("R2 object had no body");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length > 15 * 1024 * 1024) throw new Error("image exceeds 15 MiB limit");
    return bytes;
  };
}

function databaseConnectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  if (process.env.SUPABASE_DB_PASSWORD) {
    url.password = process.env.SUPABASE_DB_PASSWORD;
  }
  return url.toString();
}

async function fetchLocator(locator, readR2) {
  const r2Key = parseR2Key(locator);
  if (r2Key) {
    if (!readR2) throw new Error("R2 read configuration unavailable");
    return { bytes: await readR2(r2Key), mechanism: "direct_r2_get_object" };
  }

  const googleReference = parseGoogleReference(locator);
  if (googleReference) {
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) throw new Error("Google photo read configuration unavailable");
    const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
    url.searchParams.set("maxwidth", "800");
    url.searchParams.set("photo_reference", googleReference);
    url.searchParams.set("key", key);
    return {
      bytes: await readResponseBytes(
        await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" })
      ),
      mechanism: "direct_google_places_photo_get",
    };
  }

  if (/^https?:\/\//i.test(locator)) {
    return {
      bytes: await readResponseBytes(
        await fetch(locator, { signal: AbortSignal.timeout(15_000), redirect: "follow" })
      ),
      mechanism: "direct_source_http_get",
    };
  }
  throw new Error("unsupported relative locator");
}

function locatorCandidates(photo) {
  const candidates = [
    photo.storage_url,
    ...(photo.origins || []).map((origin) => origin.storageUrl),
    photo.origin_url,
    ...(photo.origins || []).map((origin) => origin.originUrl),
  ].filter(Boolean);
  return [...new Set(candidates)];
}

async function renderEvidencePhoto(photo, target, readR2) {
  const errors = [];
  for (const locator of locatorCandidates(photo)) {
    try {
      const { bytes, mechanism } = await fetchLocator(locator, readR2);
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error("bytes did not decode as a supported image");
      }
      const rendered = await sharp(bytes)
        .rotate()
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await writeFile(target, rendered);
      return {
        mechanism,
        selectedLocator: redactLocator(locator),
        originalSha256: sha256(bytes),
        evidenceSha256: sha256(rendered),
        originalBytes: bytes.length,
        evidenceBytes: rendered.length,
        decodedOriginal: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
        },
      };
    } catch (error) {
      errors.push(`${redactLocator(locator)?.locatorSha256}: ${error.message}`);
    }
  }
  throw new Error(`Could not obtain photo ${photo.photo_id}: ${errors.join("; ")}`);
}

function choosePhotos(selectedRestaurants, photos) {
  const selected = [];
  for (const restaurant of selectedRestaurants) {
    const rows = photos.filter(
      (photo) => photo.restaurant_id === restaurant.stableRestaurantId
    );
    const claimKey = restaurant.selectedClaimDishKey;
    const claimedRows = claimKey
      ? rows.filter((photo) => photo.dish_keys.includes(claimKey))
      : [];
    if (claimedRows.length > MAX_PHOTOS_PER_RESTAURANT) {
      throw new Error(
        `${restaurant.restaurant_id} selected claim has ${claimedRows.length} photos; refusing to truncate`
      );
    }

    const required = claimedRows.sort((a, b) => a.photo_id.localeCompare(b.photo_id));
    if (claimKey && required.length === 0) {
      throw new Error(
        `${restaurant.stableRestaurantId} selected claim ${claimKey} had no attached photos`
      );
    }
    const requiredIds = new Set(required.map((photo) => photo.photo_id));
    const fillers = rows
      .filter(
        (photo) =>
          !requiredIds.has(photo.photo_id) &&
          photo.moderation_status === "approved" &&
          photo.is_orderable !== false &&
          !photo.dedupe_reason &&
          locatorCandidates(photo).length > 0
      )
      .sort((a, b) =>
        sha256(`DL-001-PHOTO-${restaurant.restaurant_id}-${a.photo_id}`).localeCompare(
          sha256(`DL-001-PHOTO-${restaurant.restaurant_id}-${b.photo_id}`)
        )
      );
    selected.push(...required, ...fillers.slice(0, MAX_PHOTOS_PER_RESTAURANT - required.length));
  }
  if (selected.length === 0) {
    throw new Error("Photo selection was empty; refusing to publish an incomplete bundle");
  }
  if (selected.length > MAX_PHOTOS_TOTAL) {
    throw new Error(`Photo selection ${selected.length} exceeds ${MAX_PHOTOS_TOTAL}`);
  }
  return selected;
}

function sanitizedMenuRow(row) {
  return {
    menuItemId: row.menu_item_id,
    canonicalDishId: row.canonical_dish_id,
    itemName: row.item_name,
    canonicalName: row.canonical_name,
    canonicalNormalizedName: row.canonical_normalized_name,
    sourceAliases: [],
    source: row.source,
    confidence: row.confidence,
    active: row.active,
    sourceSnapshotId: row.source_snapshot_id,
    snapshotSource: row.snapshot_source,
    snapshotStatus: row.snapshot_status,
    sourceKeySha256: row.source_key ? sha256(row.source_key) : null,
    firstObservedDate: row.first_observed_date,
    observedDate: row.observed_date,
    benchmarkFresh: row.benchmark_fresh,
    canonicalConfidence: row.canonical_confidence,
    locationOrTemplate: row.location_or_template,
    publicBrandName: row.public_brand_name,
  };
}

function addAliases(menuRows) {
  const aliasesByCanonical = new Map();
  for (const row of menuRows) {
    if (!row.canonicalDishId) continue;
    const aliases = aliasesByCanonical.get(row.canonicalDishId) || new Set();
    aliases.add(row.itemName);
    aliasesByCanonical.set(row.canonicalDishId, aliases);
  }
  return menuRows.map((row) => ({
    ...row,
    sourceAliases: row.canonicalDishId
      ? [...(aliasesByCanonical.get(row.canonicalDishId) || [])].sort()
      : [row.itemName],
  }));
}

function publicCandidate(row) {
  const classification = classifyCandidate(row);
  return {
    stableRestaurantId: row.restaurant_id,
    entityId: row.entity_id,
    publicRestaurantName: row.restaurant_name,
    coordinates: { lat: row.lat, lng: row.lng },
    inclusionDecision: {
      included: true,
      basis: BOUNDS.meaning,
      bounds: BOUNDS,
    },
    restaurantStatus: row.restaurant_status,
    entityStatus: row.entity_status,
    currentMenuDishCount: row.current_menu_count,
    benchmarkFreshMenuDishCount: row.benchmark_fresh_menu_count,
    activeUsefulPhotoCandidateCount: row.useful_photo_count,
    recomputedV2ComparisonDishCount: row.sql_claim_count,
    recomputedV2DishKeys: row.sql_claim_keys,
    storedActiveComparisonReadyPhotoCount: row.stored_active_flag_count,
    storedAllComparisonReadyPhotoCount: row.stored_all_flag_count,
    storedComparisonReadyDishKeys: row.stored_flag_keys,
    claimMechanisms: [
      ...(row.sql_claim_count > 0 ? ["coverage_v2_recomputation"] : []),
      ...(row.stored_all_flag_count > 0 ? ["stored_comparison_ready_signal"] : []),
    ],
    bucket: classification.bucket,
    bucketReason: classification.reason,
    rank: stableRank(row.restaurant_id),
  };
}

function sanitizePhotoRow(photo, rendered, evidenceId) {
  const exactResult =
    Number(photo.active_restaurant_exact_group_size) > 1
      ? "active_exact_duplicate_group"
      : "no_active_same_restaurant_exact_duplicate";
  const perceptualResult =
    Number(photo.active_restaurant_perceptual_group_size) > 1
      ? "legitimate_or_duplicate_near_match_requires_guardian_review"
      : "no_same_restaurant_perceptual_group";
  return {
    evidenceId,
    photoId: photo.photo_id,
    stableRestaurantId: photo.restaurant_id,
    entityId: photo.entity_id,
    menuItemId: photo.menu_item_id,
    canonicalDishId: photo.canonical_dish_id,
    dishKeys: photo.dish_keys,
    menuLinks: photo.menu_links,
    geminiLabel: photo.gemini_label,
    source: photo.source,
    sourcePlatform: photo.source_platform,
    legacyAttribution: photo.attribution,
    storedAuthorType: photo.photo_author_type,
    attributionConfidence: photo.attribution_confidence,
    trustLabel: photo.trust_label,
    authorEvidence: authorBasis(photo),
    state: {
      active: photo.active,
      moderation: photo.moderation_status,
      orderable: photo.is_orderable,
      storefront: photo.is_storefront,
      menuPhoto: photo.is_menu_photo,
      storedComparisonReady: photo.comparison_ready,
    },
    tier: photo.tier,
    storedDimensions: { width: photo.width, height: photo.height },
    firstObservedDate: photo.first_observed_date,
    lastObservedDate: photo.last_observed_date,
    hashes: {
      duplicateHash: photo.duplicate_hash,
      storedContentSha256: photo.content_hash,
      storedPerceptualHash: photo.perceptual_hash,
      duplicateOfPhotoId: photo.duplicate_of_photo_id,
      dedupeReason: photo.dedupe_reason,
      fetchedOriginalSha256: rendered.originalSha256,
      evidenceSha256: rendered.evidenceSha256,
      storedContentHashMatchesFetchedBytes:
        photo.content_hash != null && photo.content_hash === rendered.originalSha256,
    },
    rightsStatus: photo.rights_status,
    evidenceFile: `images/${evidenceId}.webp`,
    accessibilityAtSnapshot: {
      accessible: true,
      mechanism: rendered.mechanism,
      originalBytes: rendered.originalBytes,
      evidenceBytes: rendered.evidenceBytes,
      decodedOriginal: rendered.decodedOriginal,
    },
    sourceAttachmentEvidence: {
      primaryLocator: redactLocator(photo.storage_url || photo.origin_url),
      allObservedLocators: locatorCandidates(photo).map(redactLocator),
      selectedLocator: rendered.selectedLocator,
      originCount: photo.origin_count,
      originSourceCount: photo.origin_source_count,
    },
    duplicateGroups: {
      repeatedOriginUrlCount: photo.repeated_origin_url_count,
      activeSameRestaurantExactGroupSize: photo.active_restaurant_exact_group_size,
      activeCrossRestaurantExactLocations: photo.active_cross_restaurant_exact_locations,
      activeSameRestaurantPerceptualGroupSize: photo.active_restaurant_perceptual_group_size,
      exactResult,
      perceptualResult,
      attachedToMultipleMenuItems: photo.menu_links.length > 1,
    },
  };
}

async function createManifest(stagingRoot) {
  const files = (await listFiles(stagingRoot)).filter(
    (file) => path.basename(file) !== "SHA256SUMS"
  );
  const lines = [];
  for (const file of files) {
    lines.push(`${sha256(await readFile(file))}  ${path.relative(stagingRoot, file)}`);
  }
  await writeFile(path.join(stagingRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

async function secretScan(stagingRoot) {
  const secretValues = Object.fromEntries(
    SECRET_ENV_NAMES.map((name) => [name, process.env[name]]).filter(([, value]) => value)
  );
  const files = await listFiles(stagingRoot);
  const leaks = [];
  for (const file of files) {
    if (file.endsWith(".webp")) continue;
    const text = await readFile(file, "utf8");
    for (const name of findSecretLeaks(text, secretValues)) {
      leaks.push(`${path.relative(stagingRoot, file)}:${name}`);
    }
  }
  if (leaks.length) throw new Error(`Secret scan failed: ${leaks.join(", ")}`);
}

async function main() {
  const { mirror } = parseArgs(process.argv);
  process.loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (await pathExists(OUTPUT_ROOT)) {
    throw new Error(`Refusing to overwrite existing completed bundle: ${OUTPUT_ROOT}`);
  }
  if (mirror && (await pathExists(mirror))) {
    throw new Error(`Refusing to overwrite existing mirror: ${mirror}`);
  }

  const tempParent = await mkdtemp(path.join(tmpdir(), "seefood-dl001-"));
  const stagingRoot = path.join(tempParent, "DL-001");
  await mkdir(path.join(stagingRoot, "menu-evidence"), { recursive: true });
  await mkdir(path.join(stagingRoot, "photo-evidence/images"), { recursive: true });
  await mkdir(path.join(stagingRoot, "guardian/menu"), { recursive: true });
  await mkdir(path.join(stagingRoot, "guardian/images"), { recursive: true });

  const client = new Client({
    connectionString: databaseConnectionString(),
    statement_timeout: 60_000,
    application_name: "seefood_dl001_forced_read_only_export",
  });
  let transactionProof;
  let candidatesRaw;
  let menuRaw;
  let photosRaw;
  let schemaProof;
  const exportStartedAt = new Date();

  try {
    await client.connect();
    await client.query("begin transaction isolation level repeatable read read only");
    const proofResult = await client.query(
      "select current_setting('transaction_read_only') as transaction_read_only, current_setting('transaction_isolation') as transaction_isolation, transaction_timestamp()::text as transaction_timestamp"
    );
    transactionProof = proofResult.rows[0];
    if (
      transactionProof.transaction_read_only !== "on" ||
      transactionProof.transaction_isolation !== "repeatable read"
    ) {
      throw new Error(`Database did not confirm required transaction mode`);
    }

    candidatesRaw = (
      await client.query(CANDIDATE_QUERY, [
        BOUNDS.minLat,
        BOUNDS.maxLat,
        BOUNDS.minLng,
        BOUNDS.maxLng,
      ])
    ).rows;
    const candidates = candidatesRaw.map(publicCandidate);
    const selected = selectBucketCandidates(candidates);
    for (const bucket of ["sql_claimed", "rich_unpaired", "sparse"]) {
      if (candidates.filter((row) => row.bucket === bucket).length < 4) {
        throw new Error(`Fewer than four candidates in ${bucket}`);
      }
      if (selected.filter((row) => row.bucket === bucket).length !== 4) {
        throw new Error(`Selection did not contain exactly four ${bucket} candidates`);
      }
    }

    const selectedRestaurants = selected.map((row) => ({
      ...row,
      selectedClaimDishKey:
        row.bucket === "sql_claimed"
          ? [...row.recomputedV2DishKeys].sort((a, b) =>
              sha256(`DL-001-CLAIM-${row.stableRestaurantId}-${a}`).localeCompare(
                sha256(`DL-001-CLAIM-${row.stableRestaurantId}-${b}`)
              )
            )[0]
          : null,
    }));
    const selectedIds = selectedRestaurants.map((row) => row.stableRestaurantId);
    menuRaw = (await client.query(MENU_QUERY, [selectedIds])).rows;
    photosRaw = (await client.query(PHOTO_QUERY, [selectedIds])).rows;
    schemaProof = (await client.query(SCHEMA_QUERY)).rows[0];
    await client.query("rollback");
    await client.end();

    const menuRows = addAliases(menuRaw.map(sanitizedMenuRow));
    const selectedPhotos = choosePhotos(selectedRestaurants, photosRaw);
    const readR2 = createR2Reader();
    const photoEvidence = [];

    for (let index = 0; index < selectedPhotos.length; index += 1) {
      const photo = selectedPhotos[index];
      const evidenceId = `P${String(index + 1).padStart(3, "0")}`;
      const imageTarget = path.join(stagingRoot, "photo-evidence/images", `${evidenceId}.webp`);
      const rendered = await renderEvidencePhoto(photo, imageTarget, readR2);
      await cp(imageTarget, path.join(stagingRoot, "guardian/images", `${evidenceId}.webp`));
      photoEvidence.push(sanitizePhotoRow(photo, rendered, evidenceId));
    }

    const menuFileRecords = [];
    const selectionMap = [];
    for (let index = 0; index < selectedRestaurants.length; index += 1) {
      const restaurant = selectedRestaurants[index];
      const selectionId = `R${String(index + 1).padStart(2, "0")}`;
      const guardianId = `G${String(index + 1).padStart(2, "0")}`;
      const rows = menuRows.filter(
        (row) => menuRaw.find((raw) => raw.menu_item_id === row.menuItemId)?.restaurant_id ===
          restaurant.stableRestaurantId
      );
      const menuPayload = {
        selectionId,
        stableRestaurantId: restaurant.stableRestaurantId,
        entityId: restaurant.entityId,
        publicRestaurantName: restaurant.publicRestaurantName,
        evidenceRows: rows,
      };
      const menuPath = path.join(stagingRoot, "menu-evidence", `${selectionId}.json`);
      await writeJson(menuPath, menuPayload);
      const guardianMenuPath = path.join(stagingRoot, "guardian/menu", `${guardianId}.json`);
      await writeJson(guardianMenuPath, {
        guardianRestaurantId: guardianId,
        publicRestaurantName: restaurant.publicRestaurantName,
        evidenceRows: rows,
      });
      menuFileRecords.push({
        selectionId,
        path: `menu-evidence/${selectionId}.json`,
        sha256: sha256(await readFile(menuPath)),
        rowCount: rows.length,
        benchmarkFreshRowCount: rows.filter((row) => row.benchmarkFresh).length,
      });
      selectionMap.push({
        selectionId,
        guardianRestaurantId: guardianId,
        stableRestaurantId: restaurant.stableRestaurantId,
      });
    }

    const candidateRows = candidatesRaw.map(publicCandidate);
    const bucketCounts = Object.fromEntries(
      ["sql_claimed", "rich_unpaired", "sparse", "not_selected_bucket"].map((bucket) => [
        bucket,
        candidateRows.filter((row) => row.bucket === bucket).length,
      ])
    );
    const selectedPublic = selectedRestaurants.map((restaurant, index) => ({
      selectionId: `R${String(index + 1).padStart(2, "0")}`,
      ...restaurant,
      menuEvidence: menuFileRecords[index],
      selectedPhotoCount: photoEvidence.filter(
        (photo) => photo.stableRestaurantId === restaurant.stableRestaurantId
      ).length,
      selectedClaimPhotoCount: restaurant.selectedClaimDishKey
        ? photoEvidence.filter(
            (photo) =>
              photo.stableRestaurantId === restaurant.stableRestaurantId &&
              photo.dishKeys.includes(restaurant.selectedClaimDishKey)
          ).length
        : 0,
      allSelectedClaimPhotosIncluded: restaurant.selectedClaimDishKey
        ? photosRaw.filter(
            (photo) =>
              photo.restaurant_id === restaurant.stableRestaurantId &&
              photo.dish_keys.includes(restaurant.selectedClaimDishKey)
          ).length ===
          photoEvidence.filter(
            (photo) =>
              photo.stableRestaurantId === restaurant.stableRestaurantId &&
              photo.dishKeys.includes(restaurant.selectedClaimDishKey)
          ).length
        : null,
    }));
    if (
      selectedPublic.some(
        (restaurant) =>
          restaurant.selectedClaimDishKey && !restaurant.allSelectedClaimPhotosIncluded
      )
    ) {
      throw new Error("At least one selected claim dish was not exported completely");
    }
    const recomputedClaims = candidateRows
      .filter((row) => row.recomputedV2ComparisonDishCount > 0)
      .map((row) => ({
        stableRestaurantId: row.stableRestaurantId,
        entityId: row.entityId,
        publicRestaurantName: row.publicRestaurantName,
        comparisonDishCount: row.recomputedV2ComparisonDishCount,
        dishKeys: row.recomputedV2DishKeys,
        mechanism: "exact_current_coverage_v2_association_recomputation",
      }));
    const storedClaims = candidateRows
      .filter((row) => row.storedAllComparisonReadyPhotoCount > 0)
      .map((row) => ({
        stableRestaurantId: row.stableRestaurantId,
        entityId: row.entityId,
        publicRestaurantName: row.publicRestaurantName,
        activeFlaggedPhotoCount: row.storedActiveComparisonReadyPhotoCount,
        allFlaggedPhotoCount: row.storedAllComparisonReadyPhotoCount,
        dishKeys: row.storedComparisonReadyDishKeys,
        mechanism: "stored_photo_comparison_ready_flag",
      }));

    await writeJson(path.join(stagingRoot, "candidate-metadata.json"), {
      scope: BOUNDS,
      candidateCount: candidateRows.length,
      candidates: candidateRows,
    });
    await writeJson(path.join(stagingRoot, "recomputed-v2-claims.json"), recomputedClaims);
    await writeJson(path.join(stagingRoot, "stored-flag-claims.json"), storedClaims);
    await writeJson(path.join(stagingRoot, "selected-restaurants.json"), selectedPublic);
    await writeJson(path.join(stagingRoot, "selection-map.json"), selectionMap);
    await writeJson(path.join(stagingRoot, "photo-evidence/metadata.json"), {
      photoCount: photoEvidence.length,
      maxPerRestaurant: MAX_PHOTOS_PER_RESTAURANT,
      maxTotal: MAX_PHOTOS_TOTAL,
      photos: photoEvidence,
    });
    await writeJson(path.join(stagingRoot, "redaction-log.json"), {
      result: "passed",
      removedOrExcluded: [
        "database and storage credentials",
        "raw source and storage URLs; only coarse host/path classes and SHA-256 locator hashes remain",
        "contributor identifiers and contributor names",
        "phone numbers and email addresses",
        "free-text customer content and review text",
        "device, visitor, and session identifiers",
        "payment and merchant-claim records",
        "precise personal timestamps; retained observation dates are non-personal and date-only",
        "menu descriptions and prices",
        "camera metadata; evidence renders are newly encoded WebP files",
      ],
      retained: [
        "public business names and coordinates",
        "stable corpus IDs",
        "menu item names and source aliases",
        "source, attribution classification, confidence, rights, and duplicate evidence",
      ],
      automatedChecks: {
        knownEnvironmentSecretValueScan: "run_before_completion",
        boundedPhotoCount: photoEvidence.length <= MAX_PHOTOS_TOTAL,
        noLiveFetchNeededByDataLab: true,
      },
    });
    await writeJson(path.join(stagingRoot, "reproducibility.json"), {
      exportTimestamp: exportStartedAt.toISOString(),
      transactionProof: {
        readOnly: transactionProof.transaction_read_only,
        isolation: transactionProof.transaction_isolation,
        transactionTimestamp: transactionProof.transaction_timestamp,
      },
      schema: {
        databaseIdentity: sha256(schemaProof.database_name),
        schemaName: schemaProof.schema_name,
        serverMajorVersion: String(schemaProof.server_version).split(".")[0],
        relevantSchema: schemaProof.relevant_schema,
        mainCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim(),
        latestRelevantMigration: "db/migrations/2026-07-23-photo-content-coverage.sql",
      },
      selection: {
        seed: "DL-001-CAL-2026-07-23",
        scope: BOUNDS,
        bucketCounts,
        selectedRestaurantCount: selectedRestaurants.length,
        menuRowCount: menuRows.length,
        photoRowCount: photoEvidence.length,
      },
      files: {
        exactQueries: "queries.sql",
        menuEvidence: menuFileRecords,
        guardianPacket: "guardian/packet.json",
        manifest: "SHA256SUMS (the manifest excludes itself by definition)",
      },
    });
    await writeFile(
      path.join(stagingRoot, "queries.sql"),
      [
        "-- Exact read-only DL-001 export queries.",
        "-- Parameters: $1 minLat/restaurantIds, $2 maxLat, $3 minLng, $4 maxLng as applicable.",
        "",
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
        "",
        "-- Transaction proof",
        "select current_setting('transaction_read_only'), current_setting('transaction_isolation'), transaction_timestamp();",
        "",
        "-- Candidate metadata and exact V2 recomputation",
        CANDIDATE_QUERY.trim(),
        ";",
        "",
        "-- Selected current menu evidence",
        MENU_QUERY.trim(),
        ";",
        "",
        "-- Selected photo, association, provenance, and duplicate evidence",
        PHOTO_QUERY.trim(),
        ";",
        "",
        "-- Relevant schema proof",
        SCHEMA_QUERY.trim(),
        ";",
        "",
        "ROLLBACK;",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(stagingRoot, "READ_ONLY_ATTESTATION.md"),
      `# Read-only attestation

The main SeeFood thread created this bundle from one direct PostgreSQL
transaction opened as \`REPEATABLE READ READ ONLY\`. PostgreSQL returned
\`transaction_read_only=on\` and \`transaction_isolation=repeatable read\`.

The exporter executes only BEGIN, SHOW-equivalent SELECT statements, SELECT
queries, and ROLLBACK. It does not import the application database client, call
an API route or RPC, execute a trigger-capable statement, fill an application
cache, upload to storage, or write any production record.

Image evidence was obtained only through bounded read operations: direct R2
\`GetObject\`, direct Google Places photo GET, or direct source HTTP GET.
The exporter imports \`GetObjectCommand\` and contains no storage write command.
DataLab receives only local evidence renders and needs no credential or live
network access.
`,
      "utf8"
    );
    await writeFile(
      path.join(stagingRoot, "README.md"),
      `# DL-001 sanitized baseline bundle

This ignored local bundle unblocks the stopped DL-001 calibration experiment.
It contains every mechanically eligible restaurant candidate inside a fixed
calibration rectangle, the hash-selected 12-restaurant cohort, current menu
evidence, at most ten photos per restaurant, duplicate/provenance evidence, and
a blind Guardian packet.

The rectangle is a bounded calibration scope, not a claim that every included
business is legally or operationally inside the City of Temecula. The Guardian
must audit geographic and operating eligibility. The selection intentionally
remains mechanical; convenience stores or other borderline candidates were not
hand-edited out.

The Guardian packet omits bucket and SQL/stored-claim labels. The map back to
stable corpus IDs is outside that packet in \`selection-map.json\`; evaluators
must not open it until the blind audit is complete.

Verify all files with \`sha256sum -c SHA256SUMS\`. DataLab must not fetch missing
evidence, use production credentials, or grade the implementation itself.
`,
      "utf8"
    );

    const guardianPhotos = photoEvidence.map((photo) => {
      const map = selectionMap.find(
        (entry) => entry.stableRestaurantId === photo.stableRestaurantId
      );
      const {
        stableRestaurantId: _stableRestaurantId,
        entityId: _entityId,
        photoId: _photoId,
        ...blindPhoto
      } = photo;
      const {
        storedComparisonReady: _storedComparisonReady,
        ...blindState
      } = blindPhoto.state;
      return {
        guardianRestaurantId: map.guardianRestaurantId,
        ...blindPhoto,
        state: blindState,
        evidenceFile: `images/${photo.evidenceId}.webp`,
      };
    });
    await writeJson(path.join(stagingRoot, "guardian/packet.json"), {
      purpose: "blind_guardian_item_provenance_accessibility_rights_duplicate_audit",
      labelsWithheld: [
        "calibration bucket",
        "recomputed SQL claim",
        "stored comparison_ready claim",
        "stable production restaurant/entity/photo IDs",
      ],
      restaurants: selectedPublic.map((restaurant, index) => ({
        guardianRestaurantId: `G${String(index + 1).padStart(2, "0")}`,
        publicRestaurantName: restaurant.publicRestaurantName,
        coordinates: restaurant.coordinates,
        menuEvidence: `menu/${`G${String(index + 1).padStart(2, "0")}`}.json`,
        photos: guardianPhotos.filter(
          (photo) =>
            photo.guardianRestaurantId === `G${String(index + 1).padStart(2, "0")}`
        ),
      })),
    });
    await writeFile(
      path.join(stagingRoot, "guardian/README.md"),
      `# Blind Guardian packet

Audit these opaque restaurant records for current menu evidence, item matching,
Management/Customer provenance, accessibility, rights, exact duplicates,
near-duplicates, multi-item attachment, and legitimate chain/template reuse.
Do not open files outside this directory until the blind decisions are locked.
`,
      "utf8"
    );

    await secretScan(stagingRoot);
    await createManifest(stagingRoot);
    await secretScan(stagingRoot);

    await mkdir(path.dirname(OUTPUT_ROOT), { recursive: true });
    await rename(stagingRoot, OUTPUT_ROOT);
    if (mirror) {
      await mkdir(path.dirname(mirror), { recursive: true });
      await cp(OUTPUT_ROOT, mirror, { recursive: true, errorOnExist: true, force: false });
    }
    await makeReadOnly(OUTPUT_ROOT);
    if (mirror) await makeReadOnly(mirror);
    await rm(tempParent, { recursive: true, force: true });

    console.log(
      JSON.stringify(
        {
          status: "complete",
          output: OUTPUT_ROOT,
          mirror,
          transaction: transactionProof,
          candidateCount: candidateRows.length,
          bucketCounts,
          selectedRestaurantCount: selectedRestaurants.length,
          menuRowCount: menuRows.length,
          photoRowCount: photoEvidence.length,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    try {
      await client.end();
    } catch {}
    await rm(tempParent, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
