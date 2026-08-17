#!/usr/bin/env -S npx tsx
/** Versioned, resumable Overture → SeeFood identity-backbone sync. */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { resolveIdentity, type IdentityCandidate } from "../src/lib/acquisitionIdentity";
import { formatOvertureAddress, isOvertureFoodServicePlace } from "../src/lib/overturePolicy";

type Args = Record<string, string | boolean>;
type Bounds = { west: number; south: number; east: number; north: number };
type Polygon = number[][][];
type OvertureRow = {
  providerId: string; version: string | null; name: string; lat: number; lng: number;
  address: string | null; websites: string[]; phone: string | null; socials: string[];
  operatingStatus: string | null; confidence: number; categories: string[];
  sources: unknown[]; licenseIds: string[]; fingerprint: string;
};

function parseArgs(argv: string[]): Args {
  const result: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const [rawKey, inline] = argv[i].slice(2).split("=", 2);
    if (inline !== undefined) result[rawKey] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) result[rawKey] = argv[++i];
    else result[rawKey] = true;
  }
  return result;
}

function loadEnvironment() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function databaseClient(): pg.Client {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  return new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: { rejectUnauthorized: false },
    application_name: "seefood-overture-sync",
  });
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

function pointInRing([x,y]: number[], ring: number[][]): boolean {
  let inside = false;
  for (let index=0; index<ring.length; index++) {
    const [x1,y1] = ring[index], [x2,y2] = ring[(index+ring.length-1)%ring.length];
    if ((y1>y)!==(y2>y) && x < ((x2-x1)*(y-y1))/(y2-y1)+x1) inside=!inside;
  }
  return inside;
}
function contains(point: number[], polygons: Polygon[]): boolean {
  return polygons.some((rings) => pointInRing(point,rings[0]) && !rings.slice(1).some((ring) => pointInRing(point,ring)));
}
async function loadBoundary(url?: string | null): Promise<{ polygons: Polygon[]; sha256: string } | null> {
  if (!url) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "SeeFood-Overture-Sync/1.0" } });
  if (!response.ok) throw new Error(`Market boundary request failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const value = JSON.parse(bytes.toString("utf8"));
  if (value.features?.length !== 1) throw new Error("Market boundary must contain exactly one feature");
  const geometry = value.features[0].geometry;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!polygons) throw new Error(`Unsupported boundary geometry: ${geometry.type}`);
  return { polygons, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function parseFeature(line: string, bounds: Bounds, countryCode: string, polygons?: Polygon[]): OvertureRow | null {
  let feature: any;
  try { feature = JSON.parse(line); } catch { return null; }
  const properties = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates;
  if (!isOvertureFoodServicePlace(properties) || !Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) return null;
  if (polygons && !contains([lng,lat],polygons)) return null;
  const addressRow = (properties.addresses ?? []).find((row: any) =>
    String(row?.country ?? "").toUpperCase() === countryCode.toUpperCase()
  ) ?? null;
  if (!addressRow) return null;
  const name = properties?.names?.primary;
  const providerId = feature.id;
  if (typeof name !== "string" || !name.trim() || typeof providerId !== "string") return null;
  const address = formatOvertureAddress(addressRow);
  const websites = [...new Set((properties.websites ?? []).map(normalizeUrl).filter(Boolean))] as string[];
  const sources = Array.isArray(properties.sources) ? properties.sources : [];
  const normalized = {
    providerId, version: properties.version == null ? null : String(properties.version), name: name.trim(), lat, lng,
    address, websites, phone: properties.phones?.[0] ?? null, socials: properties.socials ?? [],
    operatingStatus: properties.operating_status ?? null, confidence: Number(properties.confidence ?? 0.5),
    categories: [properties.categories?.primary, ...(properties.categories?.alternate ?? [])].filter(Boolean),
    sources,
  };
  return {
    ...normalized,
    licenseIds: [...new Set<string>(sources.flatMap((source: any) => typeof source?.license === "string" ? [source.license] : []))],
    fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}

function gridKey(lat: number, lng: number): string { return `${Math.floor(lat * 100)}:${Math.floor(lng * 100)}`; }

async function latestRelease(): Promise<string> {
  const response = await fetch("https://stac.overturemaps.org/catalog.json", { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Overture STAC request failed: ${response.status}`);
  const catalog = await response.json() as { latest?: string };
  if (!catalog.latest) throw new Error("Overture STAC catalog did not identify the latest release");
  return catalog.latest;
}

