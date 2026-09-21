#!/usr/bin/env -S npx tsx

/**
 * Read-only, bounded structured-platform extraction pilot.
 *
 * It selects a deliberately mixed low/rich cohort from the existing-city
 * corpus and writes complete V3 results for later review/publication. It does
 * not create acquisition runs or mutate staging/product tables.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { ensurePythonEnv } from "../src/crawler/pythonFetch";
import { crawlWebsiteV3, type WebsiteV3Result, type WebsiteV3Target } from "../src/crawler/websiteV3";
import type { OrderingPlatform } from "../src/lib/menuSources";

const PILOT_PROVIDERS: OrderingPlatform[] = ["popmenu", "toast", "spothopper", "owner", "bentobox", "square"];
const OUTPUT_DIR = join(__dirname, "..", "logs", "structured-platforms-20260920");

type Candidate = {
  website_id: string;
  entity_id: string;
  name: string;
  address: string | null;
  url: string;
  domain: string;
  platforms: OrderingPlatform[];
  markets: string[];
  useful_photos: number;
  menu_item_count: number;
  website_photo_count: number;
};

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

function option(name: string, fallback: number): number {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
  return value ? Number(value) : fallback;
}

function stringOption(name: string): string | undefined {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
}

function selectCohort(candidates: Candidate[], perProvider: number): Array<Candidate & { pilotProvider: OrderingPlatform }> {
  const selected: Array<Candidate & { pilotProvider: OrderingPlatform }> = [];
  const used = new Set<string>();
  const usedRoutes = new Set<string>();
  for (const provider of PILOT_PROVIDERS) {
    const eligible = candidates.filter((candidate) => candidate.platforms.includes(provider));
    const low = [...eligible].sort((a, b) => a.useful_photos - b.useful_photos || a.name.localeCompare(b.name));
    const rich = [...eligible].sort((a, b) => b.useful_photos - a.useful_photos || a.name.localeCompare(b.name));
    // Four gaps plus two working/rich references for a six-per-provider pilot.
    const ordered = [...low.slice(0, Math.max(4, perProvider - 2)), ...rich, ...low];
    let count = 0;
    for (const candidate of ordered) {
      let routeKey = candidate.url.toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, "");
      try { const parsed = new URL(candidate.url); routeKey = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase(); } catch {}
      if (count >= perProvider || used.has(candidate.entity_id) || usedRoutes.has(routeKey)) continue;
      selected.push({ ...candidate, pilotProvider: provider });
      used.add(candidate.entity_id);
      usedRoutes.add(routeKey);
      count++;
    }
  }
  return selected;
}

function summary(result: WebsiteV3Result) {
  const itemPhotos = new Set(result.items.flatMap((evidence) => evidence.item.imageUrl ? [evidence.item.imageUrl] : []));
  return {
    status: result.status,
    items: result.items.length,
    itemLinkedPhotos: itemPhotos.size,
    namedPhotos: result.namedPhotos.length,
    genericPhotos: result.genericPhotos.length,
    pages: result.pages.length,
    platforms: result.platforms,
    methods: result.methods,
    error: result.error,
  };
}

async function main() {
  loadEnv();
  const ready = ensurePythonEnv();
  if (!ready.ready) throw new Error(ready.reason);
  const perProvider = Math.min(8, Math.max(1, option("per-provider", 6)));
  const maxPages = Math.min(4, Math.max(1, option("max-pages", 2)));
  const concurrency = Math.min(8, Math.max(1, option("concurrency", 3)));
  const onlyProvider = stringOption("provider") as OrderingPlatform | undefined;
  const entityIds = new Set((stringOption("entity-ids") ?? "").split(",").filter(Boolean));
  const db = new pg.Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await db.connect();
  const candidates = (await db.query<Candidate>(`
    select distinct on (w.entity_id)
      w.id website_id,w.entity_id,e.name,e.address,w.url,w.domain,w.platforms,
      coalesce(w.menu_item_count,0)::int menu_item_count,coalesce(w.photo_count,0)::int website_photo_count,
      array_remove(array_agg(distinct m.market_key),null) markets,coalesce(max(p.useful_photos),0)::int useful_photos
    from restaurant_websites w
    join restaurant_entities e on e.id=w.entity_id
    left join acquisition_market_entities m on m.entity_id=e.id and m.active
    left join lateral (
      select count(*)::int useful_photos
      from restaurants r join photos ph on ph.restaurant_id=r.place_id
        and ph.active and ph.is_orderable and ph.dedupe_reason is null
      where r.entity_id=e.id and r.status not in ('inactive','test_fixture')
    ) p on true
    where w.active and w.platforms && $1::text[]
      and exists(select 1 from restaurants live where live.entity_id=e.id and live.status not in ('inactive','test_fixture'))
    group by w.id,w.entity_id,e.name,e.address,w.url,w.domain,w.platforms,w.menu_item_count,w.photo_count
    order by w.entity_id,w.updated_at desc
  `, [PILOT_PROVIDERS])).rows;
  await db.end();

  let cohort = selectCohort(candidates, perProvider);
  if(process.argv.includes("--all")) {
    const baseline=JSON.parse(readFileSync(join(OUTPUT_DIR,"baseline.json"),"utf8"));
    const discovery=JSON.parse(readFileSync(join(OUTPUT_DIR,"discovery.json"),"utf8"));
    const byUrl=new Map<string,any>(discovery.records.map((row:any)=>[row.url,row]));
    cohort=baseline.entities.flatMap((entity:any)=>{
      const websites=entity.websites.map((w:any)=>({...w,found:byUrl.get(w.url)}));
      const relevant=websites.filter((w:any)=>entity.platforms.length||w.found?.platforms?.length||/rainbowoaks/.test(w.url));
      // Keep distinct site/ordering hosts; equivalent www/http roots are one route.
      const unique=new Map<string,any>();
      for(const w of relevant){const u=new URL(w.url);const key=u.hostname.replace(/^www\./,"")+u.pathname.replace(/\/$/,"")+u.search;if(!unique.has(key))unique.set(key,w);}
      return [...unique.values()].map((w:any)=>({website_id:w.id,entity_id:entity.entity_id,name:entity.name,address:null,url:w.url,domain:w.domain,
        platforms:[...new Set([...entity.platforms,...(w.found?.platforms??[])])],markets:entity.markets,useful_photos:entity.unique_photos,
        menu_item_count:entity.menu_rows,website_photo_count:entity.photo_rows,pilotProvider:entity.platforms[0]??w.found?.platforms?.[0]??"popmenu"}));
    }).sort((a:any,b:any)=>a.useful_photos-b.useful_photos||a.name.localeCompare(b.name));
    // Addresses from the authoritative entity prevent wrong-location routing.
    const lookup=new pg.Client({connectionString:connectionString(),ssl:{rejectUnauthorized:false}});await lookup.connect();
    const addresses=(await lookup.query('select id,address from restaurant_entities where id=any($1::uuid[])',[[...new Set(cohort.map(c=>c.entity_id))]])).rows;
    await lookup.end();const addressMap=new Map(addresses.map(row=>[row.id,row.address]));
    cohort=cohort.map(c=>({...c,address:addressMap.get(c.entity_id)??c.address}));
  }
  if (onlyProvider) cohort = cohort.filter((target) => target.pilotProvider === onlyProvider);
  if (entityIds.size) {
    cohort = candidates
      .filter((target) => entityIds.has(target.entity_id))
      .map((target) => ({ ...target, pilotProvider: target.platforms.find((platform) => PILOT_PROVIDERS.includes(platform)) ?? "popmenu" }));
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(OUTPUT_DIR, stringOption("output")??`${runId}.json`);
  const records: any[] = existsSync(outputPath)?JSON.parse(readFileSync(outputPath,"utf8")).records:[];
  const alreadyDone=new Set(records.map(record=>`${record.target.entity_id}|${record.target.url}`));
  cohort=cohort.filter(target=>!alreadyDone.has(`${target.entity_id}|${target.url}`));
  const domainTails=new Map<string,Promise<void>>();
  let next = 0;
  async function worker() {
    while (next < cohort.length) {
      const candidate = cohort[next++];
      const target: WebsiteV3Target = {
        websiteId: candidate.website_id,
        entityId: candidate.entity_id,
        jobId: `structured-platform-pilot-${runId}`,
        leaseToken: "read-only-pilot",
        url: candidate.url,
        domain: candidate.domain,
        restaurantName: candidate.name,
        restaurantAddress: candidate.address ?? undefined,
        marketKeys: candidate.markets,
        attempts: 1,
      };
      const startedAt = new Date().toISOString();
      try {
        const prior=domainTails.get(candidate.domain)??Promise.resolve();
        const work=prior.then(()=>crawlWebsiteV3(target, { renderEnabled: true, maxPages, deepDiscovery: false }));
        domainTails.set(candidate.domain,work.then(()=>{},()=>{}));
        const result = await work;
        const record = { target: candidate, startedAt, finishedAt: new Date().toISOString(), summary: summary(result), result };
        records.push(record);
        console.log(JSON.stringify({ provider: candidate.pilotProvider, name: candidate.name, ...record.summary }));
      } catch (error) {
        const record = { target: candidate, startedAt, finishedAt: new Date().toISOString(), failure: String(error) };
        records.push(record);
        console.log(JSON.stringify({ provider: candidate.pilotProvider, name: candidate.name, failure: String(error) }));
      }
      writeFileSync(outputPath, JSON.stringify({ runId, configuration: { perProvider, maxPages, concurrency }, cohort, records }, null, 2));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(JSON.stringify({ runId, outputPath, selected: cohort.length, completed: records.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
