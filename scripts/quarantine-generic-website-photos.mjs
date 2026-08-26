#!/usr/bin/env node

/**
 * Reversibly quarantine legacy generic Schema.org website images once a
 * restaurant already has enough positively identified dish photography.
 *
 * This is deliberately adaptive: it removes unsupported tails from
 * well-covered restaurants without using the same broad rule on photo-poor
 * restaurants, where a later content review may still rescue useful food.
 */
import { Client } from "pg";
import path from "node:path";
import process from "node:process";

const REASON = "unsupported_generic_website_image";

function parseArgs(argv) {
  const result = { mode: "audit", runId: null, restaurantId: null, minVerified: 7 };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--mode") result.mode = argv[++index];
    else if (token === "--run") result.runId = argv[++index];
    else if (token === "--restaurant-id") result.restaurantId = argv[++index];
    else if (token === "--min-verified") result.minVerified = Number(argv[++index]);
    else throw new Error(`Unknown argument ${token}`);
  }
  if (!["audit", "apply", "rollback"].includes(result.mode)) {
    throw new Error("--mode must be audit, apply, or rollback");
  }
  if (result.mode === "rollback" && !result.runId) {
    throw new Error("--run is required for rollback");
  }
  if (!Number.isInteger(result.minVerified) || result.minVerified < 1 || result.minVerified > 100) {
    throw new Error("--min-verified must be an integer from 1 to 100");
  }
  return result;
}

function connectionString() {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.SUPABASE_DB_PASSWORD) url.password = process.env.SUPABASE_DB_PASSWORD;
  return url.toString();
}

async function selectTargets(client, options) {
  const result = await client.query(
    `with positive_photos as (
       select p.restaurant_id, count(distinct p.id)::int as verified_count
       from photos p
       where p.active
         and coalesce(p.is_orderable, false)
         and p.dedupe_reason is null
         and not coalesce(p.is_storefront, false)
         and not coalesce(p.is_menu_photo, false)
         and (
           p.menu_item_id is not null
           or p.canonical_dish_id is not null
           or nullif(trim(p.gemini_label), '') is not null
           or exists (
             select 1
             from photo_menu_item_links link
             join menu_items item on item.id = link.menu_item_id and item.active
             where link.photo_id = p.id
           )
         )
       group by p.restaurant_id
       having count(distinct p.id) >= $1
     )
     select p.id::text, p.restaurant_id, r.name restaurant_name,
            p.content_hash, p.origin_url
     from photos p
     join positive_photos strong on strong.restaurant_id = p.restaurant_id
     join restaurants r on r.place_id = p.restaurant_id
     where p.active
       and coalesce(p.is_orderable, false)
       and p.dedupe_reason is null
       and p.source = 'schema_org'
       and coalesce(p.tier, 3) = 3
       and p.menu_item_id is null
       and p.canonical_dish_id is null
       and nullif(trim(p.gemini_label), '') is null
       and not coalesce(p.is_hero_candidate, false)
       and not exists (
         select 1
         from photo_menu_item_links link
         join menu_items item on item.id = link.menu_item_id and item.active
         where link.photo_id = p.id
       )
       and r.status <> 'test_fixture'
       and ($2::text is null or p.restaurant_id = $2)
     order by r.name, p.id`,
    [options.minVerified, options.restaurantId]
  );
  return result.rows;
}

