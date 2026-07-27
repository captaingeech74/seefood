#!/usr/bin/env node

/**
 * Re-quarantines rows that already carry a durable dedupe rejection reason but
 * were made active by a later fail-open crawl. Apply is scoped, logged,
 * idempotent, and reversible by run ID.
 */
import { Client } from "pg";
import process from "node:process";
import path from "node:path";

const BOUNDS = [33.43, 33.62, -117.3, -117.05];
const DEFAULT_CUTOFF = "2026-07-24T00:10:16Z";
const SCOPES = {
  rejected: "temecula:reactivated-photo-quarantine",
  unverified: "temecula:post-identity-unverified-quarantine",
};

function args(argv) {
  const parsed = { mode: "audit", runId: null, kind: "rejected", cutoff: DEFAULT_CUTOFF };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--mode") parsed.mode = argv[++index];
    else if (argv[index] === "--run") parsed.runId = argv[++index];
    else if (argv[index] === "--kind") parsed.kind = argv[++index];
    else if (argv[index] === "--created-after") parsed.cutoff = argv[++index];
    else throw new Error(`Unknown argument ${argv[index]}`);
  }
  if (!["audit", "apply", "rollback"].includes(parsed.mode)) {
    throw new Error("--mode must be audit, apply, or rollback");
  }
  if (!Object.hasOwn(SCOPES, parsed.kind)) {
    throw new Error("--kind must be rejected or unverified");
  }
  if (parsed.mode === "rollback" && !parsed.runId) {
    throw new Error("--run is required for rollback");
  }
  return parsed;
}

function connectionString() {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.SUPABASE_DB_PASSWORD) url.password = process.env.SUPABASE_DB_PASSWORD;
  return url.toString();
}

const METRICS_SQL = `
with scoped_restaurants as (
  select r.place_id, r.entity_id
  from restaurants r
  join restaurant_entities e on e.id = r.entity_id
  where r.status <> 'test_fixture'
    and e.status <> 'test_fixture'
    and r.lat between $1 and $2
    and r.lng between $3 and $4
),
physical as (
  select
    sr.restaurant_id,
    sr.entity_id,
    p.id,
    p.photo_author_type,
    coalesce(
      p.canonical_dish_id::text,
      case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end
    ) as primary_dish_key
  from (
    select place_id as restaurant_id, entity_id from scoped_restaurants
  ) sr
  join photos p on p.restaurant_id = sr.restaurant_id
  where p.active
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
),
associations as (
  select restaurant_id, entity_id, id, photo_author_type, primary_dish_key as dish_key
  from physical
  union
  select
    p.restaurant_id,
    p.entity_id,
    p.id,
    p.photo_author_type,
    coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text)
  from physical p
  join photo_menu_item_links l on l.photo_id = p.id
  join menu_items m on m.id = l.menu_item_id and m.active
),
photo_rollup as (
  select
    restaurant_id,
    count(distinct id)::int as raw_photo_count,
    count(distinct id) filter (where dish_key is not null)::int as matched_photo_count,
    count(distinct dish_key) filter (where dish_key is not null)::int as matched_dish_count
  from associations
  group by restaurant_id
),
comparison_rollup as (
  select restaurant_id, count(*)::int as comparison_dish_count
  from (
    select restaurant_id, dish_key
    from associations
    where dish_key is not null
    group by restaurant_id, dish_key
    having bool_or(photo_author_type = 'management')
       and bool_or(photo_author_type = 'customer')
  ) comparisons
  group by restaurant_id
),
menu_rollup as (
  select
    sr.place_id as restaurant_id,
    count(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text))
      filter (where m.active)::int as menu_count
  from scoped_restaurants sr
  left join menu_items m on m.restaurant_id = sr.place_id
  group by sr.place_id
),
target as (
  select p.*
  from photos p
  join scoped_restaurants sr on sr.place_id = p.restaurant_id
  where p.active
    and (
      ($6::text = 'rejected' and p.dedupe_reason is not null)
      or (
        $6::text = 'unverified'
        and p.content_hash is null
        and p.dedupe_reason is null
        and p.created_at > $7::timestamptz
        and p.source not in ('user_upload', 'user_suggested', 'merchant')
      )
    )
),
target_items as (
  select menu_item_id from target where menu_item_id is not null
  union
  select l.menu_item_id from target t join photo_menu_item_links l on l.photo_id = t.id
)
select jsonb_build_object(
  'scope', $5::text,
  'totalActivePhotoRows', (
    select count(*) from photos p join scoped_restaurants sr on sr.place_id = p.restaurant_id
    where p.active
  ),
  'verifiedUniqueContentHashes', (
    select count(distinct p.content_hash)
    from photos p join scoped_restaurants sr on sr.place_id = p.restaurant_id
    where p.active and p.content_hash is not null
  ),
  'activeKnownRejectedRows', (select count(*) from target),
  'activeKnownRejectedRestaurants', (select count(distinct restaurant_id) from target),
  'activeKnownRejectedMenuItems', (select count(*) from target_items),
  'activeUsefulPhotoRows', (
    select count(*)
    from photos p join scoped_restaurants sr on sr.place_id = p.restaurant_id
    where p.active and p.dedupe_reason is null
      and p.moderation_status = 'approved'
      and coalesce(p.is_orderable, true)
      and not coalesce(p.is_storefront, false)
      and not coalesce(p.is_menu_photo, false)
      and coalesce(p.storage_url, p.origin_url) is not null
  ),
  'rawBasicPhotoCoverageRestaurants', (
    select count(*) from photo_rollup where raw_photo_count >= 7
  ),
  'rawBasicMenuPhotoCoverageRestaurants', (
    select count(*) from photo_rollup where matched_photo_count >= 7
  ),
  'rawTwentyPercentMenuPhotoCoverageRestaurants', (
    select count(*)
    from menu_rollup m
    join photo_rollup p using (restaurant_id)
    where m.menu_count > 0
      and p.matched_photo_count >= 7
      and p.matched_dish_count >= ceil(m.menu_count * 0.2)
  ),
  'comparisonCoverageRestaurants', (
    select count(*) from comparison_rollup where comparison_dish_count >= 1
  ),
  'comparisonDishes', (
    select coalesce(sum(comparison_dish_count), 0) from comparison_rollup
  ),
  'reasonCounts', (
    select coalesce(jsonb_object_agg(dedupe_reason, n), '{}'::jsonb)
    from (
      select coalesce(dedupe_reason, 'verification_pending') as dedupe_reason, count(*)::int n
      from target
      group by coalesce(dedupe_reason, 'verification_pending')
      order by dedupe_reason
    ) grouped
  )
) as metrics`;

