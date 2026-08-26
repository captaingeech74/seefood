#!/usr/bin/env -S npx tsx
/** Deterministic read-only measurement for the live product corpus and an optional V3 run. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string){const index=process.argv.indexOf(`--${name}`);return index<0?undefined:process.argv[index+1];}
async function main(){loadEnv();const runId=argument("run-id")??null,password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-product-corpus-measurement"});await db.connect();await db.query("begin isolation level repeatable read read only");
  const coverage=(await db.query(`select
    count(distinct r.entity_id)::int entities,
    count(distinct r.entity_id) filter(where exists(select 1 from restaurant_websites w where w.entity_id=r.entity_id and w.active))::int with_website,
    count(distinct r.entity_id) filter(where exists(select 1 from menu_items mi where mi.restaurant_id=r.place_id and mi.active))::int with_menu,
    count(distinct r.entity_id) filter(where exists(select 1 from photos p where p.restaurant_id=r.place_id and p.active and p.is_orderable and p.dedupe_reason is null and not p.is_storefront))::int with_useful_photo,
    count(distinct r.entity_id) filter(where exists(select 1 from photos p where p.restaurant_id=r.place_id and p.active and (p.menu_item_id is not null or p.canonical_dish_id is not null)))::int with_named_or_matched_photo,
    count(distinct r.entity_id) filter(where exists(select 1 from photos p where p.restaurant_id=r.place_id and p.active and p.menu_item_id is not null))::int with_menu_matched_photo,
    (select count(*)::int from photos p join restaurants rr on rr.place_id=p.restaurant_id where rr.status<>'test_fixture' and p.active and p.is_orderable and p.dedupe_reason is null and not p.is_storefront) useful_photos,
    (select count(distinct p.content_hash)::int from photos p join restaurants rr on rr.place_id=p.restaurant_id where rr.status<>'test_fixture' and p.active and p.is_orderable and p.dedupe_reason is null and not p.is_storefront and p.content_hash is not null) exact_unique_photo_bytes,
    (select count(*)::int from photos p join restaurants rr on rr.place_id=p.restaurant_id where rr.status<>'test_fixture' and p.active and p.photo_author_type='management') management_photos,
    (select count(*)::int from photos p join restaurants rr on rr.place_id=p.restaurant_id where rr.status<>'test_fixture' and p.active and p.source='common_crawl') unmatched_official_photos
   from restaurants r where r.status<>'test_fixture'`)).rows[0];
  const queue=(await db.query(`select status,count(*)::int rows from web_crawl_jobs j where j.source='website_v3' and exists(select 1 from restaurants r where r.entity_id=j.entity_id and r.status<>'test_fixture') group by status order by status`)).rows;
  const run=runId?(await db.query(`select r.*,coalesce((select jsonb_build_object('assets',count(*),'completed',count(*) filter(where ar.status='completed'),'uniqueImageBytes',count(distinct ar.content_sha256) filter(where ar.kind='image' and ar.status='completed')) from website_asset_results ar where ar.run_id=r.id),'{}'::jsonb) asset_metrics from website_crawl_v3_runs r where r.id=$1`,[runId])).rows[0]??null:null;
  await db.query("rollback");await db.end();console.log(JSON.stringify({snapshotAt:new Date().toISOString(),coverage,queue,run},null,2));}
main().catch(error=>{console.error(error);process.exitCode=1;});
