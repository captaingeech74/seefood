#!/usr/bin/env -S npx tsx
/**
 * Idempotent official-source import for the eight named dining venues inside
 * Hotel Riu Palace Baja California. The resort page is the identity source;
 * RIU's own Hox menus are the dish/photo source. No paid API is used.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MARKET = "los-cabos-mx";
const PAGE = "https://www.riu.com/en/hotel/mexico/los-cabos/hotel-riu-palace-baja-california/gastronomy";
const HOTEL_PAGE = "https://www.riu.com/en/hotel/mexico/los-cabos/hotel-riu-palace-baja-california";
const ADDRESS = "Camino Viejo a San José, 3.5 km, Cabo San Lucas, BCS 23453, Mexico";
const LAT = 22.895642;
const LNG = -109.893993;
const EXPECTED = ["Promenade", "Krystal", "Yu Hi", "Agave", "Sofia", "Guacamole", "Elite Club", "Pepe's Food"];
const OVERTURE_ALIASES: Record<string, string[]> = {
  Krystal: ["krystal restaurant"],
  "Yu Hi": ["yu hi"],
  Guacamole: ["steak house guacamole"],
};

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractObjectAfter(source: string, marker: string): any {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Official page omitted ${marker}`);
  const start = source.indexOf("{", markerAt + marker.length);
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }
  throw new Error("Official restaurant data was truncated");
}

function translated(value: Array<{ lng?: string; value?: string }> | undefined): string {
  return value?.find((entry) => entry.lng === "en")?.value
    ?? value?.find((entry) => entry.value)?.value ?? "";
}

function menuProducts(value: unknown, category = "Other"): Array<{ name: string; description?: string; imageUrl?: string }> {
  if (Array.isArray(value)) return value.flatMap((row) => menuProducts(row, category));
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, any>;
  const nextCategory = row.type === "category" ? translated(row.title) || category : category;
  const own = row.type === "products" && Array.isArray(row.products)
    ? row.products.map((product: any) => ({
      name: translated(product.title),
      description: [translated(product.description), nextCategory !== "Other" ? nextCategory : ""].filter(Boolean).join(" · ") || undefined,
      imageUrl: product.customReference
        ? `https://hox.riubrandcenter.com/h/getfimg_v2/${encodeURIComponent(product.customReference)}.jpg?t=menu-pdp-800`
        : undefined,
    })).filter((item: { name: string }) => item.name)
    : [];
  return [...own, ...Object.entries(row)
    .filter(([key]) => key !== "products")
    .flatMap(([, child]) => menuProducts(child, nextCategory))];
}

async function fetchOfficial() {
  const response = await fetch(PAGE, { headers: { "User-Agent": "SeeFood-Official-Resort-Importer/1.0" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`RIU page returned ${response.status}`);
  const html = await response.text();
  const restaurants = extractObjectAfter(html, '"restaurants":')?.RestaurantList ?? [];
  const names = restaurants.map((restaurant: any) => restaurant.title);
  for (const name of EXPECTED) if (!names.includes(name)) throw new Error(`Official page no longer lists ${name}`);
  return { html, restaurants };
}

async function identities(db: pg.Client, _html: string, venues: any[]) {
  // Hash only restaurant evidence, not dynamic hotel prices/review counters in
  // the surrounding page, so an unchanged venue roster is truly idempotent.
  const fingerprintInput = venues.map((venue) => ({
    title: venue.title,
    highlights: venue.highlights,
    restaurant_info: venue.restaurant_info,
    gallery: venue.gallery,
  }));
  const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
  const prior = await db.query(
    "select id,status from acquisition_import_batches where source='official_website' and source_release=$1 and scope_key=$2 and input_sha256=$3",
    ["riu-live", MARKET, fingerprint]
  );
  if (prior.rows[0]?.status === "completed") return { status: "already_completed", batchId: prior.rows[0].id };
  const batchId = prior.rows[0]?.id ?? randomUUID();
  await db.query("begin");
  try {
    if (!prior.rowCount) await db.query(
      `insert into acquisition_import_batches(id,source,source_release,scope_key,mode,input_sha256,metadata)
       values($1,'official_website','riu-live',$2,'publish',$3,$4::jsonb)`,
      [batchId, MARKET, fingerprint, JSON.stringify({ page: PAGE, hotelPage: HOTEL_PAGE, expectedVenueCount: EXPECTED.length })]
    );
    const parentIdentity = `${HOTEL_PAGE}#hotel`;
    let parent = (await db.query(
      "select entity_id from restaurant_identities where provider='official_website' and provider_id=$1",
      [parentIdentity]
    )).rows[0]?.entity_id as string | undefined;
    if (!parent) {
      parent = randomUUID();
      await db.query(
        `insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,categories,phone,operating_status,backbone_state,venue_kind)
         values($1,'Hotel Riu Palace Baja California','hotel riu palace baja california',$2,$3,$4,$5,'identity_only',array['hotel'],'+52 624 163 1000','open','published','resort')`,
        [parent, ADDRESS, LAT, LNG, HOTEL_PAGE]
      );
      await db.query(
        `insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active,source_release,raw_fingerprint,last_import_batch_id)
         values($1,'official_website',$2,$3,'Hotel Riu Palace Baja California',$4,$5,$6,$3,1,$7::jsonb,now(),true,'riu-live',$8,$9)`,
        [parent, parentIdentity, HOTEL_PAGE, ADDRESS, LAT, LNG, JSON.stringify({ type: "Hotel", source: "official" }), fingerprint, batchId]
      );
      await db.query(
        "insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,after_state) values($1,$2,'official_website',$3,'entity_created',$4::jsonb)",
        [batchId, parent, parentIdentity, JSON.stringify({ name: "Hotel Riu Palace Baja California", venueKind: "resort" })]
      );
      await db.query(
        "insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,after_state) values($1,$2,'official_website',$3,'identity_inserted',$4::jsonb)",
        [batchId, parent, parentIdentity, JSON.stringify({ entity_id: parent })]
      );
    }

    let created = 0;
    for (const venue of venues) {
      const providerId = `${PAGE}#${slug(venue.title)}`;
      let entityId = (await db.query(
        "select entity_id from restaurant_identities where provider='official_website' and provider_id=$1",
        [providerId]
      )).rows[0]?.entity_id as string | undefined;
      if (!entityId && OVERTURE_ALIASES[venue.title]) {
        const nearby = (await db.query(
          `select distinct e.id,e.name from restaurant_entities e
           join restaurant_identities i on i.entity_id=e.id and i.provider='overture' and i.active
           where e.lat between $1 and $2 and e.lng between $3 and $4`,
          [LAT - 0.004, LAT + 0.004, LNG - 0.004, LNG + 0.004]
        )).rows;
        const aliases = new Set(OVERTURE_ALIASES[venue.title].map((name) => name.toLowerCase()));
        entityId = nearby.find((row) => aliases.has(String(row.name).toLowerCase()))?.id;
      }
      if (!entityId) {
        entityId = randomUUID(); created += 1;
        const cuisines = (venue.highlights ?? []).map((item: any) => String(item.name ?? "").replace(/<[^>]+>/g, "").trim()).filter(Boolean);
        await db.query(
          `insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,categories,phone,operating_status,backbone_state,parent_entity_id,venue_kind)
           values($1,$2,$3,$4,$5,$6,$7,'active',$8,'+52 624 163 1000','open','published',$9,'resort_restaurant')`,
          [entityId, `${venue.title} at Riu Palace Baja California`, slug(venue.title).replace(/-/g, " "), ADDRESS, LAT, LNG, PAGE, cuisines, parent]
        );
        await db.query(
          "insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,after_state) values($1,$2,'official_website',$3,'entity_created',$4::jsonb)",
          [batchId, entityId, providerId, JSON.stringify({ name: venue.title, parentEntityId: parent })]
        );
      }
      const cuisines = (venue.highlights ?? []).map((item: any) => String(item.name ?? "").replace(/<[^>]+>/g, "").trim()).filter(Boolean);
      await db.query(
        `update restaurant_entities set name=$2,normalized_name=$3,address=$4,website=$5,status='active',
         categories=(select array_agg(distinct value) from unnest(coalesce(categories,'{}'::text[]) || $6::text[]) value),
         phone='+52 624 163 1000',operating_status='open',backbone_state='published',parent_entity_id=$7,
         venue_kind='resort_restaurant',updated_at=now() where id=$1`,
        [entityId, `${venue.title} at Riu Palace Baja California`, slug(venue.title).replace(/-/g, " "), ADDRESS, PAGE, cuisines, parent]
      );
      const raw = { parent: "Hotel Riu Palace Baja California", highlights: venue.highlights, info: venue.restaurant_info, gallery: venue.gallery };
      const before = (await db.query("select to_jsonb(i) value from restaurant_identities i where provider='official_website' and provider_id=$1", [providerId])).rows[0]?.value;
      await db.query(
        `insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active,source_release,raw_fingerprint,last_import_batch_id)
         values($1,'official_website',$2,$3,$4,$5,$6,$7,$3,1,$8::jsonb,now(),true,'riu-live',$9,$10)
         on conflict(provider,provider_id) do update set entity_id=excluded.entity_id,name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,
           website=excluded.website,confidence=1,raw_metadata=excluded.raw_metadata,last_seen_at=now(),active=true,source_release=excluded.source_release,
           raw_fingerprint=excluded.raw_fingerprint,last_import_batch_id=excluded.last_import_batch_id`,
        [entityId, providerId, PAGE, venue.title, ADDRESS, LAT, LNG, JSON.stringify(raw), fingerprint, batchId]
      );
      await db.query(
        "insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,before_state,after_state) values($1,$2,'official_website',$3,$4,$5::jsonb,$6::jsonb)",
        [batchId, entityId, providerId, before ? "identity_updated" : "identity_inserted", before ? JSON.stringify(before) : null, JSON.stringify({ entity_id: entityId, fingerprint })]
      );
      await db.query(
        `insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active)
         values($1,$2,'official_website',now(),true) on conflict(market_key,entity_id,source) do update set last_seen_at=now(),active=true`,
        [MARKET, entityId]
      );
      const websiteId = (await db.query(
        `insert into restaurant_websites(entity_id,url,domain,source,active,updated_at)
         values($1,$2,'riu.com','official_website',true,now()) on conflict(entity_id,url) do update set active=true,updated_at=now() returning id`,
        [entityId, PAGE]
      )).rows[0].id;
      await db.query(
        `insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
         values($1,$2,'website_v3','queued',1,now()) on conflict(website_id,source) do update set status='queued',priority=1,available_at=now(),updated_at=now()`,
        [entityId, websiteId]
      );
    }
    await db.query(
      `update acquisition_import_batches set status='completed',input_record_count=$2,eligible_record_count=$2,
       created_entity_count=$3,website_count=$2,completed_at=now() where id=$1`,
      [batchId, venues.length, created]
    );
    await db.query("commit");
    return { status: "completed", batchId, venues: venues.length, created, fingerprint };
  } catch (error) { await db.query("rollback"); throw error; }
}

async function content(db: pg.Client, venues: any[]) {
  const { fingerprintPhoto } = await import("../src/lib/photoFingerprint");
  const { persistSourceMenuItems } = await import("../src/lib/db");
  const results: any[] = [];
  for (const venue of venues) {
    const menuLink = venue.restaurant_info?.[0]?.button_link as string | undefined;
    const entity = (await db.query(
      `select r.place_id from restaurant_identities i join restaurants r on r.entity_id=i.entity_id
       where i.provider='official_website' and i.provider_id=$1 and r.status<>'inactive'`,
      [`${PAGE}#${slug(venue.title)}`]
    )).rows[0];
    if (!entity) throw new Error(`${venue.title} is not published yet`);
    if (!menuLink) { results.push({ venue: venue.title, menu: "not_offered", items: 0, photos: 0 }); continue; }
    const resolved = await fetch(menuLink, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const catalogId = new URL(resolved.url).pathname.split("/").filter(Boolean).at(-1);
    if (!catalogId) throw new Error(`Could not resolve ${venue.title} menu`);
    const response = await fetch(`https://ws.hoxsolutions.com/v2/cgi/rest/catalog/${catalogId}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${venue.title} menu API returned ${response.status}`);
    const payload = await response.json() as any;
    // SeeFood is a dish chooser. RIU exposes a shared paid wine catalog next
    // to each restaurant's food menu; importing that would inflate dish/photo
    // coverage with identical bottle listings across every dining room.
    const rawItems = menuProducts((payload.response?.catalogs ?? []).filter((catalog: any) => catalog.type === "main"));
    const seen = new Set<string>();
    const items: any[] = [];
    for (const item of rawItems) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (item.imageUrl) {
        try {
          const image = await fetch(item.imageUrl, { signal: AbortSignal.timeout(20_000) });
          if (image.ok && image.headers.get("content-type")?.startsWith("image/")) {
            const buffer = Buffer.from(await image.arrayBuffer());
            if (buffer.length <= 20 * 1024 * 1024) Object.assign(item, await fingerprintPhoto(buffer));
          }
        } catch { /* keep the truthful menu item even if one image is transient */ }
      }
      items.push({ ...item, source: "schema_org" });
    }
    await persistSourceMenuItems(entity.place_id, "schema_org", items);
    results.push({ venue: venue.title, catalogId, items: items.length, photos: items.filter((item) => item.contentHash).length });
  }
  return results;
}

async function main() {
  loadEnv();
  const stage = process.argv.includes("--content") ? "content" : "identities";
  const { html, restaurants } = await fetchOfficial();
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: { rejectUnauthorized: false }, application_name: "seefood-riu-official-import" });
  await db.connect();
  try {
    console.log(JSON.stringify(stage === "identities" ? await identities(db, html, restaurants) : await content(db, restaurants), null, 2));
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