async function metrics(client, context) {
  const result = await client.query(METRICS_SQL, [
    ...BOUNDS,
    context.scope,
    context.kind,
    context.cutoff,
  ]);
  return result.rows[0].metrics;
}

async function audit(client, context) {
  await client.query("begin transaction isolation level repeatable read read only");
  const proof = (
    await client.query(
      "select current_setting('transaction_read_only') read_only, current_setting('transaction_isolation') isolation"
    )
  ).rows[0];
  const result = await metrics(client, context);
  await client.query("rollback");
  return { status: "audited", transaction: proof, metrics: result };
}

async function apply(client, context) {
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [context.scope]);
    const before = await metrics(client, context);
    if (Number(before.activeKnownRejectedRows) === 0) {
      await client.query("rollback");
      return { status: "no_op", before };
    }
    const run = await client.query(
      `insert into photo_dedupe_runs
         (scope, mode, status, before_metrics, notes)
       values ($1, 'apply', 'running', $2::jsonb, $3::jsonb)
       returning id::text`,
      [
        context.scope,
        JSON.stringify(before),
        JSON.stringify({
          rule:
            context.kind === "rejected"
              ? "active=true and dedupe_reason is not null"
              : `active acquired row has no content hash and was created after ${context.cutoff}`,
          kind: context.kind,
          cutoff: context.cutoff,
          rollback: `node scripts/quarantine-reactivated-photos.mjs --kind ${context.kind} --mode rollback --run <run-id>`,
        }),
      ]
    );
    const runId = run.rows[0].id;
    await client.query(
      `insert into photo_dedupe_actions
         (run_id, photo_id, canonical_photo_id, action, reason, previous_state)
       select
         $5::uuid,
         p.id,
         p.duplicate_of_photo_id,
         'quarantine_reactivated',
         coalesce(p.dedupe_reason, 'verification_pending'),
         jsonb_build_object(
           'active', p.active,
           'dedupe_reason', p.dedupe_reason,
           'dedupe_run_id', p.dedupe_run_id,
           'deduped_at', p.deduped_at
         )
       from photos p
       join restaurants r on r.place_id = p.restaurant_id
       join restaurant_entities e on e.id = r.entity_id
       where p.active
         and (
           ($6::text = 'rejected' and p.dedupe_reason is not null)
           or (
             $6::text = 'unverified'
             and p.content_hash is null
             and p.dedupe_reason is null
             and p.created_at > $7::timestamptz
             and p.source not in ('user_upload', 'user_suggested', 'merchant')
           )
         )
         and r.status <> 'test_fixture' and e.status <> 'test_fixture'
         and r.lat between $1 and $2 and r.lng between $3 and $4
       on conflict (run_id, photo_id) do nothing`,
      [...BOUNDS, runId, context.kind, context.cutoff]
    );
    const updated = await client.query(
      `update photos p
       set
         active = false,
         dedupe_reason = coalesce(p.dedupe_reason, 'verification_pending'),
         dedupe_run_id = $1,
         deduped_at = now()
       from photo_dedupe_actions a
       where a.run_id = $1 and a.photo_id = p.id and p.active
       returning p.id`,
      [runId]
    );
    const after = await metrics(client, context);
    await client.query(
      `update photo_dedupe_runs
       set status = 'completed', completed_at = now(), after_metrics = $2::jsonb,
           notes = notes || $3::jsonb
       where id = $1`,
      [
        runId,
        JSON.stringify(after),
        JSON.stringify({
          rowsQuarantined: updated.rowCount,
          legitimateUsefulCoverageLost:
            Number(before.activeUsefulPhotoRows) - Number(after.activeUsefulPhotoRows),
          comparisonDishesLost:
            Number(before.comparisonDishes) - Number(after.comparisonDishes),
        }),
      ]
    );
    await client.query("commit");
    return { status: "applied", runId, rowsQuarantined: updated.rowCount, before, after };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function rollback(client, originalRunId, context) {
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [context.scope]);
    const original = await client.query(
      "select id::text, scope, status from photo_dedupe_runs where id = $1 and scope = $2",
      [originalRunId, context.scope]
    );
    if (!original.rowCount) {
      throw new Error(`Run ${originalRunId} is not a ${context.scope} run`);
    }
    const before = await metrics(client, context);
    const rollbackRun = await client.query(
      `insert into photo_dedupe_runs
         (scope, mode, status, before_metrics, notes)
       values ($1, 'rollback', 'running', $2::jsonb, $3::jsonb)
       returning id::text`,
      [context.scope, JSON.stringify(before), JSON.stringify({ originalRunId })]
    );
    const rollbackRunId = rollbackRun.rows[0].id;
    await client.query(
      `insert into photo_dedupe_actions
         (run_id, photo_id, canonical_photo_id, action, reason, previous_state)
       select
         $2::uuid, p.id, p.duplicate_of_photo_id, 'restore_reactivated',
         coalesce(p.dedupe_reason, 'restored'),
         jsonb_build_object(
           'active', p.active,
           'dedupe_reason', p.dedupe_reason,
           'dedupe_run_id', p.dedupe_run_id,
           'deduped_at', p.deduped_at
         )
       from photos p
       join photo_dedupe_actions original
         on original.run_id = $1 and original.photo_id = p.id
       where p.dedupe_run_id = $1
       on conflict (run_id, photo_id) do nothing`,
      [originalRunId, rollbackRunId]
    );
    const restored = await client.query(
      `update photos p
       set
         active = coalesce((a.previous_state->>'active')::boolean, false),
         dedupe_reason = a.previous_state->>'dedupe_reason',
         dedupe_run_id = (a.previous_state->>'dedupe_run_id')::uuid,
         deduped_at = (a.previous_state->>'deduped_at')::timestamptz
       from photo_dedupe_actions a
       where a.run_id = $1 and a.photo_id = p.id and p.dedupe_run_id = $1
       returning p.id`,
      [originalRunId]
    );
    const after = await metrics(client, context);
    await client.query(
      `update photo_dedupe_runs
       set status = 'completed', completed_at = now(), after_metrics = $2::jsonb,
           notes = notes || $3::jsonb
       where id = $1`,
      [rollbackRunId, JSON.stringify(after), JSON.stringify({ rowsRestored: restored.rowCount })]
    );
    await client.query("commit");
    return {
      status: "rolled_back",
      originalRunId,
      rollbackRunId,
      rowsRestored: restored.rowCount,
      before,
      after,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = args(process.argv);
  const context = {
    kind: options.kind,
    cutoff: options.cutoff,
    scope: SCOPES[options.kind],
  };
  const client = new Client({
    connectionString: connectionString(),
    statement_timeout: 60_000,
    application_name: "seefood_quarantine_reactivated_photos",
  });
  await client.connect();
  try {
    const result =
      options.mode === "audit"
        ? await audit(client, context)
        : options.mode === "apply"
          ? await apply(client, context)
          : await rollback(client, options.runId, context);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
