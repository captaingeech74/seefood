#!/usr/bin/env -S npx tsx

/** Idempotent, reversible import for a current public-record Carlsbad omission. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const PLACE_ID = "ChIJl1YkVAAL3IARHkqDrzYDj24";
const NAME = "Carlotta Brunch";
const ADDRESS = "3235 Camino de Los Coches #100, Carlsbad, CA 92009";
const WEBSITE = "https://carlottabrunch.com/";
// Photon/OpenStreetMap street-address result; Google Place ID above remains
// the durable provider identity when server-side Places access is available.
const LAT = 33.075172;
const LNG = -117.238421;

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
    ssl: { rejectUnauthorized: false },
    application_name: "seefood-carlsbad-priority-import",
  });
  await db.connect();
  try {
    await db.query("begin isolation level serializable");
    const known = await db.query(
      "select entity_id from restaurant_identities where provider='google' and provider_id=$1 limit 1",
      [PLACE_ID]
    );
    if (rollback && !known.rowCount) {
      await db.query("rollback");
      console.log(JSON.stringify({ mode: "already_absent", placeId: PLACE_ID }, null, 2));
      return;
    }
    const entityId = known.rows[0]?.entity_id ?? (await db.query(
      `insert into restaurant_entities(name,normalized_name,address,lat,lng,website,categories,operating_status,status,backbone_state)
       values($1,'carlotta brunch',$2,$3,$4,$5,array['breakfast_and_brunch_restaurant','restaurant'],'open','active','published')
       returning id`,
      [NAME, ADDRESS, LAT, LNG, WEBSITE]
    )).rows[0].id;

    if (rollback) {
      await db.query("update restaurants set status='inactive',updated_at=now() where place_id=$1", [PLACE_ID]);
      await db.query("update restaurant_identities set active=false,last_seen_at=now() where provider='google' and provider_id=$1", [PLACE_ID]);
      await db.query("update restaurant_websites set active=false,updated_at=now() where entity_id=$1 and url=$2", [entityId, WEBSITE]);
      await db.query("update acquisition_market_entities set active=false,last_seen_at=now() where market_key='carlsbad-ca' and entity_id=$1 and source='founder_qa'", [entityId]);
      await db.query("commit");
      console.log(JSON.stringify({ mode: "rolled_back", entityId, placeId: PLACE_ID }, null, 2));
      return;
    }

    await db.query(
      `update restaurant_entities set name=$2,normalized_name='carlotta brunch',address=$3,lat=$4,lng=$5,website=$6,
       categories=array['breakfast_and_brunch_restaurant','restaurant'],operating_status='open',status='active',backbone_state='published',updated_at=now()
       where id=$1`,
      [entityId, NAME, ADDRESS, LAT, LNG, WEBSITE]
    );
    await db.query(
      `insert into restaurant_identities(entity_id,provider,provider_id,name,address,lat,lng,website,confidence,last_seen_at,active)
       values($1,'google',$2,$3,$4,$5,$6,$7,1,now(),true)
       on conflict(provider,provider_id) do update set entity_id=excluded.entity_id,name=excluded.name,address=excluded.address,
       lat=excluded.lat,lng=excluded.lng,website=excluded.website,confidence=1,last_seen_at=now(),active=true`,
      [entityId, PLACE_ID, NAME, ADDRESS, LAT, LNG, WEBSITE]
    );
    await db.query(
      `insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id,updated_at)
       values($1,'carlotta-brunch-carlsbad',$2,$3,$4,$5,$6,'active',$7,now())
       on conflict(place_id) do update set name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,
       website=excluded.website,status='active',entity_id=excluded.entity_id,updated_at=now()`,
      [PLACE_ID, NAME, LAT, LNG, ADDRESS, WEBSITE, entityId]
    );
    const membership = await db.query(
      `update acquisition_market_entities set active=true,last_seen_at=now()
       where market_key='carlsbad-ca' and entity_id=$1 and source='founder_qa' returning 1`,
      [entityId]
    );
    if (!membership.rowCount) await db.query(
      `insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active)
       values('carlsbad-ca',$1,'founder_qa',now(),true)`,
      [entityId]
    );
    const websiteId = (await db.query(
      `insert into restaurant_websites(entity_id,url,domain,source,active,updated_at)
       values($1,$2,'carlottabrunch.com','founder_qa',true,now())
       on conflict(entity_id,url) do update set active=true,updated_at=now() returning id`,
      [entityId, WEBSITE]
    )).rows[0].id;
    await db.query(
      `insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
       values($1,$2,'website_v3','queued',5,now())
       on conflict(website_id,source) do update set status='queued',priority=5,available_at=now(),completed_at=null,last_error=null,updated_at=now()`,
      [entityId, websiteId]
    );
    await db.query("commit");
    console.log(JSON.stringify({ mode: "applied", entityId, websiteId, placeId: PLACE_ID }, null, 2));
  } catch (error) {
    try { await db.query("rollback"); } catch {}
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
