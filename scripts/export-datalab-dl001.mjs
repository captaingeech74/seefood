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
import { randomBytes } from "node:crypto";
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
  canonicalRosterHash,
  CLAIM_DISH_RANK_FORMULA,
  claimDishRank,
  classifyCandidate,
  findSecretLeaks,
  GUARDIAN_ORDER_FORMULA,
  guardianOrderRank,
  hammingDistanceHex,
  PHOTO_RANK_FORMULA,
  photoRank,
  redactLocator,
  selectBucketCandidates,
  sha256,
  stableRank,
} from "./datalab-export-lib.mjs";

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, "data-lab/raw/baseline/DL-001");
const UNBLINDING_OUTPUT = path.join(
  ROOT,
  "data-lab/raw/baseline/DL-001-GUARDIAN-UNBLINDING.json"
);
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
with scoped_entities as (
  select
    e.id as entity_id,
    e.legacy_place_id,
    e.name as entity_name,
    e.lat,
    e.lng,
    e.status as entity_status
  from restaurant_entities e
  where e.status <> 'test_fixture'
    and e.lat is not null
    and e.lng is not null
    and e.lat between $1 and $2
    and e.lng between $3 and $4
),
scoped_restaurants as (
  select
    e.entity_id,
    r.place_id,
    r.name as restaurant_name,
    r.status as restaurant_status,
    r.lat as restaurant_lat,
    r.lng as restaurant_lng,
    r.last_crawled_at
  from scoped_entities e
  left join restaurants r on r.entity_id = e.entity_id
),
entity_identity as (
  select
    e.entity_id,
    coalesce(
      nullif(e.legacy_place_id, ''),
      min(r.place_id),
      'entity-' || e.entity_id::text
    ) as stable_restaurant_id,
    case
      when nullif(e.legacy_place_id, '') is not null then 'restaurant_entities.legacy_place_id'
      when min(r.place_id) is not null
        then 'lexicographically_smallest_attached_restaurant.place_id'
      else 'entity_id_fallback_for_entity_without_attached_restaurant'
    end as stable_restaurant_id_basis,
    jsonb_agg(
      jsonb_build_object(
        'restaurantId', r.place_id,
        'publicName', r.restaurant_name,
        'status', r.restaurant_status,
        'coordinates', jsonb_build_object('lat', r.restaurant_lat, 'lng', r.restaurant_lng),
        'lastCrawledEvidencePresent',
          coalesce(r.last_crawled_at, '{}'::jsonb) <> '{}'::jsonb
      )
      order by r.place_id
    ) filter (where r.place_id is not null) as attached_restaurants
  from scoped_entities e
  left join scoped_restaurants r on r.entity_id = e.entity_id
  group by e.entity_id, e.legacy_place_id
),
menu_counts as (
  select
    e.entity_id,
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
  from scoped_entities e
  left join scoped_restaurants r on r.entity_id = e.entity_id
  left join menu_items m on m.restaurant_id = r.place_id
  group by e.entity_id
),
physical_photos as (
  select
    r.entity_id,
    p.id as photo_id,
    p.photo_author_type,
    coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    ) as primary_dish_key
  from scoped_restaurants r
  join photos p on p.restaurant_id = r.place_id
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
),
photo_associations as (
  select entity_id, photo_id, photo_author_type, primary_dish_key as dish_key
  from physical_photos
  union
  select
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
    entity_id,
    array_agg(dish_key order by dish_key) as sql_claim_keys,
    count(*)::int as sql_claim_count
  from (
    select entity_id, dish_key
    from photo_associations
    where dish_key is not null
    group by entity_id, dish_key
    having bool_or(photo_author_type = 'management')
       and bool_or(photo_author_type = 'customer')
  ) claim_dishes
  group by entity_id
),
v2_photo_counts as (
  select
    entity_id,
    count(distinct photo_id)::int as v2_photo_count,
    count(distinct photo_id) filter (where dish_key is not null)::int as v2_matched_photo_count,
    count(distinct dish_key) filter (where dish_key is not null)::int as v2_matched_dish_count
  from photo_associations
  group by entity_id
),
useful_photos as (
  select
    e.entity_id,
    count(distinct p.id)::int as useful_photo_count
  from scoped_entities e
  left join scoped_restaurants r on r.entity_id = e.entity_id
  left join photos p
    on p.restaurant_id = r.place_id
   and p.active
   and p.moderation_status = 'approved'
   and coalesce(p.is_orderable, true)
   and not coalesce(p.is_storefront, false)
   and not coalesce(p.is_menu_photo, false)
   and p.dedupe_reason is null
   and coalesce(p.storage_url, p.origin_url) is not null
  group by e.entity_id
),
stored_flags as (
  select
    e.entity_id,
    count(*) filter (where p.active and p.comparison_ready)::int as stored_active_flag_count,
    count(*) filter (where not p.active and p.comparison_ready)::int as stored_inactive_flag_count,
    count(*) filter (
      where p.comparison_ready
        and coalesce(
          p.canonical_dish_id::text,
          case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
        ) is null
    )::int as stored_null_dish_key_flag_count,
    array_agg(distinct coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    )) filter (
      where p.comparison_ready
        and coalesce(
          p.canonical_dish_id::text,
          case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
        ) is not null
    ) as stored_flag_keys
  from scoped_entities e
  left join scoped_restaurants r on r.entity_id = e.entity_id
  left join photos p on p.restaurant_id = r.place_id
  group by e.entity_id
),
operating_evidence as (
  select
    e.entity_id,
    (
      select count(*)::int from restaurant_identities ri
      where ri.entity_id = e.entity_id and ri.active
    ) as active_identity_count,
    (
      select array_agg(distinct ri.provider order by ri.provider)
      from restaurant_identities ri
      where ri.entity_id = e.entity_id and ri.active
    ) as active_identity_providers,
    (
      select max(ri.last_seen_at)::date::text from restaurant_identities ri
      where ri.entity_id = e.entity_id and ri.active
    ) as latest_active_identity_date,
    (
      select count(*)::int from source_snapshots ss
      where ss.entity_id = e.entity_id and ss.status = 'succeeded'
    ) as successful_snapshot_count,
    (
      select max(ss.completed_at)::date::text from source_snapshots ss
      where ss.entity_id = e.entity_id and ss.status = 'succeeded'
    ) as latest_successful_snapshot_date,
    (
      select max(m.last_seen_at)::date::text
      from scoped_restaurants r join menu_items m on m.restaurant_id = r.place_id
      where r.entity_id = e.entity_id and m.active
    ) as latest_active_menu_observation_date,
    (
      select max(p.last_seen_at)::date::text
      from scoped_restaurants r join photos p on p.restaurant_id = r.place_id
      where r.entity_id = e.entity_id and p.active
    ) as latest_active_photo_observation_date
  from scoped_entities e
)
select
  e.entity_id::text,
  i.stable_restaurant_id,
  i.stable_restaurant_id_basis,
  e.entity_name,
  e.lat,
  e.lng,
  e.entity_status,
  coalesce(i.attached_restaurants, '[]'::jsonb) as attached_restaurants,
  coalesce(m.current_menu_count, 0)::int as current_menu_count,
  coalesce(m.benchmark_fresh_menu_count, 0)::int as benchmark_fresh_menu_count,
  coalesce(v.v2_photo_count, 0)::int as v2_photo_count,
  coalesce(v.v2_matched_photo_count, 0)::int as v2_matched_photo_count,
  coalesce(v.v2_matched_dish_count, 0)::int as v2_matched_dish_count,
  coalesce(u.useful_photo_count, 0)::int as useful_photo_count,
  coalesce(c.sql_claim_count, 0)::int as sql_claim_count,
  coalesce(c.sql_claim_keys, array[]::text[]) as sql_claim_keys,
  coalesce(f.stored_active_flag_count, 0)::int as stored_active_flag_count,
  coalesce(f.stored_inactive_flag_count, 0)::int as stored_inactive_flag_count,
  coalesce(f.stored_null_dish_key_flag_count, 0)::int as stored_null_dish_key_flag_count,
  coalesce(f.stored_flag_keys, array[]::text[]) as stored_flag_keys,
  coalesce(o.active_identity_count, 0)::int as active_identity_count,
  coalesce(o.active_identity_providers, array[]::text[]) as active_identity_providers,
  o.latest_active_identity_date,
  coalesce(o.successful_snapshot_count, 0)::int as successful_snapshot_count,
  o.latest_successful_snapshot_date,
  o.latest_active_menu_observation_date,
  o.latest_active_photo_observation_date