async function metrics(client, photoIds, restaurantIds) {
  const ids = photoIds.length ? photoIds : ["-1"];
  const restaurants = restaurantIds.length ? restaurantIds : ["__none__"];
  const result = await client.query(
    `select jsonb_build_object(
       'targetPhotoRows', count(*) filter (where p.id = any($1::bigint[])),
       'targetActivePhotoRows', count(*) filter (where p.id = any($1::bigint[]) and p.active),
       'targetOrderablePhotoRows', count(*) filter (where p.id = any($1::bigint[]) and coalesce(p.is_orderable, false)),
       'targetExactUniqueBytes', count(distinct p.content_hash) filter (where p.id = any($1::bigint[]) and p.content_hash is not null),
       'targetLinkedMenuItems', (
         select count(distinct link.menu_item_id)
         from photo_menu_item_links link
         where link.photo_id = any($1::bigint[])
       ),
       'affectedRestaurants', $3::int,
       'displayablePhotosAtAffectedRestaurants', count(*) filter (
         where p.restaurant_id = any($2::text[]) and p.active
           and coalesce(p.is_orderable, false) and p.dedupe_reason is null
           and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
       ),
       'positivelyIdentifiedPhotosAtAffectedRestaurants', count(*) filter (
         where p.restaurant_id = any($2::text[]) and p.active
           and coalesce(p.is_orderable, false) and p.dedupe_reason is null
           and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
           and (p.menu_item_id is not null or p.canonical_dish_id is not null or nullif(trim(p.gemini_label), '') is not null
             or exists (
               select 1 from photo_menu_item_links link
               join menu_items item on item.id = link.menu_item_id and item.active
               where link.photo_id = p.id
             ))
       ),
       'restaurantsWithAnyDisplayablePhoto', count(distinct p.restaurant_id) filter (
         where p.restaurant_id = any($2::text[]) and p.active
           and coalesce(p.is_orderable, false) and p.dedupe_reason is null
           and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
       ),
       'globalDisplayablePhotoRows', count(*) filter (
         where p.active and coalesce(p.is_orderable, false) and p.dedupe_reason is null
           and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
       ),
       'globalDisplayableExactUniqueBytes', count(distinct p.content_hash) filter (
         where p.active and coalesce(p.is_orderable, false) and p.dedupe_reason is null
           and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
           and p.content_hash is not null
       )
     ) metrics
     from photos p`,
    [ids, restaurants, restaurantIds.length]
  );
  return result.rows[0].metrics;
}

function summarizeTargets(rows) {
  const restaurantCounts = new Map();
  for (const row of rows) {
    const key = `${row.restaurant_id}|${row.restaurant_name}`;
    restaurantCounts.set(key, (restaurantCounts.get(key) ?? 0) + 1);
  }
  return [...restaurantCounts.entries()]
    .map(([key, photos]) => {
      const [restaurantId, restaurant] = key.split("|");
      return { restaurantId, restaurant, photos };
    })
    .sort((left, right) => right.photos - left.photos || left.restaurant.localeCompare(right.restaurant));
}

