#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  fingerprintPhoto,
  isTransientPhotoFetchStatus,
  perceptualHashDistance,
} from "../src/lib/photoFingerprint";

const ROOT = join(import.meta.dirname, "..");
const PRODUCTION_BASE_URL = "https://seefood-rho.vercel.app";
const TEMECULA_BOUNDS = {
  minLat: 33.43,
  maxLat: 33.62,
  minLng: -117.30,
  maxLng: -117.05,
};
const CONCURRENCY = 16;
const MAX_IMAGE_BYTES = 15_000_000;

function loadEnvLocal(): void {
  try {
    const content = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

interface PhotoRow {
  id: number;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string | null;
  origin_url: string | null;
  storage_url: string | null;
  source: string;
  attribution: string | null;
  photo_author_type: string | null;
  source_snapshot_id: string | null;
  menu_item_id: number | null;
  canonical_dish_id: string | null;
  gemini_label: string | null;
  tier: number | null;
  storage_present: boolean;
  created_at: string;
  photo_quality_score: number | null;
  dish_popularity_score: number | null;
  is_hero_candidate: boolean | null;
  is_storefront: boolean | null;
  is_menu_photo: boolean | null;
  active: boolean;
  content_hash: string | null;
  perceptual_hash: string | null;
  duplicate_of_photo_id: number | null;
  dedupe_reason: string | null;
  dedupe_run_id: string | null;
  deduped_at: string | null;
  linked_menu_item_ids: string[];
  linked_dish_keys: string[];
}

interface MeasuredPhoto extends PhotoRow {
  fetchUrl: string | null;
  valid: boolean;
  actionableInvalid: boolean;
  status?: number;
  contentType?: string;
  bytes?: number;
  measuredContentHash?: string;
  measuredPerceptualHash?: string;
  invalidReason?: string;
}

interface AuditMetrics {
  scope: string;
  totalRecords: number;
  validImages: number;
  unreachableImages: number;
  invalidImages: number;
  genuinelyUniquePhotos: number;
  exactDuplicateRows: number;
  exactDuplicateGroups: number;
  affectedRestaurants: number;
  affectedMenuItems: number;
  crossSourceDuplicateGroups: number;
  multiItemDuplicateGroups: number;
  nearDuplicateCandidatePairs: number;
  crossRestaurantTemplateGroups: number;
  matchedUniquePhotos: number;
  matchedUniqueDishes: number;
  comparisonReadyDishes: number;
  totalBytesFetched: number;
  sourceRecords: Record<string, number>;
  topAffectedRestaurants: Array<{
    restaurantId: string;
    name: string;
    records: number;
    unique: number;
    exactDuplicateRows: number;
    invalidRows: number;
  }>;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    apply: args.includes("--apply"),
    scope: value("--scope") ?? "temecula",
    placeId: value("--place"),
    rollbackRunId: value("--rollback"),
  };
}

function connectionString(): string {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
  if (!url) throw new Error("DATABASE_URL is not configured");
  return url;
}

async function loadPhotos(client: pg.Client, scope: string, placeId?: string): Promise<PhotoRow[]> {
  const params: unknown[] = [];
  let predicate = "p.active = true and r.status <> 'test_fixture'";
  if (placeId) {
    params.push(placeId);
    predicate += ` and p.restaurant_id = $${params.length}`;
  } else if (scope === "temecula") {
    params.push(
      TEMECULA_BOUNDS.minLat,
      TEMECULA_BOUNDS.maxLat,
      TEMECULA_BOUNDS.minLng,
      TEMECULA_BOUNDS.maxLng
    );
    predicate += ` and r.lat between $1 and $2 and r.lng between $3 and $4`;
  } else if (scope !== "all") {
    throw new Error(`Unknown scope "${scope}". Use temecula, all, or --place.`);
  }

  const result = await client.query<PhotoRow>(
    `select
       p.*,
       r.name as restaurant_name,
       r.slug as restaurant_slug,
       (p.storage_url is not null) as storage_present,
       coalesce((
         select array_agg(l.menu_item_id::text order by l.menu_item_id)
         from photo_menu_item_links l
         where l.photo_id = p.id
       ), '{}'::text[]) as linked_menu_item_ids,
       coalesce((
         select array_agg(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
         from photo_menu_item_links l
         join menu_items m on m.id = l.menu_item_id
         where l.photo_id = p.id
       ), '{}'::text[]) as linked_dish_keys
     from photos p
     join restaurants r on r.place_id = p.restaurant_id
     where ${predicate}
     order by p.restaurant_id, p.id`,
    params
  );
  return result.rows;
}

async function measurePhotos(rows: PhotoRow[]): Promise<MeasuredPhoto[]> {
  const measured = new Array<MeasuredPhoto>(rows.length);
  let cursor = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= rows.length) return;
      const row = rows[index];
      const rawUrl = row.storage_url ?? row.origin_url;
      const fetchUrl = rawUrl ? new URL(rawUrl, PRODUCTION_BASE_URL).href : null;
      if (!fetchUrl) {
        measured[index] = {
          ...row,
          fetchUrl,
          valid: false,
          actionableInvalid: true,
          invalidReason: "missing_url",
        };
        continue;
      }

      try {
        const response = await fetch(fetchUrl, {
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!response.ok) {
          const transientStatus = isTransientPhotoFetchStatus(response.status);
          measured[index] = {
            ...row,
            fetchUrl,
            valid: false,
            actionableInvalid: response.status >= 400 && response.status < 500 && !transientStatus,
            status: response.status,
            contentType,
            bytes: buffer.length,
            invalidReason: `http_${response.status}`,
          };
        } else if (!contentType.startsWith("image/")) {
          measured[index] = {
            ...row,
            fetchUrl,
            valid: false,
            actionableInvalid: true,
            status: response.status,
            contentType,
            bytes: buffer.length,
            invalidReason: `non_image_${contentType || "unknown"}`,
          };
        } else if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
          measured[index] = {
            ...row,
            fetchUrl,
            valid: false,
            actionableInvalid: true,
            status: response.status,
            contentType,
            bytes: buffer.length,
            invalidReason: buffer.length === 0 ? "empty_image" : "image_too_large",
          };
        } else {
          try {
            const fingerprint = await fingerprintPhoto(buffer);
            measured[index] = {
              ...row,
              fetchUrl,
              valid: true,
              actionableInvalid: false,
              status: response.status,
              contentType,
              bytes: buffer.length,
              measuredContentHash: fingerprint.contentHash,
              measuredPerceptualHash: fingerprint.perceptualHash,
            };
          } catch {
            measured[index] = {
              ...row,
              fetchUrl,
              valid: false,
              actionableInvalid: true,
              status: response.status,
              contentType,
              bytes: buffer.length,
              invalidReason: "image_decode_failed",
            };
          }
        }
      } catch (error) {
        measured[index] = {
          ...row,
          fetchUrl,
          valid: false,
          actionableInvalid: false,
          invalidReason: error instanceof Error ? error.name : "fetch_failed",
        };
      }

      completed += 1;
      if (completed % 250 === 0 || completed === rows.length) {
        console.log(`[photo-dedupe] measured ${completed}/${rows.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));
  return measured;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), value]);
  }
  return groups;
}

function analyze(scope: string, photos: MeasuredPhoto[]): AuditMetrics {
  const valid = photos.filter((photo) => photo.valid && photo.measuredContentHash);
  const exactByRestaurant = groupBy(
    valid,
    (photo) => `${photo.restaurant_id}:${photo.measuredContentHash}`
  );
  const duplicateGroups = [...exactByRestaurant.values()].filter((group) => group.length > 1);
  const affectedRestaurants = new Set(duplicateGroups.flatMap((group) => group.map((photo) => photo.restaurant_id)));
  const affectedMenuItems = new Set(
    duplicateGroups.flatMap((group) => group.flatMap((photo) => [
      ...photo.linked_menu_item_ids,
      ...(photo.menu_item_id ? [String(photo.menu_item_id)] : []),
    ]))
  );

  let nearDuplicateCandidatePairs = 0;
  const byRestaurant = groupBy(valid, (photo) => photo.restaurant_id);
  for (const restaurantPhotos of byRestaurant.values()) {
    for (let left = 0; left < restaurantPhotos.length; left += 1) {
      for (let right = left + 1; right < restaurantPhotos.length; right += 1) {
        const a = restaurantPhotos[left];
        const b = restaurantPhotos[right];
        if (
          a.measuredContentHash !== b.measuredContentHash
          && a.measuredPerceptualHash
          && b.measuredPerceptualHash
          && perceptualHashDistance(a.measuredPerceptualHash, b.measuredPerceptualHash) <= 2
        ) {
          nearDuplicateCandidatePairs += 1;
        }
      }
    }
  }

  const globalExact = groupBy(valid, (photo) => photo.measuredContentHash!);
  const crossRestaurantTemplateGroups = [...globalExact.values()].filter(
    (group) => new Set(group.map((photo) => photo.restaurant_id)).size > 1
  ).length;

  const matchedUniquePhotos = [...exactByRestaurant.values()].filter((group) =>
    group.some((photo) => photoDishKeys(photo).length > 0)
  ).length;
  const matchedDishKeys = new Set(
    duplicateAwareDishLinks(exactByRestaurant).map(({ restaurantId, dishKey }) => `${restaurantId}:${dishKey}`)
  );

  const comparison = new Map<string, Map<string, Set<string>>>();
  for (const photo of valid) {
    for (const dishKey of photoDishKeys(photo)) {
      const key = `${photo.restaurant_id}:${dishKey}`;
      const author = photo.photo_author_type ?? "unknown";
      const authorHashes = comparison.get(key) ?? new Map<string, Set<string>>();
      const hashes = authorHashes.get(author) ?? new Set<string>();
      hashes.add(photo.measuredContentHash!);
      authorHashes.set(author, hashes);
      comparison.set(key, authorHashes);
    }
  }
  const comparisonReadyDishes = [...comparison.values()].filter((authors) => {
    const management = authors.get("management") ?? new Set<string>();
    const customers = authors.get("customer") ?? new Set<string>();
    return [...management].some((hash) => !customers.has(hash)) && customers.size > 0;
  }).length;

  const perRestaurant = [...groupBy(photos, (photo) => photo.restaurant_id)].map(([restaurantId, records]) => {
    const validRecords = records.filter((photo) => photo.valid && photo.measuredContentHash);
    const unique = groupBy(validRecords, (photo) => photo.measuredContentHash!).size;
    return {
      restaurantId,
      name: records[0]?.restaurant_name ?? restaurantId,
      records: records.length,
      unique,
      exactDuplicateRows: validRecords.length - unique,
      invalidRows: records.filter((photo) => !photo.valid && photo.actionableInvalid).length,
    };
  }).sort((a, b) =>
    (b.exactDuplicateRows + b.invalidRows) - (a.exactDuplicateRows + a.invalidRows)
  );

  return {
    scope,
    totalRecords: photos.length,
    validImages: valid.length,
    unreachableImages: photos.filter((photo) => !photo.valid && !photo.actionableInvalid).length,
    invalidImages: photos.filter((photo) => !photo.valid && photo.actionableInvalid).length,
    genuinelyUniquePhotos: exactByRestaurant.size,
    exactDuplicateRows: valid.length - exactByRestaurant.size,
    exactDuplicateGroups: duplicateGroups.length,
    affectedRestaurants: affectedRestaurants.size,
    affectedMenuItems: affectedMenuItems.size,
    crossSourceDuplicateGroups: duplicateGroups.filter(
      (group) => new Set(group.map((photo) => photo.source)).size > 1
    ).length,
    multiItemDuplicateGroups: duplicateGroups.filter(
      (group) => new Set(group.flatMap((photo) => [
        ...photo.linked_menu_item_ids,
        ...(photo.menu_item_id ? [String(photo.menu_item_id)] : []),
      ])).size > 1
    ).length,
    nearDuplicateCandidatePairs,
    crossRestaurantTemplateGroups,
    matchedUniquePhotos,
    matchedUniqueDishes: matchedDishKeys.size,
    comparisonReadyDishes,
    totalBytesFetched: photos.reduce((sum, photo) => sum + (photo.bytes ?? 0), 0),
    sourceRecords: Object.fromEntries(
      [...groupBy(photos, (photo) => photo.source)].map(
        ([source, records]): [string, number] => [source, records.length]
      )
        .sort((left, right) => right[1] - left[1])
    ),
    topAffectedRestaurants: perRestaurant.slice(0, 25),
  };
}

function photoDishKeys(photo: PhotoRow): string[] {
  return [...new Set([
    ...photo.linked_dish_keys,
    ...(photo.canonical_dish_id ? [photo.canonical_dish_id] : []),
    ...(photo.menu_item_id ? [`menu-${photo.menu_item_id}`] : []),
  ])];
}

function duplicateAwareDishLinks(groups: Map<string, MeasuredPhoto[]>): Array<{ restaurantId: string; dishKey: string }> {
  const result: Array<{ restaurantId: string; dishKey: string }> = [];
  for (const group of groups.values()) {
    for (const photo of group) {
      for (const dishKey of photoDishKeys(photo)) {
        result.push({ restaurantId: photo.restaurant_id, dishKey });
      }
    }
  }
  return result;
}

function sourcePriority(source: string): number {
  if (source === "user_upload") return 100;
  if (source === "user_suggested") return 95;
  if (source === "merchant") return 90;
  if (source === "google") return 50;
  return 70;
}

function chooseCanonical(group: MeasuredPhoto[]): MeasuredPhoto {
  return [...group].sort((left, right) => {
    const score = (photo: MeasuredPhoto) =>
      sourcePriority(photo.source) * 100
      + (photo.storage_present ? 50_000 : 0);
    return score(right) - score(left)
      || Date.parse(right.created_at) - Date.parse(left.created_at)
      || right.id - left.id;
  })[0];
}

function previousState(photo: PhotoRow): Record<string, unknown> {
  return {
    active: photo.active,
    content_hash: photo.content_hash,
    perceptual_hash: photo.perceptual_hash,
    duplicate_of_photo_id: photo.duplicate_of_photo_id,
    dedupe_reason: photo.dedupe_reason,
    dedupe_run_id: photo.dedupe_run_id,
    deduped_at: photo.deduped_at,
    gemini_label: photo.gemini_label,
    menu_item_id: photo.menu_item_id,
    canonical_dish_id: photo.canonical_dish_id,
    tier: photo.tier,
    origin_url: photo.origin_url,
    storage_url: photo.storage_url,
    source: photo.source,
    attribution: photo.attribution,
    photo_author_type: photo.photo_author_type,
    photo_quality_score: photo.photo_quality_score,
    dish_popularity_score: photo.dish_popularity_score,
    is_hero_candidate: photo.is_hero_candidate,
    is_storefront: photo.is_storefront,
    is_menu_photo: photo.is_menu_photo,
  };
}

async function applyCleanup(
  client: pg.Client,
  scope: string,
  photos: MeasuredPhoto[],
  before: AuditMetrics
): Promise<string> {
  const valid = photos.filter((photo) => photo.valid && photo.measuredContentHash);
  const exactGroups = groupBy(valid, (photo) => `${photo.restaurant_id}:${photo.measuredContentHash}`);
  const canonicalUpdates: Array<Record<string, unknown>> = [];
  const duplicateUpdates: Array<Record<string, unknown>> = [];
  const invalidUpdates: Array<Record<string, unknown>> = [];
  const actionRows: Array<Record<string, unknown>> = [];
  const originRows: Array<Record<string, unknown>> = [];
  const linkRows: Array<Record<string, unknown>> = [];

  for (const group of exactGroups.values()) {
    const canonical = chooseCanonical(group);
    const bestLabel = [...group].sort((a, b) =>
      Number(!!b.menu_item_id) - Number(!!a.menu_item_id)
      || Number(!!b.gemini_label) - Number(!!a.gemini_label)
      || (a.tier ?? 3) - (b.tier ?? 3)
    )[0];
    canonicalUpdates.push({
      id: canonical.id,
      content_hash: canonical.measuredContentHash,
      perceptual_hash: canonical.measuredPerceptualHash,
      gemini_label: bestLabel.gemini_label,
      menu_item_id: bestLabel.menu_item_id,
      canonical_dish_id:
        bestLabel.canonical_dish_id
        ?? group.find((photo) => photo.canonical_dish_id)?.canonical_dish_id
        ?? null,
      tier: bestLabel.tier ?? 3,
      photo_quality_score: Math.max(...group.map((photo) => photo.photo_quality_score ?? 0)),
    });

    if (group.length > 1) {
      for (const photo of group) {
        actionRows.push({
          photo_id: photo.id,
          canonical_photo_id: canonical.id,
          action: photo.id === canonical.id ? "canonicalize" : "deactivate",
          reason: photo.id === canonical.id ? "exact_content_identity" : "exact_content_duplicate",
          previous_state: previousState(photo),
        });
        if (photo.id !== canonical.id) {
          duplicateUpdates.push({
            id: photo.id,
            canonical_photo_id: canonical.id,
            perceptual_hash: canonical.measuredPerceptualHash,
          });
        }
      }
    }

    for (const photo of group) {
      if (photo.origin_url) {
        originRows.push({
          photo_id: canonical.id,
          restaurant_id: photo.restaurant_id,
          source: photo.source,
          origin_url: photo.origin_url,
          storage_url: photo.storage_url,
          attribution: photo.attribution,
          photo_author_type: photo.photo_author_type,
          source_snapshot_id: photo.source_snapshot_id,
          content_hash: photo.measuredContentHash,
          observed_at: photo.created_at,
        });
      }
      if (photo.menu_item_id) {
        linkRows.push({
          photo_id: canonical.id,
          menu_item_id: photo.menu_item_id,
          source: photo.source,
        });
      }
    }
  }

  for (const photo of photos.filter((candidate) => !candidate.valid && candidate.actionableInvalid)) {
    actionRows.push({
      photo_id: photo.id,
      canonical_photo_id: null,
      action: "deactivate",
      reason: photo.invalidReason ?? "invalid_image",
      previous_state: previousState(photo),
    });
    invalidUpdates.push({
      id: photo.id,
      reason: photo.invalidReason ?? "invalid_image",
    });
  }

  const chunks = <T>(values: T[], size = 500): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
      result.push(values.slice(index, index + size));
    }
    return result;
  };

  await client.query("begin");
  try {
    const run = await client.query<{ id: string }>(
      `insert into photo_dedupe_runs (scope, mode, status, before_metrics)
       values ($1, 'apply', 'running', $2::jsonb)
       returning id`,
      [scope, JSON.stringify(before)]
    );
    const runId = run.rows[0].id;
    const now = new Date().toISOString();
    for (const batch of chunks(actionRows)) {
      await client.query(
        `insert into photo_dedupe_actions
           (run_id, photo_id, canonical_photo_id, action, reason, previous_state)
         select $1, x.photo_id, x.canonical_photo_id, x.action, x.reason, x.previous_state
         from jsonb_to_recordset($2::jsonb) as x(
           photo_id bigint,
           canonical_photo_id bigint,
           action text,
           reason text,
           previous_state jsonb
         )
         on conflict (run_id, photo_id) do nothing`,
        [runId, JSON.stringify(batch)]
      );
    }
    for (const batch of chunks(originRows)) {
      await client.query(
        `insert into photo_origins (
           photo_id, restaurant_id, source, origin_url, storage_url, attribution,
           photo_author_type, source_snapshot_id, content_hash, first_seen_at, last_seen_at
         )
         select
           x.photo_id, x.restaurant_id, x.source, x.origin_url, x.storage_url, x.attribution,
           x.photo_author_type, x.source_snapshot_id, x.content_hash, x.observed_at, x.observed_at
         from jsonb_to_recordset($1::jsonb) as x(
           photo_id bigint,
           restaurant_id text,
           source text,
           origin_url text,
           storage_url text,
           attribution text,
           photo_author_type text,
           source_snapshot_id uuid,
           content_hash text,
           observed_at timestamptz
         )
         on conflict (restaurant_id, source, origin_url) do update set
           photo_id = excluded.photo_id,
           storage_url = coalesce(excluded.storage_url, photo_origins.storage_url),
           content_hash = excluded.content_hash,
           last_seen_at = greatest(photo_origins.last_seen_at, excluded.last_seen_at)`,
        [JSON.stringify(batch)]
      );
    }
    for (const batch of chunks(linkRows)) {
      await client.query(
        `insert into photo_menu_item_links (photo_id, menu_item_id, source)
         select x.photo_id, x.menu_item_id, x.source
         from jsonb_to_recordset($1::jsonb) as x(photo_id bigint, menu_item_id bigint, source text)
         on conflict (photo_id, menu_item_id) do nothing`,
        [JSON.stringify(batch)]
      );
    }
    for (const batch of chunks(canonicalUpdates)) {
      await client.query(
        `update photos p set
           active = true,
           content_hash = x.content_hash,
           perceptual_hash = x.perceptual_hash,
           duplicate_of_photo_id = null,
           dedupe_reason = null,
           dedupe_run_id = null,
           deduped_at = null,
           gemini_label = coalesce(p.gemini_label, x.gemini_label),
           menu_item_id = coalesce(p.menu_item_id, x.menu_item_id),
           canonical_dish_id = coalesce(p.canonical_dish_id, x.canonical_dish_id),
           tier = least(coalesce(p.tier, 3), x.tier),
           photo_quality_score = greatest(coalesce(p.photo_quality_score, 0), x.photo_quality_score)
         from jsonb_to_recordset($1::jsonb) as x(
           id bigint,
           content_hash text,
           perceptual_hash text,
           gemini_label text,
           menu_item_id bigint,
           canonical_dish_id uuid,
           tier int,
           photo_quality_score numeric
         )
         where p.id = x.id`,
        [JSON.stringify(batch)]
      );
    }
    for (const batch of chunks(duplicateUpdates)) {
      await client.query(
        `update photos p set
           active = false,
           content_hash = null,
           perceptual_hash = x.perceptual_hash,
           duplicate_of_photo_id = x.canonical_photo_id,
           dedupe_reason = 'exact_content_duplicate',
           dedupe_run_id = $2,
           deduped_at = $3
         from jsonb_to_recordset($1::jsonb) as x(
           id bigint,
           canonical_photo_id bigint,
           perceptual_hash text
         )
         where p.id = x.id`,
        [JSON.stringify(batch), runId, now]
      );
    }
    for (const batch of chunks(invalidUpdates)) {
      await client.query(
        `update photos p set
           active = false,
           content_hash = null,
           duplicate_of_photo_id = null,
           dedupe_reason = x.reason,
           dedupe_run_id = $2,
           deduped_at = $3
         from jsonb_to_recordset($1::jsonb) as x(id bigint, reason text)
         where p.id = x.id`,
        [JSON.stringify(batch), runId, now]
      );
    }

    const after: AuditMetrics = {
      ...before,
      totalRecords: before.totalRecords - before.exactDuplicateRows - before.invalidImages,
      validImages: before.genuinelyUniquePhotos,
      invalidImages: 0,
      genuinelyUniquePhotos: before.genuinelyUniquePhotos,
      exactDuplicateRows: 0,
      exactDuplicateGroups: 0,
      affectedRestaurants: 0,
      affectedMenuItems: 0,
    };
    await client.query(
      `update photo_dedupe_runs set
         status = 'completed',
         completed_at = now(),
         after_metrics = $2::jsonb,
         notes = $3::jsonb
       where id = $1`,
      [
        runId,
        JSON.stringify(after),
        JSON.stringify({
          legitimateUniquePhotosRemoved: 0,
          nearDuplicatesLeftForReview: before.nearDuplicateCandidatePairs,
          crossRestaurantTemplateGroupsPreserved: before.crossRestaurantTemplateGroups,
        }),
      ]
    );
    await client.query("commit");
    return runId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function rollbackCleanup(client: pg.Client, originalRunId: string): Promise<string> {
  await client.query("begin");
  try {
    // Returning to the pre-cleanup state intentionally restores duplicate
    // active hashes, so the active-row guardrail must leave with it. A later
    // cleanup re-applies the constraint migration after the data is clean.
    await client.query("drop index if exists uq_photos_restaurant_content_hash");
    const actions = await client.query<{
      photo_id: number;
      previous_state: Record<string, unknown>;
    }>(
      `select photo_id, previous_state
       from photo_dedupe_actions
       where run_id = $1
       order by id`,
      [originalRunId]
    );
    if (!actions.rowCount) throw new Error(`No cleanup actions found for run ${originalRunId}`);

    const rollbackRun = await client.query<{ id: string }>(
      `insert into photo_dedupe_runs (scope, mode, status, notes)
       select scope, 'rollback', 'running', jsonb_build_object('originalRunId', id)
       from photo_dedupe_runs where id = $1
       returning id`,
      [originalRunId]
    );
    if (!rollbackRun.rowCount) throw new Error(`Cleanup run ${originalRunId} was not found`);
    const rollbackRunId = rollbackRun.rows[0].id;
    const ids = actions.rows.map((action) => action.photo_id);
    await client.query(`update photos set content_hash = null where id = any($1::bigint[])`, [ids]);

    for (const action of actions.rows) {
      const state = action.previous_state;
      await client.query(
        `update photos set
           active = $2,
           content_hash = $3,
           perceptual_hash = $4,
           duplicate_of_photo_id = $5,
           dedupe_reason = $6,
           dedupe_run_id = $7,
           deduped_at = $8,
           gemini_label = $9,
           menu_item_id = $10,
           canonical_dish_id = $11,
           tier = $12,
           origin_url = $13,
           storage_url = $14,
           source = $15,
           attribution = $16,
           photo_author_type = $17,
           photo_quality_score = $18,
           dish_popularity_score = $19,
           is_hero_candidate = $20,
           is_storefront = $21,
           is_menu_photo = $22
         where id = $1`,
        [
          action.photo_id,
          state.active,
          state.content_hash,
          state.perceptual_hash,
          state.duplicate_of_photo_id,
          state.dedupe_reason,
          state.dedupe_run_id,
          state.deduped_at,
          state.gemini_label,
          state.menu_item_id,
          state.canonical_dish_id,
          state.tier,
          state.origin_url,
          state.storage_url,
          state.source,
          state.attribution,
          state.photo_author_type,
          state.photo_quality_score,
          state.dish_popularity_score,
          state.is_hero_candidate,
          state.is_storefront,
          state.is_menu_photo,
        ]
      );
      if (state.origin_url) {
        await client.query(
          `update photo_origins set photo_id = $1
           where restaurant_id = (select restaurant_id from photos where id = $1)
             and source = $2 and origin_url = $3`,
          [action.photo_id, state.source, state.origin_url]
        );
      }
    }

    await client.query(
      `update photo_dedupe_runs set status = 'rolled_back' where id = $1;
       update photo_dedupe_runs set status = 'completed', completed_at = now() where id = $2`,
      [originalRunId, rollbackRunId]
    );
    await client.query("commit");
    return rollbackRunId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs();
  const client = new pg.Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    if (args.rollbackRunId) {
      const rollbackRunId = await rollbackCleanup(client, args.rollbackRunId);
      console.log(JSON.stringify({ rolledBack: args.rollbackRunId, rollbackRunId }, null, 2));
      return;
    }

    const scope = args.placeId ? `place:${args.placeId}` : args.scope;
    const rows = await loadPhotos(client, args.scope, args.placeId);
    console.log(`[photo-dedupe] auditing ${rows.length} active rows in ${scope}`);
    const measured = await measurePhotos(rows);
    const metrics = analyze(scope, measured);
    console.log(JSON.stringify(metrics, null, 2));

    if (!args.apply) {
      console.log("[photo-dedupe] dry run only; pass --apply after creating a rollback point");
      return;
    }
    const runId = await applyCleanup(client, scope, measured, metrics);
    console.log(JSON.stringify({ applied: true, runId, metrics }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[photo-dedupe] failed:", error);
  process.exitCode = 1;
});
