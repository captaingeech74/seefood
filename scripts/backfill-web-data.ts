#!/usr/bin/env -S npx tsx
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";

const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

interface Target { placeId: string; website: string; }
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 500;
const archiveOnly = process.argv.includes("--archive-only");
async function main() {
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { fetchMenuFromUrl, extractArchivedPage } = await import("../src/lib/menuSources");
const { saveWebsiteIntelligence, saveMenuItems } = await import("../src/lib/db");

const targets: Target[] = [];
const { data: rows } = await db.from("restaurants").select("place_id,website").not("website", "is", null).limit(limit);
for (const row of rows ?? []) targets.push({ placeId: row.place_id, website: row.website });

// Hydrate the current Google corpus first; historically the pipeline used the
// Place Details website transiently without retaining it.
if (!archiveOnly && targets.length < limit) {
  const { data: missing } = await db.from("restaurants").select("place_id").is("website", null).neq("status", "test_fixture").limit(limit - targets.length);
  for (const row of missing ?? []) {
    const params = new URLSearchParams({ place_id: row.place_id, fields: "website", key: process.env.GOOGLE_MAPS_API_KEY ?? "" });
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const website = (await response.json()).result?.website;
    if (website) targets.push({ placeId: row.place_id, website });
  }
}

let commonCrawlEndpoint: string | null | undefined;
async function commonCrawl(url: string) {
  if (commonCrawlEndpoint === undefined) {
    const indexList = await fetch("https://index.commoncrawl.org/collinfo.json", { signal: AbortSignal.timeout(20000) }).then((response) => response.json()) as Array<{ id: string; "cdx-api": string }>;
    commonCrawlEndpoint = indexList[0]?.["cdx-api"] ?? null;
  }
  const endpoint = commonCrawlEndpoint;
  if (!endpoint) return null;
  const query = new URLSearchParams({ url: `${new URL(url).hostname}/*`, output: "json", filter: "status:200", collapse: "digest", limit: "5" });
  const text = await fetch(`${endpoint}?${query}`, { signal: AbortSignal.timeout(15000) }).then((response) => response.text());
  const records = text.trim().split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  for (const record of records.reverse()) {
    try {
      const start = Number(record.offset), end = start + Number(record.length) - 1;
      const response = await fetch(`https://data.commoncrawl.org/${record.filename}`, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(20000) });
      const decoded = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
      const body = decoded.slice(decoded.indexOf("\r\n\r\n", decoded.indexOf("\r\n\r\n") + 4) + 4);
      if (body.length > 200) return extractArchivedPage(record.url ?? url, body);
    } catch {}
  }
  return null;
}

let liveItems=0,livePhotos=0,archiveItems=0,archivePhotos=0,completed=0;
for (const target of targets) {
  try {
    if (!archiveOnly) {
      const result = await fetchMenuFromUrl(target.website);
      await saveWebsiteIntelligence(target.placeId, target.website, result, "google");
      await saveMenuItems(target.placeId, result.items);
      liveItems += result.items.length; livePhotos += result.photoUrls.length;
    }
    try {
      const archived = await commonCrawl(target.website);
      if (archived) {
        await saveWebsiteIntelligence(target.placeId, target.website, archived, "common_crawl");
        await saveMenuItems(target.placeId, archived.items.map((item) => ({ ...item, source: "common_crawl" })));
        archiveItems += archived.items.length; archivePhotos += archived.photoUrls.length;
      }
    } catch (error) { console.error(`[common-crawl] ${target.website}:`, error); }
    completed++;
    console.log(`[${completed}/${targets.length}] ${new URL(target.website).hostname}`);
  } catch (error) { console.error(`[web] ${target.website}:`, error); }
}
console.log(JSON.stringify({ targets: targets.length, completed, liveItems, livePhotos, archiveItems, archivePhotos }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
