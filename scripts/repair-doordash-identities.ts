#!/usr/bin/env -S npx tsx

/**
 * Audit and disable DoorDash feeds whose cached store identity does not match
 * the SeeFood restaurant. Defaults to a read-only audit. Each applied repair
 * writes the complete prior state into source_runs.metadata for exact rollback.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { findDoorDashStoreUrlInSitemap } from "../src/crawler/doordashSitemap";

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : process.argv[index + 1] ?? "true";
}

type RestaurantRow = {
  place_id: string;
  entity_id: string | null;
  name: string;
  address: string | null;
  doordash_store_url: string;
};

function cityFrom(row: RestaurantRow): string | undefined {
  const parts = row.address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  if (parts.length >= 3) return parts.at(-3);
  const slug = decodeURIComponent(row.doordash_store_url.split("/store/")[1] ?? "");
  for (const city of ["temecula", "murrieta", "spokane", "san-diego", "cabo-san-lucas"]) {
    if (slug.includes(city)) return city.replaceAll("-", " ");
  }
  return undefined;
}

async function selectInvalid(db: pg.Client, restaurantId: string | null): Promise<RestaurantRow[]> {
  const rows = (await db.query<RestaurantRow>(
    `select place_id,entity_id::text,name,address,doordash_store_url
       from restaurants
      where doordash_store_url is not null
        and status <> 'test_fixture'
        and ($1::text is null or place_id=$1)
      order by name,place_id`,
    [restaurantId]
  )).rows;
  return rows.filter((row) => !findDoorDashStoreUrlInSitemap(
    [row.doordash_store_url], row.name, cityFrom(row)
  ));
}

async function audit(db: pg.Client, restaurantId: string | null) {
  await db.query("begin transaction isolation level repeatable read read only");
  try {
    const invalid = await selectInvalid(db, restaurantId);
    const shared = (await db.query(
      `select doordash_store_url,count(*)::int restaurant_rows,array_agg(name order by name) names
         from restaurants where doordash_store_url is not null and status<>'test_fixture'
        group by doordash_store_url having count(*)>1 order by count(*) desc,doordash_store_url`
    )).rows;
    await db.query("rollback");
    return {
      mode: "audit",
      invalidCount: invalid.length,
      invalid: invalid.map((row) => ({
        restaurantId: row.place_id,
        name: row.name,
        address: row.address,
        providerUrl: row.doordash_store_url,
      })),
      sharedProviderUrlCount: shared.length,
      shared,
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function apply(db: pg.Client, restaurantId: string | null) {
  await db.query("begin");
  try {
    await db.query("select pg_advisory_xact_lock(hashtext('doordash-provider-identity-repair'))");
    const invalid = await selectInvalid(db, restaurantId);
    const results = [];
    for (const row of invalid) {
      const menu = (await db.query(
        `select id::text,active from menu_items where restaurant_id=$1 and source='doordash' order by id`,
        [row.place_id]
      )).rows;
      const photos = (await db.query(
        `select id::text,active,is_orderable,dedupe_reason from photos
          where restaurant_id=$1 and source='doordash' order by id`,
        [row.place_id]
      )).rows;
      const metadata = {
        repair: "provider_identity_mismatch_v1",
        expectedRestaurantName: row.name,
        previousProviderUrl: row.doordash_store_url,
        previousMenuRows: menu,
        previousPhotoRows: photos,
        rollback: "npm run acquisition:repair-doordash-identities -- --mode rollback --run-id <source-run-id>",
      };
      const run = await db.query(
        `insert into source_runs(restaurant_id,source,ok,item_count,photo_count,error,provider_url,failure_stage,metadata)
         values($1,'doordash',false,0,0,'provider_identity_mismatch',$2,'identity_validation',$3::jsonb)
         returning id::text`,
        [row.place_id, row.doordash_store_url, JSON.stringify(metadata)]
      );
      await db.query(
        `update menu_items set active=false,missing_streak=0
          where restaurant_id=$1 and source='doordash' and active`,
        [row.place_id]
      );
      await db.query(
        `update photos set active=false,is_orderable=false,is_hero_candidate=false,
             dedupe_reason='provider_identity_mismatch',deduped_at=now()
          where restaurant_id=$1 and source='doordash' and (active or is_orderable)`,
        [row.place_id]
      );
      await db.query(
        `update restaurants set doordash_store_url=null,updated_at=now() where place_id=$1`,
        [row.place_id]
      );
      results.push({ sourceRunId: run.rows[0].id, restaurantId: row.place_id, name: row.name, menuRows: menu.length, photoRows: photos.length });
    }
    await db.query("commit");
    return { mode: "apply", repaired: results.length, results };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function rollback(db: pg.Client, runId: string) {
  await db.query("begin");
  try {
    const run = (await db.query(
      `select restaurant_id,metadata from source_runs where id=$1 and source='doordash' and failure_stage='identity_validation'`,
      [runId]
    )).rows[0];
    if (!run || run.metadata?.repair !== "provider_identity_mismatch_v1") throw new Error(`Unknown repair run ${runId}`);
    await db.query("select pg_advisory_xact_lock(hashtext('doordash-provider-identity-repair'))");
    for (const item of run.metadata.previousMenuRows ?? []) {
      await db.query("update menu_items set active=$2 where id=$1", [item.id, item.active]);
    }
    for (const photo of run.metadata.previousPhotoRows ?? []) {
      await db.query(
        `update photos set active=$2,is_orderable=$3,dedupe_reason=$4,
             deduped_at=case when $4::text is null then null else deduped_at end
          where id=$1 and dedupe_reason='provider_identity_mismatch'`,
        [photo.id, photo.active, photo.is_orderable, photo.dedupe_reason]
      );
    }
    await db.query(
      `update restaurants set doordash_store_url=$2,updated_at=now()
        where place_id=$1 and doordash_store_url is null`,
      [run.restaurant_id, run.metadata.previousProviderUrl]
    );
    await db.query("commit");
    return { mode: "rollback", sourceRunId: runId, restaurantId: run.restaurant_id };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function main() {
  loadEnv();
  const mode = argument("mode") ?? "audit";
  const restaurantId = argument("restaurant-id");
  const runId = argument("run-id");
  if (!["audit", "apply", "rollback"].includes(mode)) throw new Error("--mode must be audit, apply, or rollback");
  if (mode === "rollback" && !runId) throw new Error("--run-id is required for rollback");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: { rejectUnauthorized: false },
    application_name: "seefood_doordash_identity_repair",
  });
  await db.connect();
  try {
    const result = mode === "audit"
      ? await audit(db, restaurantId)
      : mode === "apply"
        ? await apply(db, restaurantId)
        : await rollback(db, runId!);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
