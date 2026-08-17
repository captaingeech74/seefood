#!/usr/bin/env -S npx tsx
/**
 * Reversible early-market publication. Preview is the default. Publication
 * creates or reactivates product restaurant rows for every evidenced market
 * restaurant not known closed/quarantined/rejected. Review-state raw business
 * records need specific food-service or strong menu evidence. Rollback hides created rows
 * without deleting any restaurant, menu, photo, provenance, or contribution.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const POLICY_VERSION = "show_all_restaurant_evidence_v2";

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function argument(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const next = process.argv[index + 1];
  return !next || next.startsWith("--") ? "true" : next;
}

function slugify(name: string, address: string | null) {
  const city = address?.split(",")[1]?.trim() ?? "";
  return `${name} ${city}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

interface CandidateRow {
  id: string;
  legacy_place_id: string | null;
  google_place_id: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  entity_status: string;
  existing_restaurant: Record<string, unknown> | null;
}

async function candidates(client: pg.PoolClient, market: string, source?: string): Promise<CandidateRow[]> {
  return (await client.query<CandidateRow>(`
    with market as (
      select distinct entity_id
      from acquisition_market_entities
      where market_key=$1 and active and ($2::text is null or source=$2)
    )
    select e.id,e.legacy_place_id,e.name,e.address,e.lat,e.lng,e.website,
      e.status entity_status,g.provider_id google_place_id,to_jsonb(r) existing_restaurant
    from market m
    join restaurant_entities e on e.id=m.entity_id
    left join lateral (
      select provider_id from restaurant_identities
      where entity_id=e.id and provider='google' and active
      order by confidence desc,last_seen_at desc limit 1
    ) g on true
    left join restaurants r on r.entity_id=e.id
    where e.backbone_state not in ('quarantined','rejected')
      and e.status not in ('inactive','rejected')
      and coalesce(e.operating_status,'')<>'permanently_closed'
      and e.lat is not null and e.lng is not null
      and (
        e.backbone_state='published'
        or exists (
          select 1 from unnest(coalesce(e.categories,'{}'::text[])) category
          where category<>'restaurant' and (
            category like '%restaurant%' or category in (
              'bar','salad_bar','food_truck','coffee_shop','cafe','bakery',
              'ice_cream_shop','brewery','winery','pub','sandwich_shop'
            )
          )
        )
        or exists (
          select 1 from website_menu_observations w
          where w.entity_id=e.id and w.active and w.confidence>=0.78
        )
      )
    order by e.name,e.id
  `, [market, source ?? null])).rows;
}

async function preview(client: pg.PoolClient, market: string, source?: string) {
  await client.query("begin transaction isolation level repeatable read read only");
  const rows = await candidates(client, market, source);
  const marketTotal = Number((await client.query(
    "select count(distinct entity_id) count from acquisition_market_entities where market_key=$1 and active",
    [market]
  )).rows[0].count);
  const alreadyLive = rows.filter((row) => row.existing_restaurant?.status !== "inactive" && row.existing_restaurant).length;
  const reactivations = rows.filter((row) => row.existing_restaurant?.status === "inactive").length;
  const creations = rows.length - alreadyLive - reactivations;
  await client.query("rollback");
  return {
    mode: "preview",
    market,
    source: source ?? "all",
    policyVersion: POLICY_VERSION,
    activeMarketEntities: marketTotal,
    eligibleNotKnownClosed: rows.length,
    excluded: marketTotal - rows.length,
    alreadyLive,
    wouldCreate: creations,
    wouldReactivate: reactivations,
  };
}

async function publish(client: pg.PoolClient, market: string, source?: string) {
  await client.query("begin isolation level serializable");
  try {
    const rows = await candidates(client, market, source);
    const marketTotal = Number((await client.query(
      "select count(distinct entity_id) count from acquisition_market_entities where market_key=$1 and active",
      [market]
    )).rows[0].count);
    const before = (await client.query(
      "select market_product_scorecard($1,$2) scorecard",
      [market, process.env.GOOGLE_MAPS_ENABLED === "true"]
    )).rows[0].scorecard;
    const run = (await client.query(
      `insert into market_publication_runs(
        market_key,policy_version,eligible_count,excluded_count,before_metrics
      ) values($1,$2,$3,$4,$5::jsonb) returning id`,
      [market, POLICY_VERSION, rows.length, marketTotal - rows.length, JSON.stringify(before)]
    )).rows[0];
    const slugRows = (await client.query("select slug from restaurants where slug is not null")).rows;
    const slugs = new Set<string>(slugRows.map((row) => row.slug));
    let alreadyLive = 0;
    let changed = 0;

    for (const row of rows) {
      const existing = row.existing_restaurant;
      if (existing && existing.status !== "inactive") {
        alreadyLive += 1;
        continue;
      }

      if (existing) {
        const updated = (await client.query(
          `update restaurants set status='active',updated_at=now()
           where entity_id=$1 returning to_jsonb(restaurants.*) after_restaurant`,
          [row.id]
        )).rows[0].after_restaurant;
        await client.query(
          `insert into market_publication_actions(
            run_id,entity_id,place_id,action,before_restaurant,before_entity_status,after_restaurant
          ) values($1,$2,$3,'reactivated',$4::jsonb,$5,$6::jsonb)`,
          [run.id, row.id, existing.place_id, JSON.stringify(existing), row.entity_status, JSON.stringify(updated)]
        );
      } else {
        const placeId = row.google_place_id ?? row.legacy_place_id ?? `seefood:${row.id}`;
        let slug = slugify(row.name, row.address) || `restaurant-${row.id.slice(0, 8)}`;
        if (slugs.has(slug)) slug = `${slug.slice(0, 71)}-${row.id.slice(0, 8)}`;
        slugs.add(slug);
        const inserted = (await client.query(
          `insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id,updated_at)
           values($1,$2,$3,$4,$5,$6,$7,'active',$8,now())
           returning to_jsonb(restaurants.*) after_restaurant`,
          [placeId, slug, row.name, row.lat, row.lng, row.address, row.website, row.id]
        )).rows[0].after_restaurant;
        await client.query(
          `insert into market_publication_actions(
            run_id,entity_id,place_id,action,before_entity_status,after_restaurant
          ) values($1,$2,$3,'created',$4,$5::jsonb)`,
          [run.id, row.id, placeId, row.entity_status, JSON.stringify(inserted)]
        );
      }
      await client.query(
        "update restaurant_entities set status='active',updated_at=now() where id=$1",
        [row.id]
      );
      changed += 1;
    }

    const after = (await client.query(
      "select market_product_scorecard($1,$2) scorecard",
      [market, process.env.GOOGLE_MAPS_ENABLED === "true"]
    )).rows[0].scorecard;
    await client.query(
      `update market_publication_runs set status='completed',already_live_count=$2,
       published_count=$3,after_metrics=$4::jsonb,completed_at=now() where id=$1`,
      [run.id, alreadyLive, changed, JSON.stringify(after)]
    );
    await client.query("commit");
    return { mode: "publish", runId: run.id, market, source: source ?? "all", policyVersion: POLICY_VERSION, alreadyLive, published: changed, before, after };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function rollback(client: pg.PoolClient, runId: string) {
  await client.query("begin isolation level serializable");
  try {
    const run = (await client.query(
      "select * from market_publication_runs where id=$1 for update",
      [runId]
    )).rows[0];
    if (!run) throw new Error(`Publication run ${runId} not found`);
    if (run.status === "rolled_back") {
      await client.query("rollback");
      return { mode: "rollback", runId, status: "already_rolled_back", changed: 0 };
    }
    if (run.status !== "completed") throw new Error(`Run status is ${run.status}, not completed`);
    const actions = (await client.query(
      "select * from market_publication_actions where run_id=$1 order by id desc",
      [runId]
    )).rows;
    for (const action of actions) {
      const previousStatus = action.action === "reactivated"
        ? action.before_restaurant?.status ?? "inactive"
        : "inactive";
      await client.query(
        "update restaurants set status=$2,updated_at=now() where entity_id=$1 and place_id=$3",
        [action.entity_id, previousStatus, action.place_id]
      );
      await client.query(
        "update restaurant_entities set status=$2,updated_at=now() where id=$1",
        [action.entity_id, action.before_entity_status]
      );
    }
    await client.query(
      "update market_publication_runs set status='rolled_back',rolled_back_at=now() where id=$1",
      [runId]
    );
    await client.query("commit");
    return { mode: "rollback", runId, status: "rolled_back", changed: actions.length };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function status(client: pg.PoolClient, market: string) {
  const runs = (await client.query(
    `select id,market_key,status,eligible_count,excluded_count,already_live_count,
            published_count,before_metrics,after_metrics,started_at,completed_at,rolled_back_at
     from market_publication_runs where market_key=$1 order by started_at desc limit 5`,
    [market]
  )).rows;
  const summary = (await client.query(`
    with eligible as (
      select distinct e.id,e.website
      from acquisition_market_entities m join restaurant_entities e on e.id=m.entity_id
      where m.market_key=$1 and m.active
        and e.backbone_state not in ('quarantined','rejected')
        and e.status not in ('inactive','rejected')
        and coalesce(e.operating_status,'')<>'permanently_closed'
        and e.lat is not null and e.lng is not null
    ), live as (
      select r.place_id,r.entity_id,coalesce(r.website,e.website) website
      from restaurants r join eligible e on e.id=r.entity_id where r.status<>'inactive'
    ), ready as (
      select rr.* from restaurant_product_readiness(array(select place_id from live),false) rr
    )
    select
      (select market_product_scorecard($1,false)) scorecard,
      (select count(*) from live where website is not null and website<>'')::int restaurants_with_website,
      (select count(*) from ready where menu_item_count>0)::int restaurants_with_menu,
      (select coalesce(sum(menu_item_count),0) from ready)::int distinct_menu_items,
      (select count(*) from ready where dish_photo_count>0)::int restaurants_with_dish_photo,
      (select coalesce(sum(dish_photo_count),0) from ready)::int distinct_photographed_dishes,
      (select count(*) from ready where readiness='partial')::int partial_restaurants,
      (select count(*) from ready where readiness='shell')::int shell_restaurants,
      (select count(*) from live where place_id like 'seefood:%')::int seefood_ids,
      (select count(*) from live where place_id not like 'seefood:%')::int provider_ids
  `, [market])).rows[0];
  const classification = (await client.query(`
    select e.backbone_state,e.operating_status,count(distinct e.id)::int records,
      count(distinct r.entity_id) filter(where r.status<>'inactive')::int live
    from acquisition_market_entities m
    join restaurant_entities e on e.id=m.entity_id
    left join restaurants r on r.entity_id=e.id
    where m.market_key=$1 and m.active
    group by e.backbone_state,e.operating_status order by e.backbone_state,e.operating_status
  `, [market])).rows;
  const reviewCandidates = (await client.query(`
    select e.id,e.name,e.categories,e.overture_confidence,e.operating_status,
      coalesce(r.status,'missing') product_status
    from acquisition_market_entities m
    join restaurant_entities e on e.id=m.entity_id
    left join restaurants r on r.entity_id=e.id
    where m.market_key=$1 and m.active and e.backbone_state='review'
    order by e.name
  `, [market])).rows;
  return { mode: "status", market, summary, classification, reviewCandidates, runs };
}

async function main() {
  loadEnv();
  const market = argument("market", "temecula-ca")!;
  const source = argument("source");
  const rollbackId = argument("rollback");
  const shouldPublish = process.argv.includes("--publish");
  const shouldShowStatus = process.argv.includes("--status");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: { rejectUnauthorized: false },
    max: 1,
    application_name: "seefood-market-publication",
  });
  const client = await pool.connect();
  try {
    const result = shouldShowStatus
      ? await status(client, market)
      : rollbackId
      ? await rollback(client, rollbackId)
      : shouldPublish
        ? await publish(client, market, source)
        : await preview(client, market, source);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