async function audit(client, options) {
  await client.query("begin transaction isolation level repeatable read read only");
  try {
    const proof = (await client.query(
      "select current_setting('transaction_read_only') read_only, current_setting('transaction_isolation') isolation"
    )).rows[0];
    const targets = await selectTargets(client, options);
    const restaurantIds = [...new Set(targets.map((row) => row.restaurant_id))];
    const result = {
      status: "audited",
      transaction: proof,
      rule: { reason: REASON, minVerified: options.minVerified, restaurantId: options.restaurantId },
      metrics: await metrics(client, targets.map((row) => row.id), restaurantIds),
      restaurants: summarizeTargets(targets),
    };
    await client.query("rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function apply(client, options) {
  await client.query("begin");
  try {
    const scope = options.restaurantId
      ? `restaurant:${options.restaurantId}:generic-website-photo-quarantine`
      : `global:generic-website-photo-quarantine:min-${options.minVerified}`;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [scope]);
    const targets = await selectTargets(client, options);
    if (!targets.length) {
      await client.query("rollback");
      return { status: "no_op", scope };
    }
    const photoIds = targets.map((row) => row.id);
    const restaurantIds = [...new Set(targets.map((row) => row.restaurant_id))];
    const before = await metrics(client, photoIds, restaurantIds);
    const run = await client.query(
      `insert into photo_dedupe_runs(scope, mode, status, before_metrics, notes)
       values($1, 'apply', 'running', $2::jsonb, $3::jsonb) returning id::text`,
      [scope, JSON.stringify(before), JSON.stringify({
        reason: REASON,
        minVerified: options.minVerified,
        restaurantId: options.restaurantId,
        rule: "legacy active Schema.org tier-3 image with no dish/menu evidence, only where the restaurant already has the configured minimum positively identified photos",
        rollback: "npm run photo-quarantine:generic-web -- --mode rollback --run <run-id>",
      })]
    );
    const runId = run.rows[0].id;
    await client.query(
      `insert into photo_dedupe_actions(run_id, photo_id, canonical_photo_id, action, reason, previous_state)
       select $2::uuid, p.id, p.duplicate_of_photo_id, 'quarantine_content', $3,
         jsonb_build_object(
           'active', p.active,
           'is_orderable', p.is_orderable,
           'is_hero_candidate', p.is_hero_candidate,
           'dedupe_reason', p.dedupe_reason,
           'dedupe_run_id', p.dedupe_run_id,
           'deduped_at', p.deduped_at
         )
       from photos p where p.id = any($1::bigint[])
       on conflict(run_id, photo_id) do nothing`,
      [photoIds, runId, REASON]
    );
    const updated = await client.query(
      `update photos p set
         active = false,
         is_orderable = false,
         is_hero_candidate = false,
         dedupe_reason = $2,
         dedupe_run_id = $1,
         deduped_at = now()
       from photo_dedupe_actions action
       where action.run_id = $1 and action.photo_id = p.id and p.active
       returning p.id`,
      [runId, REASON]
    );
    const after = await metrics(client, photoIds, restaurantIds);
    await client.query(
      `update photo_dedupe_runs set status='completed', completed_at=now(), after_metrics=$2::jsonb,
         notes = notes || $3::jsonb where id=$1`,
      [runId, JSON.stringify(after), JSON.stringify({
        rowsQuarantined: updated.rowCount,
        positivelyIdentifiedPhotosLost: Number(before.positivelyIdentifiedPhotosAtAffectedRestaurants) - Number(after.positivelyIdentifiedPhotosAtAffectedRestaurants),
        restaurantsEmptied: Number(before.restaurantsWithAnyDisplayablePhoto) - Number(after.restaurantsWithAnyDisplayablePhoto),
      })]
    );
    await client.query("commit");
    return { status: "applied", scope, runId, rowsQuarantined: updated.rowCount, before, after, restaurants: summarizeTargets(targets) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function rollback(client, runId) {
  await client.query("begin");
  try {
    const original = await client.query(
      "select id::text, scope, status from photo_dedupe_runs where id=$1 and mode='apply'",
      [runId]
    );
    if (!original.rowCount) throw new Error(`Unknown apply run ${runId}`);
    const scope = original.rows[0].scope;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [scope]);
    const actions = await client.query(
      "select photo_id::text from photo_dedupe_actions where run_id=$1 order by photo_id",
      [runId]
    );
    const photoIds = actions.rows.map((row) => row.photo_id);
    const restaurantRows = await client.query(
      "select distinct restaurant_id from photos where id=any($1::bigint[])",
      [photoIds.length ? photoIds : ["-1"]]
    );
    const restaurantIds = restaurantRows.rows.map((row) => row.restaurant_id);
    const before = await metrics(client, photoIds, restaurantIds);
    const rollbackRun = await client.query(
      `insert into photo_dedupe_runs(scope, mode, status, before_metrics, notes)
       values($1, 'rollback', 'running', $2::jsonb, $3::jsonb) returning id::text`,
      [scope, JSON.stringify(before), JSON.stringify({ originalRunId: runId })]
    );
    const rollbackRunId = rollbackRun.rows[0].id;
    const restored = await client.query(
      `update photos p set
         active = coalesce((action.previous_state->>'active')::boolean, false),
         is_orderable = coalesce((action.previous_state->>'is_orderable')::boolean, false),
         is_hero_candidate = coalesce((action.previous_state->>'is_hero_candidate')::boolean, false),
         dedupe_reason = action.previous_state->>'dedupe_reason',
         dedupe_run_id = (action.previous_state->>'dedupe_run_id')::uuid,
         deduped_at = (action.previous_state->>'deduped_at')::timestamptz
       from photo_dedupe_actions action
       where action.run_id=$1 and action.photo_id=p.id and p.dedupe_run_id=$1
       returning p.id`,
      [runId]
    );
    const after = await metrics(client, photoIds, restaurantIds);
    await client.query(
      `update photo_dedupe_runs set status='completed', completed_at=now(), after_metrics=$2::jsonb,
         notes=notes||$3::jsonb where id=$1`,
      [rollbackRunId, JSON.stringify(after), JSON.stringify({ rowsRestored: restored.rowCount })]
    );
    await client.query("commit");
    return { status: "rolled_back", originalRunId: runId, rollbackRunId, rowsRestored: restored.rowCount, before, after };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv);
  const client = new Client({
    connectionString: connectionString(),
    statement_timeout: 60_000,
    application_name: "seefood_generic_website_photo_quarantine",
  });
  await client.connect();
  try {
    const result = options.mode === "audit"
      ? await audit(client, options)
      : options.mode === "apply"
        ? await apply(client, options)
        : await rollback(client, options.runId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