from scoped_entities e
join entity_identity i on i.entity_id = e.entity_id
left join menu_counts m on m.entity_id = e.entity_id
left join v2_photo_counts v on v.entity_id = e.entity_id
left join useful_photos u on u.entity_id = e.entity_id
left join claims c on c.entity_id = e.entity_id
left join stored_flags f on f.entity_id = e.entity_id
left join operating_evidence o on o.entity_id = e.entity_id
order by i.stable_restaurant_id`;

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
where r.entity_id = any($1::uuid[])
  and m.active
order by r.entity_id, m.restaurant_id, coalesce(cd.normalized_name, lower(m.name)), m.source, m.id`;

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
  join restaurants r on r.place_id = p.restaurant_id
  where r.entity_id = any($1::uuid[])
  union
  select
    l.photo_id,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text) as dish_key,
    m.id::text,
    m.canonical_dish_id::text,
    'preserved_many_to_many_link'::text as link_basis
  from photo_menu_item_links l
  join menu_items m on m.id = l.menu_item_id and m.active
  join restaurants r on r.place_id = m.restaurant_id
  where r.entity_id = any($1::uuid[])
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
  join restaurants r on r.place_id = po.restaurant_id
  where r.entity_id = any($1::uuid[])
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
where r.entity_id = any($1::uuid[])
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

const PRODUCTION_METRIC_QUERY = String.raw`
select coverage_v2_metrics(
  p_min_lat => $1,
  p_max_lat => $2,
  p_min_lng => $3,
  p_max_lng => $4
) as metrics`;

const PRODUCTION_FUNCTION_QUERY = String.raw`
select
  pg_get_functiondef(p.oid) as function_definition,
  p.provolatile,
  p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'coverage_v2_metrics'
order by p.oid desc
limit 1`;

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

function bitsToHex(bits) {
  let value = "";
  for (let index = 0; index < bits.length; index += 4) {
    value += Number.parseInt(bits.slice(index, index + 4).join(""), 2).toString(16);
  }
  return value;
}

async function robustPerceptualSignatures(orientedBytes, width, height) {
  const signatures = [];
  for (const cropRatio of [1, 0.9, 0.8, 0.7]) {
    const cropWidth = Math.max(9, Math.floor(width * cropRatio));
    const cropHeight = Math.max(8, Math.floor(height * cropRatio));
    const left = Math.max(0, Math.floor((width - cropWidth) / 2));
    const top = Math.max(0, Math.floor((height - cropHeight) / 2));
    const pixels = await sharp(orientedBytes)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();
    const bits = [];
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        bits.push(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
      }
    }
    signatures.push({
      transform: cropRatio === 1 ? "full_image" : `center_crop_${Math.round(cropRatio * 100)}pct`,
      dHash64: bitsToHex(bits),
    });
  }
  return signatures;
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
      const oriented = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true });
      const rendered = await sharp(oriented.data)
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
        robustPerceptualSignatures: await robustPerceptualSignatures(
          oriented.data,
          oriented.info.width,
          oriented.info.height
        ),
      };
    } catch (error) {
      errors.push(`${redactLocator(locator)?.locatorSha256}: ${error.message}`);
    }
  }
  throw new Error(`Could not obtain photo ${photo.photo_id}: ${errors.join("; ")}`);
}

