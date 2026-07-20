#!/usr/bin/env node
import { createReadStream, readFileSync } from "fs";
import { createInterface } from "readline";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const input = process.argv.find((value) => value.startsWith("--input="))?.slice(8);
if (!input) throw new Error("Pass --input=/path/to/overture.geojsonl");
const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: { rejectUnauthorized: false } });
const FOOD = new Set(["restaurant","cafe","coffee_shop","bakery","bar","pub","food_truck","ice_cream_shop","dessert_shop","juice_shop","smoothie_shop","bubble_tea_shop","donut_shop","sandwich_shop","pizza_restaurant","fast_food_restaurant"]);
const normalize = (value = "") => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const gridKey = (lat, lng) => `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
function distanceMeters(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLng = (b.lng-a.lng)*rad;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function similarity(a,b) {
  if (a === b) return 1;
  const one = new Set(a.split(" ")), two = new Set(b.split(" "));
  return [...one].filter((part) => two.has(part)).length / Math.max(one.size,two.size,1);
}
function isCaliforniaFood(p) {
  if (p?.operating_status === "closed") return false;
  if (!p?.addresses?.some((a) => a?.country === "US" && a?.region === "CA")) return false;
  const categories = [p?.categories?.primary,...(p?.categories?.alternate ?? [])].filter(Boolean);
  return (p?.taxonomy?.hierarchy ?? []).includes("restaurant") || categories.some((category) => FOOD.has(category));
}

await client.connect();
const existing = (await client.query("select id,name,normalized_name,lat,lng from restaurant_entities where lat is not null and lng is not null")).rows;
const identities = new Map((await client.query("select provider_id,entity_id from restaurant_identities where provider='overture'")).rows.map((row) => [row.provider_id,row.entity_id]));
const grid = new Map();
for (const entity of existing) grid.set(gridKey(entity.lat,entity.lng),[...(grid.get(gridKey(entity.lat,entity.lng)) ?? []),entity]);
let scanned=0,accepted=0,created=0,matched=0,websites=0,batch=[];

async function flush() {
  if (!batch.length) return;
  const newEntities=batch.filter((row)=>row.isNew).map((row)=>row.entity);
  const idRows=batch.map((row)=>row.identity);
  const siteRows=batch.flatMap((row)=>row.websites.map((url)=>({entityId:row.entity.id,url})));
  await client.query("begin");
  try {
    if (newEntities.length) await client.query(`insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,categories,phone,email,socials,operating_status,overture_confidence)
      select id::uuid,name,normalized_name,address,lat,lng,website,'identity_only',categories,phone,email,socials,operating_status,confidence from jsonb_to_recordset($1::jsonb)
      as x(id text,name text,normalized_name text,address text,lat float8,lng float8,website text,categories text[],phone text,email text,socials text[],operating_status text,confidence numeric)
      on conflict(id) do nothing`,[JSON.stringify(newEntities)]);
    await client.query(`insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active)
      select entity_id::uuid,'overture',provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,now(),true from jsonb_to_recordset($1::jsonb)
      as x(entity_id text,provider_id text,provider_url text,name text,address text,lat float8,lng float8,website text,confidence numeric,raw_metadata jsonb)
      on conflict(provider,provider_id) do update set entity_id=excluded.entity_id,name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,website=excluded.website,confidence=excluded.confidence,raw_metadata=excluded.raw_metadata,last_seen_at=now(),active=true`,[JSON.stringify(idRows)]);
    if (siteRows.length) await client.query(`with incoming as (select distinct "entityId"::uuid entity_id,url,regexp_replace(lower(split_part(regexp_replace(url,'^https?://','','i'),'/',1)),'^www\\.','') domain from jsonb_to_recordset($1::jsonb) as x("entityId" text,url text)),
      sites as (insert into restaurant_websites(entity_id,url,domain,source) select entity_id,url,domain,'overture' from incoming on conflict(entity_id,url) do update set active=true,updated_at=now() returning id,entity_id)
      insert into web_crawl_jobs(entity_id,website_id,source,status,priority)
      select entity_id,id,source,'queued',priority from sites cross join (values ('live',30),('common_crawl',60)) as jobs(source,priority)
      on conflict(website_id,source) do nothing`,[JSON.stringify(siteRows)]);
    await client.query("commit");
  } catch(error) { await client.query("rollback"); throw error; }
  batch=[];
}

for await (const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})) {
  if (!line.trim()) continue;
  scanned++;
  let feature; try { feature=JSON.parse(line); } catch { continue; }
  const p=feature.properties ?? {}, coords=feature.geometry?.coordinates, name=p.names?.primary;
  if (!name || !Array.isArray(coords) || !isCaliforniaFood(p)) continue;
  const [lng,lat]=coords, normalizedName=normalize(name);
  const addressRow=p.addresses.find((a)=>a?.country === "US" && a?.region === "CA") ?? {};
  const address=addressRow.freeform || [addressRow.locality,"CA",addressRow.postcode].filter(Boolean).join(", ");
  const categories=[p.categories?.primary,...(p.categories?.alternate ?? [])].filter(Boolean);
  const siteUrls=[...new Set((p.websites ?? []).filter((url)=>/^https?:\/\//i.test(url)))];
  let entityId=identities.get(feature.id), entity, isNew=false;
  if (!entityId) {
    let best=null, baseLat=Math.round(lat*100), baseLng=Math.round(lng*100);
    for(let y=-1;y<=1;y++) for(let x=-1;x<=1;x++) for(const candidate of grid.get(`${baseLat+y}:${baseLng+x}`) ?? []) {
      const distance=distanceMeters({lat,lng},candidate);
      if(distance<=150 && similarity(normalizedName,candidate.normalized_name)>=0.6 && (!best || distance<best.distance)) best={candidate,distance};
    }
    if(best){entity=best.candidate;entityId=entity.id;matched++;}
    else {entityId=randomUUID();entity={id:entityId,name,normalized_name:normalizedName,lat,lng};grid.set(gridKey(lat,lng),[...(grid.get(gridKey(lat,lng)) ?? []),entity]);created++;isNew=true;}
  } else {entity=existing.find((row)=>row.id===entityId) ?? {id:entityId,name,normalized_name:normalizedName,lat,lng};matched++;}
  const entityPayload={id:entityId,name,normalized_name:normalizedName,address:address||null,lat,lng,website:siteUrls[0]??null,categories,phone:p.phones?.[0]??null,email:p.emails?.[0]??null,socials:p.socials??[],operating_status:p.operating_status??null,confidence:p.confidence??null};
  batch.push({isNew,entity:entityPayload,websites:siteUrls,identity:{entity_id:entityId,provider_id:feature.id,provider_url:`https://explore.overturemaps.org/places/${feature.id}`,name,address:address||null,lat,lng,website:siteUrls[0]??null,confidence:p.confidence??0.5,raw_metadata:{categories:p.categories,taxonomy:p.taxonomy,brand:p.brand,sources:p.sources,phones:p.phones,socials:p.socials}}});
  identities.set(feature.id,entityId);accepted++;websites+=siteUrls.length;
  if(batch.length>=500){await flush();if(accepted%5000===0)console.log(`Imported ${accepted.toLocaleString()} California food places...`);}
}
await flush();await client.end();
console.log(JSON.stringify({scanned,accepted,created,matched,websites},null,2));
