#!/usr/bin/env -S npx tsx
import { verifiedSupabaseSsl } from "./lib/verifiedSupabaseSsl.mjs";

/** Idempotently promote the existing Eggplants acquisition identity to the live product. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ENTITY_ID = "d2044ace-5aaf-4e98-a5ba-b5b1006bf159";
const PLACE_ID = `seefood:${ENTITY_ID}`;
const NAME = "Eggplants Thai Cuisine";
const ADDRESS = "45440 Pechanga Pkwy, Suite 505, Temecula, CA 92592";
const LAT = 33.453902;
const LNG = -117.1011442;
const WEBSITE = "https://eggplantsthai.com/";
const ORDERING_URL = "https://eggplantsthaicuisineca.smiledining.com/";
const DOORDASH_URL = "https://www.doordash.com/store/eggplants-thai-cuisine-temecula-2879053/";

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  loadEnv();
  const rollback = process.argv.includes("--rollback");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: verifiedSupabaseSsl(),
    application_name: "seefood-add-eggplants-temecula",
  });
  await db.connect();
  try {
    await db.query("begin isolation level serializable");
    const entity = (await db.query(
      "select id,name from restaurant_entities where id=$1 for update",
      [ENTITY_ID]
    )).rows[0];
    if (!entity) throw new Error("The expected Overture identity for Eggplants is missing");

    if (rollback) {
      await db.query("update restaurants set status='inactive',updated_at=now() where place_id=$1", [PLACE_ID]);
      await db.query(
        "update acquisition_market_entities set active=false,last_seen_at=now() where market_key='temecula-ca' and entity_id=$1 and source='founder_qa'",
        [ENTITY_ID]
      );
      await db.query(
        "update restaurant_websites set active=false,updated_at=now() where entity_id=$1 and source='founder_qa'",
        [ENTITY_ID]
      );
      await db.query("commit");
      console.log(JSON.stringify({ mode: "rolled_back", entityId: ENTITY_ID, placeId: PLACE_ID }, null, 2));
      return;
    }

    await db.query(
      `update restaurant_entities set name=$2,normalized_name='eggplants thai cuisine',address=$3,
       lat=$4,lng=$5,website=$6,phone='+1 951-770-4224',categories=array['thai_restaurant','restaurant'],
       operating_status='open',status='active',backbone_state='published',updated_at=now() where id=$1`,
      [ENTITY_ID, NAME, ADDRESS, LAT, LNG, WEBSITE]
    );
    await db.query(
      `insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id,doordash_store_url,updated_at)
       values($1,'eggplants-thai-cuisine-temecula',$2,$3,$4,$5,$6,'active',$7,$8,now())
       on conflict(place_id) do update set name=excluded.name,lat=excluded.lat,lng=excluded.lng,
       address=excluded.address,website=excluded.website,status='active',entity_id=excluded.entity_id,
       doordash_store_url=excluded.doordash_store_url,updated_at=now()`,
      [PLACE_ID, NAME, LAT, LNG, ADDRESS, WEBSITE, ENTITY_ID, DOORDASH_URL]
    );
    const membership = await db.query(
      `update acquisition_market_entities set active=true,last_seen_at=now()
       where market_key='temecula-ca' and entity_id=$1 and source='founder_qa' returning 1`,
      [ENTITY_ID]
    );
    if (!membership.rowCount) {
      await db.query(
        `insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active)
         values('temecula-ca',$1,'founder_qa',now(),true)`,
        [ENTITY_ID]
      );
    }
    for (const [url, domain] of [[WEBSITE, "eggplantsthai.com"], [ORDERING_URL, "eggplantsthaicuisineca.smiledining.com"]]) {
      const websiteId = (await db.query(
        `insert into restaurant_websites(entity_id,url,domain,source,active,updated_at)
         values($1,$2,$3,'founder_qa',true,now())
         on conflict(entity_id,url) do update set active=true,updated_at=now() returning id`,
        [ENTITY_ID, url, domain]
      )).rows[0].id;
      await db.query(
        `insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
         values($1,$2,'website_v3','queued',5,now())
         on conflict(website_id,source) do update set status='queued',priority=5,available_at=now(),
         completed_at=null,last_error=null,updated_at=now()`,
        [ENTITY_ID, websiteId]
      );
    }
    await db.query("commit");
    console.log(JSON.stringify({ mode: "applied", entityId: ENTITY_ID, placeId: PLACE_ID, slug: "eggplants-thai-cuisine-temecula" }, null, 2));
  } catch (error) {
    try { await db.query("rollback"); } catch {}
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