function choosePhotos(selectedRestaurants, photos) {
  const selected = [];
  const audits = [];
  for (const restaurant of selectedRestaurants) {
    const rows = photos.filter(
      (photo) => photo.entity_id === restaurant.entityId
    );
    const claimKey = restaurant.selectedClaimDishKey;
    const claimedRows = claimKey
      ? rows.filter((photo) => photo.dish_keys.includes(claimKey))
      : [];
    if (claimedRows.length > MAX_PHOTOS_PER_RESTAURANT) {
      throw new Error(
        `${restaurant.entityId} selected claim has ${claimedRows.length} photos; refusing to truncate`
      );
    }

    const required = claimedRows.sort((a, b) =>
      photoRank(restaurant.entityId, a.photo_id).localeCompare(
        photoRank(restaurant.entityId, b.photo_id)
      )
    );
    if (claimKey && required.length === 0) {
      throw new Error(
        `${restaurant.entityId} selected claim ${claimKey} had no attached photos`
      );
    }
    const requiredIds = new Set(required.map((photo) => photo.photo_id));
    const fullRoster = rows.map((photo) => {
      const exclusionReasons = [
        ...(requiredIds.has(photo.photo_id) ? ["required_claim_dish_photo"] : []),
        ...(photo.moderation_status !== "approved" ? ["moderation_not_approved"] : []),
        ...(photo.is_orderable === false ? ["not_orderable"] : []),
        ...(photo.dedupe_reason ? ["dedupe_rejection_present"] : []),
        ...(locatorCandidates(photo).length === 0 ? ["no_accessible_locator_candidate"] : []),
      ];
      const fillerEligible =
        !requiredIds.has(photo.photo_id) &&
        photo.moderation_status === "approved" &&
        photo.is_orderable !== false &&
        !photo.dedupe_reason &&
        locatorCandidates(photo).length > 0;
      return {
        photo,
        photoId: photo.photo_id,
        restaurantId: photo.restaurant_id,
        dishKeys: photo.dish_keys,
        rank: photoRank(restaurant.entityId, photo.photo_id),
        requiredClaimDishPhoto: requiredIds.has(photo.photo_id),
        fillerEligible,
        exclusionReasons,
      };
    }).sort((a, b) => a.rank.localeCompare(b.rank));
    const fillers = fullRoster
      .filter((entry) => entry.fillerEligible)
      .map((entry) => entry.photo);
    const selectedForEntity = [
      ...required,
      ...fillers.slice(0, MAX_PHOTOS_PER_RESTAURANT - required.length),
    ];
    const selectedIds = new Set(selectedForEntity.map((photo) => photo.photo_id));
    selected.push(...selectedForEntity);
    const claimDishCandidates = restaurant.recomputedV2DishKeys
      .map((dishKey) => ({
        dishKey,
        rank: claimDishRank(restaurant.entityId, dishKey),
        selected: dishKey === claimKey,
      }))
      .sort((a, b) => a.rank.localeCompare(b.rank));
    const rosterRows = fullRoster.map((entry) => ({
      photoId: entry.photoId,
      restaurantId: entry.restaurantId,
      dishKeys: entry.dishKeys,
      rank: entry.rank,
      requiredClaimDishPhoto: entry.requiredClaimDishPhoto,
      fillerEligible: entry.fillerEligible,
      exclusionReasons: entry.exclusionReasons,
      selected: selectedIds.has(entry.photoId),
    }));
    audits.push({
      entityId: restaurant.entityId,
      stableRestaurantId: restaurant.stableRestaurantId,
      claimDishSelection: {
        formula: CLAIM_DISH_RANK_FORMULA,
        candidateCount: claimDishCandidates.length,
        candidates: claimDishCandidates,
        selectedDishKey: claimKey,
      },
      photoSelection: {
        formula: PHOTO_RANK_FORMULA,
        fullCandidateCount: rosterRows.length,
        candidateRosterHash: canonicalRosterHash(rosterRows),
        selectedCount: selectedForEntity.length,
        completeClaimedDishPhotoCount: required.length,
        completeClaimedDishPhotoRoster: rosterRows.filter(
          (entry) => entry.requiredClaimDishPhoto
        ),
        completeCandidateRoster: rosterRows,
      },
    });
  }
  if (selected.length === 0) {
    throw new Error("Photo selection was empty; refusing to publish an incomplete bundle");
  }
  if (selected.length > MAX_PHOTOS_TOTAL) {
    throw new Error(`Photo selection ${selected.length} exceeds ${MAX_PHOTOS_TOTAL}`);
  }
  return { selected, audits };
}

function sanitizedMenuRow(row) {
  return {
    menuItemId: row.menu_item_id,
    restaurantId: row.restaurant_id,
    entityId: row.entity_id,
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
    stableRestaurantId: row.stable_restaurant_id,
    stableRestaurantIdBasis: row.stable_restaurant_id_basis,
    entityId: row.entity_id,
    publicRestaurantName: row.entity_name,
    coordinates: { lat: row.lat, lng: row.lng },
    inclusionDecision: {
      included: true,
      basis: BOUNDS.meaning,
      bounds: BOUNDS,
    },
    entityStatus: row.entity_status,
    attachedRestaurants: row.attached_restaurants,
    attachedRestaurantCount: row.attached_restaurants.length,
    currentMenuDishCount: row.current_menu_count,
    benchmarkFreshMenuDishCount: row.benchmark_fresh_menu_count,
    productionV2PhotoCount: row.v2_photo_count,
    productionV2MatchedPhotoCount: row.v2_matched_photo_count,
    productionV2MatchedDishCount: row.v2_matched_dish_count,
    activeUsefulPhotoCandidateCount: row.useful_photo_count,
    recomputedV2ComparisonDishCount: row.sql_claim_count,
    recomputedV2DishKeys: row.sql_claim_keys,
    currentV2ClaimMechanism:
      row.sql_claim_count > 0 ? "coverage_v2_metrics_entity_recomputation" : null,
    historicalStoredSignalSummary: {
      notACurrentV2Claim: true,
      activeFlaggedPhotoCount: row.stored_active_flag_count,
      inactiveFlaggedPhotoCount: row.stored_inactive_flag_count,
      nullDishKeyFlaggedPhotoCount: row.stored_null_dish_key_flag_count,
      nonNullDishKeys: row.stored_flag_keys,
    },
    operatingStatusEvidence: {
      entityStatus: row.entity_status,
      attachedRestaurantStatuses: row.attached_restaurants.map((restaurant) => ({
        restaurantId: restaurant.restaurantId,
        status: restaurant.status,
        lastCrawledEvidencePresent: restaurant.lastCrawledEvidencePresent,
      })),
      activeProviderIdentityCount: row.active_identity_count,
      activeProviderIdentitySources: row.active_identity_providers,
      latestActiveProviderIdentityDate: row.latest_active_identity_date,
      successfulSourceSnapshotCount: row.successful_snapshot_count,
      latestSuccessfulSourceSnapshotDate: row.latest_successful_snapshot_date,
      latestActiveMenuObservationDate: row.latest_active_menu_observation_date,
      latestActivePhotoObservationDate: row.latest_active_photo_observation_date,
      affirmativeSignals: [
        ...(row.entity_status === "active" ? ["entity_status_active"] : []),
        ...(row.active_identity_count > 0 ? ["active_provider_identity_present"] : []),
        ...(row.successful_snapshot_count > 0 ? ["successful_source_snapshot_present"] : []),
        ...(row.benchmark_fresh_menu_count > 0 ? ["benchmark_fresh_active_menu_present"] : []),
      ],
    },
    bucket: classification.bucket,
    bucketReason: classification.reason,
    rank: stableRank(row.stable_restaurant_id),
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
    restaurantId: photo.restaurant_id,
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
    robustNearDuplicateEvidence: {
      algorithm:
        "minimum Hamming distance across 64-bit dHash signatures for full image and 90%, 80%, and 70% center crops; review-only, never automatic deletion",
      signatures: rendered.robustPerceptualSignatures,
      comparedAgainstSelectedEntityPhotos: [],
      nearestDistance: null,
      result: "pending_pairwise_comparison",
    },
  };
}

