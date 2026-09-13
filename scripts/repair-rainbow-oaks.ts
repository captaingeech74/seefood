#!/usr/bin/env -S npx tsx

/** Idempotent founder-QA repair using Rainbow Oaks' official Popmenu site. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { ensurePythonEnv } from "../src/crawler/pythonFetch";
import { crawlWebsiteV3, normalizeMenuItemName } from "../src/crawler/websiteV3";

const ENTITY_ID = "748f1ee5-0133-4812-92f1-9ba4b982297d";
const PLACE_ID = "ChIJkTQZJo6A24ARjQD2XLsbovY";
const WEBSITE_ID = "7eed9da2-52db-4550-b655-4d9d3ca4cfdc";
const WEBSITE = "https://www.rainbowoaksrestaurant.com";
const ADDRESS = "4815 5th Street, Fallbrook, CA 92028";

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function connectionString() {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const value = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

async function collect() {
  const ready = ensurePythonEnv();
  if (!ready.ready) throw new Error(ready.reason);
  const result = await crawlWebsiteV3({
    websiteId: WEBSITE_ID,
    entityId: ENTITY_ID,
    jobId: "founder-qa-preview",
    leaseToken: "founder-qa-preview",
    url: WEBSITE,
    domain: "rainbowoaksrestaurant.com",
    restaurantName: "Rainbow Oaks Restaurant",
    restaurantAddress: ADDRESS,
    attempts: 1,
    marketKeys: ["san-diego-metro-ca"],
  }, { renderEnabled: true, maxPages: 12, deepDiscovery: true });
  if (result.status !== "completed") throw new Error(`Official crawl failed: ${result.error ?? result.status}`);

  // The dedicated menu page is authoritative. The homepage also contains UI
  // labels and weekday headings which must not become dishes.
  const selected = result.items.filter((evidence) => {
    try { return new URL(evidence.evidenceUrl).pathname.replace(/\/$/, "") === "/menu" && evidence.confidence >= 0.78; }
    catch { return false; }
  });
  const byName = new Map<string, (typeof selected)[number]>();
  for (const evidence of selected) {
    const key = normalizeMenuItemName(evidence.item.name);
    if (!key) continue;
    const prior = byName.get(key);
    const score = Number(Boolean(evidence.item.imageUrl)) * 4 + Number(Boolean(evidence.item.description)) * 2 + Number(Boolean(evidence.item.price));
    const priorScore = prior ? Number(Boolean(prior.item.imageUrl)) * 4 + Number(Boolean(prior.item.description)) * 2 + Number(Boolean(prior.item.price)) : -1;
    if (!prior || score > priorScore) byName.set(key, evidence);
  }
  const items = [...byName.values()].map((evidence) => ({ ...evidence.item, source: "schema_org" as const }));
  let verifiedPhotos = 0;
  const { fingerprintPhoto, isImageContentType } = await import("../src/lib/photoFingerprint");
  for (const item of items) {
    if (!item.imageUrl) continue;
    try {
      const response = await fetch(item.imageUrl, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !isImageContentType(response.headers.get("content-type"))) { item.imageUrl = undefined; continue; }
      const bytes = Buffer.from(await response.arrayBuffer());
      const dimensions = await sharp(bytes, { failOn: "error" }).metadata();
      if ((dimensions.width ?? 0) < 480 || (dimensions.height ?? 0) < 360) { item.imageUrl = undefined; continue; }
      Object.assign(item, await fingerprintPhoto(bytes));
      verifiedPhotos++;
    } catch { item.imageUrl = undefined; }
  }
  return { result, items, verifiedPhotos };
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const rollback = process.argv.includes("--rollback");
  const db = new pg.Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    if (rollback) {
      await db.query("begin");
      await db.query("update photos set active=false,is_orderable=false where restaurant_id=$1 and source='schema_org'", [PLACE_ID]);
      await db.query("update menu_items set active=false where restaurant_id=$1 and source='schema_org'", [PLACE_ID]);
      await db.query("update restaurants set status='inactive',updated_at=now() where place_id=$1", [PLACE_ID]);
      await db.query("update restaurant_identities set active=false,last_seen_at=now() where provider='google' and provider_id=$1 and entity_id=$2", [PLACE_ID, ENTITY_ID]);
      await db.query("commit");
      console.log(JSON.stringify({ mode: "rolled_back", placeId: PLACE_ID }, null, 2));
      return;
    }

    const { result, items, verifiedPhotos } = await collect();
    if (!apply) {
      console.log(JSON.stringify({ mode: "preview", pages: result.pages.length, menuItems: items.length, verifiedPhotos }, null, 2));
      return;
    }

    await db.query("begin");
    await db.query(`update restaurant_entities set website=$2,status='active',backbone_state='published',address=$3,updated_at=now() where id=$1`, [ENTITY_ID, WEBSITE, ADDRESS]);
    await db.query(`insert into restaurant_identities(entity_id,provider,provider_id,name,address,lat,lng,website,confidence,last_seen_at,active)
      values($1,'google',$2,'Rainbow Oaks Restaurant',$3,33.4135785,-117.1581572,$4,1,now(),true)
      on conflict(provider,provider_id) do update set entity_id=excluded.entity_id,name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,website=excluded.website,confidence=1,last_seen_at=now(),active=true`, [ENTITY_ID, PLACE_ID, ADDRESS, WEBSITE]);
    await db.query(`insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id,updated_at)
      values($1,'rainbow-oaks-restaurant-fallbrook','Rainbow Oaks Restaurant',33.4135785,-117.1581572,$2,$3,'active',$4,now())
      on conflict(place_id) do update set name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,website=excluded.website,status='active',entity_id=excluded.entity_id,updated_at=now()`, [PLACE_ID, ADDRESS, WEBSITE, ENTITY_ID]);
    await db.query(`with refreshed as (
      update acquisition_market_entities set source='founder_qa',last_seen_at=now(),active=true
      where market_key='san-diego-metro-ca' and entity_id=$1 returning 1
    ) insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active)
      select 'san-diego-metro-ca',$1,'founder_qa',now(),true where not exists(select 1 from refreshed)`, [ENTITY_ID]);
    await db.query("commit");

    const { persistSourceMenuItems } = await import("../src/lib/db");
    const snapshotId = await persistSourceMenuItems(PLACE_ID, "schema_org", items);
    if (!snapshotId) throw new Error("Official website source is disabled or persistence failed");
    const counts = (await db.query(`select
      (select count(*)::int from menu_items where restaurant_id=$1 and active) menu_items,
      (select count(*)::int from photos where restaurant_id=$1 and active and is_orderable and dedupe_reason is null) photos,
      (select count(distinct content_hash)::int from photos where restaurant_id=$1 and active and is_orderable and dedupe_reason is null) unique_photos`, [PLACE_ID])).rows[0];
    console.log(JSON.stringify({ mode: "applied", placeId: PLACE_ID, snapshotId, verifiedPhotos, ...counts }, null, 2));
  } catch (error) {
    try { await db.query("rollback"); } catch {}
    throw error;
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