function downloadInput(bounds: Bounds, release?: string): string {
  const python = join(__dirname, "..", "crawler", ".venv", "bin", "python3");
  if (!existsSync(python)) {
    throw new Error("Overture CLI is not installed. Run: crawler/.venv/bin/python3 -m pip install overturemaps");
  }
  const directory = mkdtempSync(join(tmpdir(), "seefood-overture-"));
  const destination = join(directory, "places.geojsonseq");
  const command = ["-m", "overturemaps", "download", "--bbox", `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    "-f", "geojsonseq", "-t", "place",
    "--connect_timeout", "15", "--request_timeout", "180", "-o", destination];
  // Let the CLI resolve "latest" itself unless the operator pinned a release.
  // Some CLI/STAC combinations reject the catalog's current release when it is
  // redundantly passed with -r even though the same unpinned download works.
  if (release) command.splice(9, 0, "-r", release);
  const result = spawnSync(python, command, { stdio: "inherit" });
  if (result.status !== 0 || !existsSync(destination)) throw new Error(`Overture download failed with status ${result.status}`);
  return destination;
}

async function main() {
  loadEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const marketKey = String(args.market ?? "");
  if (!marketKey) throw new Error("Usage: npm run acquisition:overture -- --market temecula-ca [--input file] [--mode review|publish]");
  const mode = args.mode === "publish" ? "publish" : "review";
  const dryRun = Boolean(args["dry-run"]);
  const client = databaseClient();
  await client.connect();
  await client.query("set statement_timeout = 0");
  const marketResult = await client.query("select market_key,name,bounds,boundary_url,country_code from acquisition_markets where market_key=$1", [marketKey]);
  if (!marketResult.rowCount) throw new Error(`Unknown acquisition market: ${marketKey}`);
  const market = marketResult.rows[0] as { market_key: string; name: string; bounds: Bounds; boundary_url: string | null; country_code: string };
  const boundary = await loadBoundary(market.boundary_url);
  const release = String(args.release ?? await latestRelease());
  const input = args.input ? String(args.input) : downloadInput(market.bounds, args.release ? release : undefined);
  const inputHash = await sha256File(input);

  const existingBatch = await client.query(
    "select id,status from acquisition_import_batches where source='overture' and source_release=$1 and scope_key=$2 and input_sha256=$3",
    [release, marketKey, inputHash]
  );
  if (existingBatch.rowCount && existingBatch.rows[0].status === "completed") {
    console.log(JSON.stringify({ status: "already_completed", batchId: existingBatch.rows[0].id, market: marketKey, release, inputHash }, null, 2));
    await client.end(); return;
  }

  const existingRows = (await client.query(
    `select e.id,e.name,e.lat,e.lng,e.address,e.website,e.phone
     from restaurant_entities e
     where e.lat between $1 and $2 and e.lng between $3 and $4`,
    [market.bounds.south - 0.002, market.bounds.north + 0.002, market.bounds.west - 0.002, market.bounds.east + 0.002]
  )).rows as IdentityCandidate[];
  const identityRows = (await client.query(
    `select provider_id,entity_id from restaurant_identities where provider='overture' and active=true
     and lat between $1 and $2 and lng between $3 and $4`,
    [market.bounds.south - 0.01, market.bounds.north + 0.01, market.bounds.west - 0.01, market.bounds.east + 0.01]
  )).rows as Array<{ provider_id: string; entity_id: string }>;
  const identityMap = new Map(identityRows.map((row) => [row.provider_id, row.entity_id]));
  const entityById = new Map(existingRows.map((row) => [row.id, row]));
  const grid = new Map<string, IdentityCandidate[]>();
  for (const entity of existingRows) grid.set(gridKey(entity.lat, entity.lng), [...(grid.get(gridKey(entity.lat, entity.lng)) ?? []), entity]);

  const batchId = existingBatch.rowCount ? existingBatch.rows[0].id as string : randomUUID();
  if (!dryRun) {
    if (existingBatch.rowCount) {
      await client.query("update acquisition_import_batches set status='running',error_detail=null,completed_at=null where id=$1", [batchId]);
    } else {
      await client.query(
        `insert into acquisition_import_batches(id,source,source_release,scope_key,mode,input_sha256,metadata)
         values($1,'overture',$2,$3,$4,$5,$6::jsonb)`,
        [batchId, release, marketKey, mode, inputHash, JSON.stringify({ input, bounds: market.bounds, boundarySha256: boundary?.sha256 ?? null })]
      );
    }
    await client.query("update acquisition_markets set status='backbone_loading',updated_at=now() where market_key=$1", [marketKey]);
  }

  const stats = { inputRecords: 0, eligible: 0, existingIdentities: 0, matched: 0, created: 0, quarantined: 0, websites: 0 };
  let pending: OvertureRow[] = [];

  const flush = async () => {
    if (!pending.length) return;
    const rows: Array<OvertureRow & { entityId: string; disposition: string; resolution: ReturnType<typeof resolveIdentity> | null }> = [];
    for (const row of pending) {
      let entityId = identityMap.get(row.providerId) ?? null;
      let disposition = "existing";
      let resolution: ReturnType<typeof resolveIdentity> | null = null;
      if (entityId) stats.existingIdentities++;
      else {
        const baseLat=Math.floor(row.lat*100), baseLng=Math.floor(row.lng*100), candidates: IdentityCandidate[]=[];
        for(let y=-1;y<=1;y++) for(let x=-1;x<=1;x++) candidates.push(...(grid.get(`${baseLat+y}:${baseLng+x}`)??[]));
        resolution=resolveIdentity({...row,website:row.websites[0]},candidates); disposition=resolution.disposition;
        if (disposition==="match" && resolution.evidence) { entityId=resolution.evidence.candidateId; stats.matched++; }
        else {
          entityId=randomUUID(); stats.created++; if(disposition==="quarantine") stats.quarantined++;
          const entity: IdentityCandidate={id:entityId,name:row.name,lat:row.lat,lng:row.lng,address:row.address,website:row.websites[0],phone:row.phone};
          grid.set(gridKey(row.lat,row.lng),[...(grid.get(gridKey(row.lat,row.lng))??[]),entity]);
        }
      }
      stats.websites+=row.websites.length; identityMap.set(row.providerId,entityId);
      rows.push({...row,entityId,disposition,resolution});
    }
    if (!dryRun) await client.query("select apply_overture_import_rows($1,$2,$3,$4,$5::jsonb)",[batchId,release,marketKey,mode,JSON.stringify(rows)]);
    pending=[];
  };

  try {
    for await (const line of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      stats.inputRecords++;
      const row = parseFeature(line, market.bounds, market.country_code, boundary?.polygons);
      if (!row) continue;
      stats.eligible++;
      pending.push(row);
      if (pending.length >= 50) {
        await flush();
        if (stats.eligible % 2500 === 0) console.log(`[overture] ${market.name}: ${stats.eligible.toLocaleString()} eligible records processed`);
      }
    }
    await flush();
    if (!dryRun) {
      await client.query(
        `update acquisition_import_batches set status='completed',input_record_count=$2,eligible_record_count=$3,existing_identity_count=$4,
         matched_entity_count=$5,created_entity_count=$6,quarantined_count=$7,website_count=$8,completed_at=now() where id=$1`,
        [batchId,stats.inputRecords,stats.eligible,stats.existingIdentities,stats.matched,stats.created,stats.quarantined,stats.websites]
      );
      await client.query(
        `update acquisition_markets set status='backbone_ready',target_identity_count=$2,last_backbone_release=$3,last_backbone_sync_at=now(),updated_at=now()
         where market_key=$1`, [marketKey,stats.eligible,release]
      );
    }
  } catch (error) {
    if (!dryRun) await client.query("update acquisition_import_batches set status='failed',error_detail=$2,completed_at=now() where id=$1", [batchId,String(error)]);
    throw error;
  } finally { await client.end(); }
  console.log(JSON.stringify({ status: dryRun ? "dry_run" : "completed", batchId: dryRun ? null : batchId, market: marketKey, release, inputHash, ...stats }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