function addRobustNearDuplicateEvidence(photos) {
  const byEntity = new Map();
  for (const photo of photos) {
    const rows = byEntity.get(photo.entityId) || [];
    rows.push(photo);
    byEntity.set(photo.entityId, rows);
  }
  for (const rows of byEntity.values()) {
    for (const photo of rows) {
      const comparisons = rows
        .filter((other) => other.evidenceId !== photo.evidenceId)
        .map((other) => {
          let best = null;
          for (const left of photo.robustNearDuplicateEvidence.signatures) {
            for (const right of other.robustNearDuplicateEvidence.signatures) {
              const distance = hammingDistanceHex(left.dHash64, right.dHash64);
              if (!best || distance < best.hammingDistance) {
                best = {
                  otherEvidenceId: other.evidenceId,
                  hammingDistance: distance,
                  thisTransform: left.transform,
                  otherTransform: right.transform,
                  exactFetchedBytes:
                    photo.hashes.fetchedOriginalSha256 === other.hashes.fetchedOriginalSha256,
                };
              }
            }
          }
          return best;
        })
        .filter(Boolean)
        .sort((a, b) =>
          a.hammingDistance - b.hammingDistance ||
          a.otherEvidenceId.localeCompare(b.otherEvidenceId)
        );
      const nearest = comparisons[0] ?? null;
      photo.robustNearDuplicateEvidence.comparedAgainstSelectedEntityPhotos = comparisons;
      photo.robustNearDuplicateEvidence.nearestDistance = nearest?.hammingDistance ?? null;
      photo.robustNearDuplicateEvidence.result = !nearest
        ? "no_other_selected_entity_photo"
        : nearest.exactFetchedBytes
          ? "exact_duplicate_candidate_requires_guardian_review"
          : nearest.hammingDistance <= 6
            ? "strong_crop_or_reencode_candidate_requires_guardian_review"
            : nearest.hammingDistance <= 12
              ? "possible_near_duplicate_requires_guardian_review"
              : "no_close_selected_entity_candidate";
    }
  }
  return photos;
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

function piiFindings(text) {
  const findings = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text)) findings.push("email_pattern");
  if (/(^|[^\d])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/u.test(text)) {
    findings.push("phone_pattern");
  }
  if (/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/u.test(text)) {
    findings.push("jwt_pattern");
  }
  if (
    /"(?:contributorId|contributorName|customerName|email|phone|visitorId|sessionId|deviceId|paymentId|cardNumber)"\s*:/u.test(
      text
    )
  ) {
    findings.push("forbidden_personal_data_key");
  }
  return findings;
}

async function scanStagedFiles(stagingRoot) {
  const secretValues = Object.fromEntries(
    SECRET_ENV_NAMES.map((name) => [name, process.env[name]]).filter(([, value]) => value)
  );
  const files = await listFiles(stagingRoot);
  const results = [];
  const failures = [];
  for (const file of files) {
    const relativePath = path.relative(stagingRoot, file);
    const bytes = await readFile(file);
    const text = file.endsWith(".webp") ? bytes.toString("latin1") : bytes.toString("utf8");
    const secretMatches = findSecretLeaks(text, secretValues);
    const personalDataMatches = file.endsWith(".webp") ? [] : piiFindings(text);
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
        failures.push(`${relativePath}:image_metadata_or_decode`);
      }
    }
    if (secretMatches.length) failures.push(`${relativePath}:secret:${secretMatches.join(",")}`);
    if (personalDataMatches.length) {
      failures.push(`${relativePath}:personal_data:${personalDataMatches.join(",")}`);
    }
    results.push({
      path: relativePath,
      sha256: sha256(bytes),
      environmentSecretValueScan: {
        status: "completed",
        result: secretMatches.length ? "failed" : "passed",
        matches: secretMatches,
      },
      personalDataScan: {
        status: file.endsWith(".webp") ? "not_applicable_binary" : "completed",
        result: personalDataMatches.length ? "failed" : "passed",
        matches: personalDataMatches,
      },
      imageMetadataScan: imageMetadata,
    });
  }
  if (failures.length) throw new Error(`Redaction scan failed: ${failures.join(", ")}`);
  return results;
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
  if (await pathExists(UNBLINDING_OUTPUT)) {
    throw new Error(`Refusing to overwrite existing Guardian unblinding record: ${UNBLINDING_OUTPUT}`);
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
  let productionMetric;
  let productionFunctionProof;
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
    if (candidatesRaw.some((row) => !row.stable_restaurant_id)) {
      throw new Error("At least one scoped entity had neither legacy_place_id nor an attached restaurant");
    }
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
              claimDishRank(row.entityId, a).localeCompare(claimDishRank(row.entityId, b))
            )[0]
          : null,
    }));
    const selectedEntityIds = selectedRestaurants.map((row) => row.entityId);
    menuRaw = (await client.query(MENU_QUERY, [selectedEntityIds])).rows;
    photosRaw = (await client.query(PHOTO_QUERY, [selectedEntityIds])).rows;
    schemaProof = (await client.query(SCHEMA_QUERY)).rows[0];
    productionMetric = (
      await client.query(PRODUCTION_METRIC_QUERY, [
        BOUNDS.minLat,
        BOUNDS.maxLat,
        BOUNDS.minLng,
        BOUNDS.maxLng,
      ])
    ).rows[0].metrics;
    productionFunctionProof = (await client.query(PRODUCTION_FUNCTION_QUERY)).rows[0];
    if (!productionFunctionProof?.function_definition || productionFunctionProof.provolatile !== "s") {
      throw new Error("Could not prove coverage_v2_metrics is the expected stable SQL function");
    }
    await client.query("rollback");
    await client.end();

    const menuRows = addAliases(menuRaw.map(sanitizedMenuRow));
    const {
      selected: selectedPhotos,
      audits: photoSelectionAudits,
    } = choosePhotos(selectedRestaurants, photosRaw);
    const readR2 = createR2Reader();
    const photoEvidence = [];

    for (let index = 0; index < selectedPhotos.length; index += 1) {
      const photo = selectedPhotos[index];
      const evidenceId = `P${String(index + 1).padStart(3, "0")}`;
      const imageTarget = path.join(stagingRoot, "photo-evidence/images", `${evidenceId}.webp`);
      const rendered = await renderEvidencePhoto(photo, imageTarget, readR2);
      photoEvidence.push(sanitizePhotoRow(photo, rendered, evidenceId));
    }
    addRobustNearDuplicateEvidence(photoEvidence);

    const menuFileRecords = [];
    for (let index = 0; index < selectedRestaurants.length; index += 1) {
      const restaurant = selectedRestaurants[index];
      const selectionId = `R${String(index + 1).padStart(2, "0")}`;
      const rows = menuRows.filter((row) => row.entityId === restaurant.entityId);
      const menuPayload = {
        selectionId,
        stableRestaurantId: restaurant.stableRestaurantId,
        entityId: restaurant.entityId,
        publicRestaurantName: restaurant.publicRestaurantName,
        attachedRestaurants: restaurant.attachedRestaurants,
        operatingStatusEvidence: restaurant.operatingStatusEvidence,
        evidenceRows: rows,
      };
      const menuPath = path.join(stagingRoot, "menu-evidence", `${selectionId}.json`);
      await writeJson(menuPath, menuPayload);
      menuFileRecords.push({
        selectionId,
        path: `menu-evidence/${selectionId}.json`,
        sha256: sha256(await readFile(menuPath)),
        rowCount: rows.length,
        benchmarkFreshRowCount: rows.filter((row) => row.benchmarkFresh).length,
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
        (photo) => photo.entityId === restaurant.entityId
      ).length,
      selectedClaimPhotoCount: restaurant.selectedClaimDishKey
        ? photoEvidence.filter(
            (photo) =>
              photo.entityId === restaurant.entityId &&
              photo.dishKeys.includes(restaurant.selectedClaimDishKey)
          ).length
        : 0,
      allSelectedClaimPhotosIncluded: restaurant.selectedClaimDishKey
        ? photosRaw.filter(
            (photo) =>
              photo.entity_id === restaurant.entityId &&
              photo.dish_keys.includes(restaurant.selectedClaimDishKey)
          ).length ===
          photoEvidence.filter(
            (photo) =>
              photo.entityId === restaurant.entityId &&
              photo.dishKeys.includes(restaurant.selectedClaimDishKey)
          ).length
        : null,
      selectionAudit: photoSelectionAudits.find(
        (audit) => audit.entityId === restaurant.entityId
      ),
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
    const historicalStoredSignals = candidateRows
      .filter(
        (row) =>
          row.historicalStoredSignalSummary.activeFlaggedPhotoCount +
            row.historicalStoredSignalSummary.inactiveFlaggedPhotoCount >
          0
      )
      .map((row) => ({
        stableRestaurantId: row.stableRestaurantId,
        entityId: row.entityId,
        publicRestaurantName: row.publicRestaurantName,
        ...row.historicalStoredSignalSummary,
        mechanism: "historical_stored_photo_comparison_ready_flag",
        interpretation:
          "Historical diagnostic signal only. It is not a current coverage_v2_metrics claim and is excluded from DL-001 current-claim buckets.",
      }));

    const recomputedCoverageMetric = {
      identifiedRestaurants: candidateRows.length,
      menuCoverage: candidateRows.filter((row) => row.currentMenuDishCount >= 1).length,
      basicPhotoCoverage: candidateRows.filter((row) => row.productionV2PhotoCount >= 7).length,
      basicMenuPhotoCoverage: candidateRows.filter(
        (row) => row.productionV2MatchedPhotoCount >= 7
      ).length,
      twentyPercentMenuPhotoCoverage: candidateRows.filter(
        (row) =>
          row.currentMenuDishCount > 0 &&
          row.productionV2MatchedPhotoCount >= 7 &&
          row.productionV2MatchedDishCount >= Math.ceil(row.currentMenuDishCount * 0.2)
      ).length,
      fiftyPercentMenuPhotoCoverage: candidateRows.filter(
        (row) =>
          row.currentMenuDishCount > 0 &&
          row.productionV2MatchedPhotoCount >= 7 &&
          row.productionV2MatchedDishCount >= Math.ceil(row.currentMenuDishCount * 0.5)
      ).length,
      comparisonCoverage: candidateRows.filter(
        (row) => row.recomputedV2ComparisonDishCount >= 1
      ).length,
    };
    const coverageKeys = Object.keys(recomputedCoverageMetric);
    const productionMetricParity = Object.fromEntries(
      coverageKeys.map((key) => [
        key,
        {
          productionFunctionValue: Number(productionMetric[key]),
          exporterRecomputationValue: recomputedCoverageMetric[key],
          matches: Number(productionMetric[key]) === recomputedCoverageMetric[key],
        },
      ])
    );
    if (Object.values(productionMetricParity).some((row) => !row.matches)) {
      throw new Error(
        `Exporter entity recomputation did not match coverage_v2_metrics: ${JSON.stringify(
          productionMetricParity
        )}`
      );
    }

    const guardianShuffleSeed = randomBytes(32).toString("hex");
    const guardianOrder = [...selectedPublic].sort((a, b) =>
      guardianOrderRank(guardianShuffleSeed, a.entityId).localeCompare(
        guardianOrderRank(guardianShuffleSeed, b.entityId)
      )
    );
    const guardianMapping = guardianOrder.map((restaurant, index) => ({
      guardianRestaurantId: `G${String(index + 1).padStart(2, "0")}`,
      selectionId: restaurant.selectionId,
      stableRestaurantId: restaurant.stableRestaurantId,
      entityId: restaurant.entityId,
      orderRank: guardianOrderRank(guardianShuffleSeed, restaurant.entityId),
    }));
    const guardianByEntity = new Map(
      guardianMapping.map((entry) => [entry.entityId, entry])
    );
    const guardianPhotoMap = new Map();
    let guardianPhotoIndex = 0;
    for (const restaurant of guardianOrder) {
      const entityPhotos = photoEvidence
        .filter((photo) => photo.entityId === restaurant.entityId)
        .sort((a, b) =>
          photoRank(restaurant.entityId, a.photoId).localeCompare(
            photoRank(restaurant.entityId, b.photoId)
          )
        );
      for (const photo of entityPhotos) {
        guardianPhotoIndex += 1;
        guardianPhotoMap.set(
          photo.evidenceId,
          `GP${String(guardianPhotoIndex).padStart(3, "0")}`
        );
      }
    }

    const guardianRestaurants = [];
    const guardianOpaqueMaps = [];
    for (const restaurant of guardianOrder) {
      const mapping = guardianByEntity.get(restaurant.entityId);
      const entityMenuRows = menuRows
        .filter((row) => row.entityId === restaurant.entityId)
        .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
      const entityPhotos = photoEvidence
        .filter((photo) => photo.entityId === restaurant.entityId)
        .sort((a, b) =>
          guardianPhotoMap.get(a.evidenceId).localeCompare(
            guardianPhotoMap.get(b.evidenceId)
          )
        );
      const menuIdMap = new Map(
        entityMenuRows.map((row, index) => [
          row.menuItemId,
          `GM${String(index + 1).padStart(4, "0")}`,
        ])
      );
      const dishKeys = [...new Set([
        ...entityMenuRows.flatMap((row) =>
          row.canonicalDishId
            ? [row.canonicalDishId]
            : [`menu-${row.menuItemId}`]
        ),
        ...entityPhotos.flatMap((photo) => photo.dishKeys),
      ])].sort((a, b) =>
        sha256(`DL-001-GUARDIAN-DISH|${guardianShuffleSeed}|${restaurant.entityId}|${a}`)
          .localeCompare(
            sha256(`DL-001-GUARDIAN-DISH|${guardianShuffleSeed}|${restaurant.entityId}|${b}`)
          )
      );
      const dishKeyMap = new Map(
        dishKeys.map((dishKey, index) => [
          dishKey,
          `GD${String(index + 1).padStart(4, "0")}`,
        ])
      );
      const snapshotIds = [...new Set(
        entityMenuRows.flatMap((row) => row.sourceSnapshotId ?? [])
      )].sort();
      const snapshotIdMap = new Map(
        snapshotIds.map((snapshotId, index) => [
          snapshotId,
          `GS${String(index + 1).padStart(4, "0")}`,
        ])
      );
      const guardianMenuRows = entityMenuRows.map((row) => ({
        guardianMenuItemId: menuIdMap.get(row.menuItemId),
        guardianCanonicalDishId: row.canonicalDishId
          ? dishKeyMap.get(row.canonicalDishId)
          : null,
        itemName: row.itemName,
        canonicalName: row.canonicalName,
        canonicalNormalizedName: row.canonicalNormalizedName,
        sourceAliases: row.sourceAliases,
        source: row.source,
        confidence: row.confidence,
        active: row.active,
        guardianSourceSnapshotId: row.sourceSnapshotId
          ? snapshotIdMap.get(row.sourceSnapshotId)
          : null,
        snapshotSource: row.snapshotSource,
        snapshotStatus: row.snapshotStatus,
        sourceKeySha256: row.sourceKeySha256,
        firstObservedDate: row.firstObservedDate,
        observedDate: row.observedDate,
        benchmarkFresh: row.benchmarkFresh,
        canonicalConfidence: row.canonicalConfidence,
        locationOrTemplate: row.locationOrTemplate,
        publicBrandName: row.publicBrandName,
      }));
      const guardianMenuPath = path.join(
        stagingRoot,
        "guardian/menu",
        `${mapping.guardianRestaurantId}.json`
      );
      await writeJson(guardianMenuPath, {
        guardianRestaurantId: mapping.guardianRestaurantId,
        publicRestaurantName: restaurant.publicRestaurantName,
        operatingStatusEvidence: {
          ...restaurant.operatingStatusEvidence,
          attachedRestaurantStatuses:
            restaurant.operatingStatusEvidence.attachedRestaurantStatuses.map(
              ({ restaurantId: _restaurantId, ...status }) => status
            ),
        },
        evidenceRows: guardianMenuRows,
      });

      const guardianPhotos = [];
      for (const photo of entityPhotos) {
        const guardianPhotoId = guardianPhotoMap.get(photo.evidenceId);
        await cp(
          path.join(stagingRoot, "photo-evidence/images", `${photo.evidenceId}.webp`),
          path.join(stagingRoot, "guardian/images", `${guardianPhotoId}.webp`)
        );
        const {
          stableRestaurantId: _stableRestaurantId,
          entityId: _entityId,
          photoId: _photoId,
          restaurantId: _restaurantId,
          evidenceId: _evidenceId,
          ...blindPhoto
        } = photo;
        const {
          storedComparisonReady: _storedComparisonReady,
          ...blindState
        } = blindPhoto.state;
        guardianPhotos.push({
          ...blindPhoto,
          guardianPhotoId,
          menuItemId: photo.menuItemId ? menuIdMap.get(photo.menuItemId) ?? null : null,
          canonicalDishId: photo.canonicalDishId
            ? dishKeyMap.get(photo.canonicalDishId) ?? null
            : null,
          dishKeys: photo.dishKeys.map((dishKey) => dishKeyMap.get(dishKey)),
          menuLinks: photo.menuLinks.map((link) => ({
            guardianMenuItemId: link.menuItemId
              ? menuIdMap.get(link.menuItemId) ?? null
              : null,
            guardianCanonicalDishId: link.canonicalDishId
              ? dishKeyMap.get(link.canonicalDishId) ?? null
              : null,
            guardianDishKey: link.dishKey
              ? dishKeyMap.get(link.dishKey) ?? null
              : null,
            basis: link.basis,
          })),
          state: blindState,
          hashes: {
            ...photo.hashes,
            duplicateOfPhotoId: photo.hashes.duplicateOfPhotoId
              ? "withheld_production_reference"
              : null,
          },
          robustNearDuplicateEvidence: {
            ...photo.robustNearDuplicateEvidence,
            comparedAgainstSelectedEntityPhotos:
              photo.robustNearDuplicateEvidence.comparedAgainstSelectedEntityPhotos.map(
                (comparison) => ({
                  ...comparison,
                  otherEvidenceId:
                    guardianPhotoMap.get(comparison.otherEvidenceId) ??
                    "withheld_unselected_reference",
                })
              ),
          },
          evidenceFile: `images/${guardianPhotoId}.webp`,
        });
      }
      guardianRestaurants.push({
        guardianRestaurantId: mapping.guardianRestaurantId,
        publicRestaurantName: restaurant.publicRestaurantName,
        coordinates: restaurant.coordinates,
        operatingStatusEvidence: {
          ...restaurant.operatingStatusEvidence,
          attachedRestaurantStatuses:
            restaurant.operatingStatusEvidence.attachedRestaurantStatuses.map(
              ({ restaurantId: _restaurantId, ...status }) => status
            ),
        },
        menuEvidence: `menu/${mapping.guardianRestaurantId}.json`,
        photos: guardianPhotos,
      });
      guardianOpaqueMaps.push({
        guardianRestaurantId: mapping.guardianRestaurantId,
        menuItemMap: Object.fromEntries(menuIdMap),
        dishKeyMap: Object.fromEntries(dishKeyMap),
        snapshotIdMap: Object.fromEntries(snapshotIdMap),
      });
    }

    const guardianCommitment = {
      purpose: "pre_audit_commitment_without_unblinding_material",
      orderFormula: GUARDIAN_ORDER_FORMULA,
      withheldSeedSha256: sha256(guardianShuffleSeed),
      withheldMappingSha256: canonicalRosterHash(guardianMapping),
      guardianRecordCount: guardianMapping.length,
      seedAndMappingLocation:
        "withheld by the main SeeFood thread outside the delivered DataLab bundle until blind judgments are frozen",
    };
    const guardianUnblindingRecord = {
      warning: "Do not provide to DataLab or Guardian until blind judgments are frozen.",
      shuffleSeed: guardianShuffleSeed,
      seedSha256: guardianCommitment.withheldSeedSha256,
      mappingSha256: guardianCommitment.withheldMappingSha256,
      orderFormula: GUARDIAN_ORDER_FORMULA,
      restaurantMapping: guardianMapping,
      opaqueEvidenceMaps: guardianOpaqueMaps,
    };

    await writeJson(path.join(stagingRoot, "candidate-metadata.json"), {
      scope: BOUNDS,
      candidateCount: candidateRows.length,
      candidates: candidateRows,
    });
    await writeJson(path.join(stagingRoot, "recomputed-v2-claims.json"), recomputedClaims);
    await writeJson(
      path.join(stagingRoot, "historical-stored-comparison-ready-signals.json"),
      {
        interpretation:
          "Historical stored flags are diagnostic only. They are not current V2 claims, do not define buckets, and remain separate from recomputed-v2-claims.json.",
        entityCount: historicalStoredSignals.length,
        signals: historicalStoredSignals,
      }
    );
    await writeJson(path.join(stagingRoot, "selected-restaurants.json"), selectedPublic);
    await writeJson(
      path.join(stagingRoot, "photo-selection-audit.json"),
      {
        claimDishRankFormula: CLAIM_DISH_RANK_FORMULA,
        photoRankFormula: PHOTO_RANK_FORMULA,
        entities: photoSelectionAudits,
      }
    );
    await writeJson(path.join(stagingRoot, "photo-evidence/metadata.json"), {
      photoCount: photoEvidence.length,
      maxPerRestaurant: MAX_PHOTOS_PER_RESTAURANT,
      maxTotal: MAX_PHOTOS_TOTAL,
      nearDuplicateMethod:
        "Review-only multi-crop dHash evidence is computed across every selected photo within each entity; no near-duplicate candidate is automatically removed.",
      photos: photoEvidence,
    });
    await writeJson(path.join(stagingRoot, "production-metric-parity.json"), {
      exactProductionCoverageV2MetricsResult: productionMetric,
      exporterEntityRecomputation: recomputedCoverageMetric,
      perFieldParity: productionMetricParity,
      allCoverageFieldsMatch: true,
      productionFunctionSha256: sha256(productionFunctionProof.function_definition),
      productionFunctionProperties: {
        volatility: productionFunctionProof.provolatile,
        securityDefiner: productionFunctionProof.prosecdef,
      },
    });
    await writeFile(
      path.join(stagingRoot, "coverage-v2-production-function.sql"),
      productionFunctionProof.function_definition,
      "utf8"
    );
    await writeJson(
      path.join(stagingRoot, "GUARDIAN_SHUFFLE_COMMITMENT.json"),
      guardianCommitment
    );
    await writeJson(path.join(stagingRoot, "guardian/packet.json"), {
      purpose: "blind_guardian_item_provenance_accessibility_rights_duplicate_audit",
      labelsWithheld: [
        "calibration bucket",
        "recomputed SQL claim",
        "historical stored comparison_ready signal",
        "stable production restaurant/entity/menu/photo/source-snapshot IDs",
        "selection order",
        "shuffle seed and Guardian mapping",
      ],
      orderAttestation:
        "Guardian IDs were assigned only after an independent withheld-seed shuffle. See ../GUARDIAN_SHUFFLE_COMMITMENT.json.",
      restaurants: guardianRestaurants,
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
        productionCoverageV2FunctionSha256: sha256(
          productionFunctionProof.function_definition
        ),
      },
      productionMetricParity: {
        exactProductionResult: productionMetric,
        exporterEntityRecomputation: recomputedCoverageMetric,
        allCoverageFieldsMatch: true,
      },
      selection: {
        seed: "DL-001-CAL-2026-07-23",
        scope: BOUNDS,
        candidateUnit: "one row per restaurant_entities.id",
        attachedRestaurantRule:
          "include every restaurants row attached to each scoped entity",
        stableRestaurantIdRule:
          "restaurant_entities.legacy_place_id; when absent, lexicographically smallest attached restaurants.place_id",
        bucketCounts,
        selectedEntityCount: selectedRestaurants.length,
        menuRowCount: menuRows.length,
        photoRowCount: photoEvidence.length,
        claimDishRankFormula: CLAIM_DISH_RANK_FORMULA,
        photoRankFormula: PHOTO_RANK_FORMULA,
      },
      guardianBlindness: {
        orderFormula: GUARDIAN_ORDER_FORMULA,
        seedCommitmentSha256: guardianCommitment.withheldSeedSha256,
        mappingCommitmentSha256: guardianCommitment.withheldMappingSha256,
        seedAndMappingDeliveredToDataLab: false,
      },
      files: {
        exactQueries: "queries.sql",
        exactProductionFunction: "coverage-v2-production-function.sql",
        productionMetricParity: "production-metric-parity.json",
        photoSelectionAudit: "photo-selection-audit.json",
        menuEvidence: menuFileRecords,
        guardianPacket: "guardian/packet.json",
        manifest: "SHA256SUMS (the manifest excludes itself by definition)",
      },
    });
    await writeFile(
      path.join(stagingRoot, "queries.sql"),
      [
        "-- Exact read-only DL-001 export queries.",
        "-- Parameters: $1 minLat/selectedEntityIds, $2 maxLat, $3 minLng, $4 maxLng as applicable.",
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
        "-- Exact production metric result used for parity validation",
        PRODUCTION_METRIC_QUERY.trim(),
        ";",
        "",
        "-- Exact installed production function text and safety properties",
        PRODUCTION_FUNCTION_QUERY.trim(),
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
an application route or remote RPC, execute a trigger-capable statement, fill
an application cache, upload to storage, or write any production record. The
	installed stable \`coverage_v2_metrics\` SQL function is invoked only by a
direct SELECT inside the forced read-only transaction so its recorded result
can be compared with the entity-level recomputation.

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
calibration rectangle, one candidate per restaurant entity, every restaurant
row attached to those entities, the hash-selected 12-entity cohort, current
menu evidence, at most ten photos per entity, duplicate/provenance evidence,
and a blind Guardian packet.

The rectangle is a bounded calibration scope, not a claim that every included
business is legally or operationally inside the City of Temecula. The Guardian
must audit geographic and operating eligibility. The selection intentionally
remains mechanical; convenience stores or other borderline candidates were not
hand-edited out.

The Guardian packet omits bucket and current/historical claim labels. Its
restaurant order is independently shuffled before opaque IDs are assigned.
The shuffle seed and mapping are not present anywhere in the delivered bundle;
only their SHA-256 commitments are supplied. The main SeeFood thread retains
the unblinding record outside the mirror until blind judgments freeze.

Verify all files with \`sha256sum -c SHA256SUMS\`. DataLab must not fetch missing
evidence, use production credentials, or grade the implementation itself.
`,
      "utf8"
    );

    await writeFile(
      path.join(stagingRoot, "guardian/README.md"),
      `# Blind Guardian packet

Audit these opaque restaurant records for current menu evidence, item matching,
Management/Customer provenance, accessibility, rights, exact duplicates,
near-duplicates, multi-item attachment, and legitimate chain/template reuse.
The record order and opaque IDs were assigned only after an independent
withheld-seed shuffle. Do not open files outside this directory until the blind
decisions are locked. The seed and mapping are not in the delivered bundle.
`,
      "utf8"
    );

    const payloadScanResults = await scanStagedFiles(stagingRoot);
    await writeJson(path.join(stagingRoot, "redaction-log.json"), {
      result: "passed",
      scanStatus: "completed_before_publication",
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
        "Guardian shuffle seed and production-to-opaque mapping",
      ],
      retained: [
        "public business names and coordinates",
        "stable corpus IDs outside the Guardian packet",
        "menu item names and source aliases",
        "source, attribution classification, confidence, rights, accessibility, linkage, and duplicate evidence",
      ],
      automatedChecks: {
        knownEnvironmentSecretValueScan: "completed_passed",
        emailPhoneJwtAndForbiddenPersonalKeyScan: "completed_passed",
        imageDecodeAndMetadataScan: "completed_passed",
        boundedPhotoCount: photoEvidence.length <= MAX_PHOTOS_TOTAL,
        noLiveFetchNeededByDataLab: true,
        unblindingMaterialDeliveredToDataLab: false,
      },
      perFileResults: payloadScanResults,
      controlFileProcedure: {
        redactionLog:
          "serialized after payload scans, then included in the final completed scan and SHA256SUMS",
        manifest:
          "created last, includes every other file, excludes itself by definition, then passed the final completed secret/PII scan",
      },
    });
    await scanStagedFiles(stagingRoot);
    await createManifest(stagingRoot);
    await scanStagedFiles(stagingRoot);

    await mkdir(path.dirname(OUTPUT_ROOT), { recursive: true });
    await rename(stagingRoot, OUTPUT_ROOT);
    if (mirror) {
      await mkdir(path.dirname(mirror), { recursive: true });
      await cp(OUTPUT_ROOT, mirror, { recursive: true, errorOnExist: true, force: false });
    }
    await writeJson(UNBLINDING_OUTPUT, guardianUnblindingRecord);
    await chmod(UNBLINDING_OUTPUT, 0o400);
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
          selectedEntityCount: selectedRestaurants.length,
          menuRowCount: menuRows.length,
          photoRowCount: photoEvidence.length,
          productionMetricParity: "passed",
          guardianUnblindingRecord: "withheld_outside_mirror",
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
