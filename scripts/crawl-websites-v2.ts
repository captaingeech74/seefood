#!/usr/bin/env -S npx tsx
/**
 * Website acquisition V2. This is intentionally isolated from the current
 * web_crawl_jobs/website_menu_observations lane and never publishes into the
 * customer corpus. It uses Crawlee for orchestration and a fetch ladder of
 * HTTP -> Patchright -> Scrapling -> Crawl4AI, plus real PDF menu processing.
 */
import { BasicCrawler, log, RequestQueue } from "crawlee";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  detectOrderingPlatforms,
  extractEmbeddedJsonMenuItems,
  extractPageAssets,
  parseCapturedMenuPayloads,
  parseSchemaOrgMenuItems,
  parseVisibleMenuItems,
  type OrderingPlatform,
} from "../src/lib/menuSources";
import type { MenuItemData } from "../src/lib/types";
import { ensurePythonEnv, pythonFetchAsync, type PythonFetchResult } from "../src/crawler/pythonFetch";
import { extractPdfMenu } from "../src/crawler/pdfMenu";

type Website = { websiteId: string; entityId: string; url: string; domain: string; restaurantName: string };
type ItemEvidence = { item: MenuItemData; method: string; evidenceUrl: string; confidence: number };
type PageEvidence = { url: string; method: string; status: number | null; sha256?: string; itemCount: number };
type PdfEvidence = { url: string; status: string; sha256?: string; bytes?: number; pages?: number; method?: string; items: number; error?: string };

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function options() {
  const values: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index++) {
    if (!process.argv[index].startsWith("--")) continue;
    const key = process.argv[index].slice(2), next = process.argv[index + 1];
    values[key] = next && !next.startsWith("--") ? process.argv[++index] : "true";
  }
  return values;
}

function connectionString() {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
  if (!url) throw new Error("DATABASE_URL is not configured");
  return url;
}

function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function safePublicUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048 || /^(?:data|blob):/i.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch { return undefined; }
}

function fingerprint(item: MenuItemData) {
  return createHash("sha256").update(JSON.stringify([
    normalizeName(item.name), item.description?.trim() || null, item.price ?? null, item.imageUrl ?? null,
  ])).digest("hex");
}

function sourceKey(item: MenuItemData, platforms: OrderingPlatform[]) {
  return item.source ?? platforms[0] ?? "schema_org";
}

function mergeItems(items: ItemEvidence[]): ItemEvidence[] {
  const merged = new Map<string, ItemEvidence>();
  for (const candidate of items) {
    if (!candidate.item.name || candidate.item.name.length > 140) continue;
    const imageUrl = safePublicUrl(candidate.item.imageUrl);
    const sanitized = { ...candidate, item: { ...candidate.item, imageUrl } };
    const key = `${normalizeName(sanitized.item.name)}|${sanitized.item.price ?? ""}`;
    const current = merged.get(key);
    const quality = Number(Boolean(sanitized.item.description)) + Number(Boolean(sanitized.item.imageUrl)) * 2 + sanitized.confidence;
    const currentQuality = current ? Number(Boolean(current.item.description)) + Number(Boolean(current.item.imageUrl)) * 2 + current.confidence : -1;
    if (!current || quality > currentQuality) merged.set(key, sanitized);
  }
  return [...merged.values()].slice(0, 800);
}

function parseHtml(url: string, html: string, method: string): {
  items: ItemEvidence[]; photos: string[]; pdfs: string[]; links: string[]; platforms: OrderingPlatform[];
} {
  const platforms = detectOrderingPlatforms(html);
  const assets = extractPageAssets(html, url);
  const items: ItemEvidence[] = [];
  const add = (batch: MenuItemData[], extraction: string, confidence: number) => {
    for (const item of batch) items.push({ item, method: `${method}:${extraction}`, evidenceUrl: url, confidence });
  };
  add(parseSchemaOrgMenuItems(html), "schema_org", 0.95);
  add(parseVisibleMenuItems(html), "visible_menu", 0.8);
  for (const platform of platforms) add(extractEmbeddedJsonMenuItems(html, platform), `platform_${platform}`, 0.93);
  return {
    items,
    photos: assets.photoUrls.flatMap((value) => safePublicUrl(value) ?? []),
    pdfs: assets.pdfUrls.flatMap((value) => safePublicUrl(value) ?? []),
    links: assets.pageUrls.flatMap((value) => safePublicUrl(value) ?? []),
    platforms,
  };
}

async function directFetch(url: string): Promise<PythonFetchResult & { method: string }> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(18_000),
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 10 * 1024 * 1024) return { ok: false, status: response.status, error: "page_too_large", method: "http" };
    const html = await response.text();
    if (html.length > 10 * 1024 * 1024) return { ok: false, status: response.status, error: "page_too_large", method: "http" };
    return { ok: response.ok, status: response.status, html, finalUrl: response.url !== url ? response.url : null, method: "http" };
  } catch (error) {
    return { ok: false, status: null, error: String(error instanceof Error ? error.message : error), method: "http" };
  }
}

async function renderedFetch(url: string, engine: "patchright" | "scrapling" | "crawl4ai") {
  const result = await pythonFetchAsync(url, {
    render: true, engine, timeoutSec: engine === "crawl4ai" ? 50 : 35,
    waitMs: 1_500, captureMenuJson: engine === "patchright",
  });
  return { ...result, method: engine };
}

async function crawlWebsite(website: Website, renderEnabled: boolean) {
  const started = Date.now();
  const pageEvidence: PageEvidence[] = [], pdfEvidence: PdfEvidence[] = [];
  const allItems: ItemEvidence[] = [], photos = new Set<string>(), pdfs = new Set<string>(), platforms = new Set<OrderingPlatform>(), methods = new Set<string>();
  const queue = [website.url], queued = new Set(queue), visited = new Set<string>();
  let blocked = false, lastError: string | undefined;

  while (queue.length && visited.size < 5) {
    const requested = queue.shift()!;
    if (visited.has(requested)) continue;
    visited.add(requested);
    let fetched = await directFetch(requested);
    methods.add(fetched.method);
    let parsed = fetched.ok && fetched.html ? parseHtml(fetched.finalUrl ?? requested, fetched.html, fetched.method) : null;
    const shouldRender = renderEnabled && visited.size <= 2 && (
      !fetched.ok || !parsed || parsed.items.length === 0 || parsed.platforms.length > 0 || /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(fetched.html ?? "")
    );
    if (shouldRender) {
      for (const engine of ["patchright", "scrapling", "crawl4ai"] as const) {
        const rendered = await renderedFetch(requested, engine);
        methods.add(engine);
        if (rendered.error === "access_blocked") blocked = true;
        if (!rendered.ok || !rendered.html) { lastError = rendered.error; continue; }
        const renderedParsed = parseHtml(rendered.finalUrl ?? requested, rendered.html, engine);
        const network = parseCapturedMenuPayloads(rendered.payloads ?? []);
        for (const item of network) renderedParsed.items.push({ item, method: `${engine}:network_json`, evidenceUrl: rendered.finalUrl ?? requested, confidence: 0.94 });
        if (!parsed || renderedParsed.items.length > parsed.items.length) {
          fetched = { ...rendered, method: engine };
          parsed = renderedParsed;
        }
        if (renderedParsed.items.length > 0 || engine === "crawl4ai") break;
      }
    }
    if (!fetched.ok || !fetched.html || !parsed) {
      pageEvidence.push({ url: requested, method: fetched.method, status: fetched.status, itemCount: 0 });
      lastError = fetched.error ?? lastError;
      continue;
    }
    const finalUrl = fetched.finalUrl ?? requested;
    pageEvidence.push({
      url: finalUrl, method: fetched.method, status: fetched.status,
      sha256: createHash("sha256").update(fetched.html).digest("hex"), itemCount: parsed.items.length,
    });
    parsed.items.forEach((item) => allItems.push(item));
    parsed.photos.forEach((photo) => photos.add(photo));
    parsed.pdfs.forEach((pdf) => pdfs.add(pdf));
    parsed.platforms.forEach((platform) => platforms.add(platform));
    for (const link of parsed.links) {
      if (queued.size >= 12) break;
      if (!queued.has(link)) { queued.add(link); queue.push(link); }
    }
  }

  for (const pdfUrl of [...pdfs].slice(0, 5)) {
    const result = await extractPdfMenu(pdfUrl);
    if (result.error) {
      pdfEvidence.push({ url: pdfUrl, status: result.error === "pdf_too_large" ? "too_large" : "failed", items: 0, error: result.error });
      continue;
    }
    for (const item of result.items) allItems.push({ item, method: result.method, evidenceUrl: pdfUrl, confidence: result.method === "paddleocr_vl" ? 0.88 : 0.9 });
    pdfEvidence.push({
      url: pdfUrl, status: "processed", sha256: result.sha256, bytes: result.byteCount,
      pages: result.pageCount, method: result.method, items: result.items.length,
    });
  }

  const items = mergeItems(allItems);
  const linkedPhotos = [...new Set(items.flatMap(({ item }) => item.imageUrl ? [item.imageUrl] : []))];
  const status = items.length || linkedPhotos.length ? "completed" : blocked ? "blocked" : visited.size ? "empty" : "failed";
  return {
    status, items, genericPhotos: [...photos], linkedPhotos, pdfs: [...pdfs], pageEvidence, pdfEvidence,
    platforms: [...platforms], methods: [...methods], elapsedMs: Date.now() - started, error: lastError,
  };
}

async function persistResult(pool: pg.Pool, runId: string, website: Website, result: Awaited<ReturnType<typeof crawlWebsite>>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into website_crawl_v2_results(run_id,entity_id,website_id,website_url,status,fetch_methods,platforms,pages_visited,item_count,photo_candidate_count,menu_linked_photo_count,pdf_found_count,pdf_processed_count,pdf_item_count,elapsed_ms,response_evidence,error_detail)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
       on conflict(run_id,website_id) do update set
         status=excluded.status,fetch_methods=excluded.fetch_methods,platforms=excluded.platforms,
         pages_visited=excluded.pages_visited,item_count=excluded.item_count,
         photo_candidate_count=excluded.photo_candidate_count,menu_linked_photo_count=excluded.menu_linked_photo_count,
         pdf_found_count=excluded.pdf_found_count,pdf_processed_count=excluded.pdf_processed_count,
         pdf_item_count=excluded.pdf_item_count,elapsed_ms=excluded.elapsed_ms,
         response_evidence=excluded.response_evidence,error_detail=excluded.error_detail
       where website_crawl_v2_results.status='failed' and excluded.status<>'failed'`,
      [runId,website.entityId,website.websiteId,website.url,result.status,result.methods,result.platforms,result.pageEvidence.length,result.items.length,[...new Set([...result.genericPhotos,...result.linkedPhotos])].slice(0,160).length,result.linkedPhotos.length,result.pdfs.length,result.pdfEvidence.filter((pdf)=>pdf.status==="processed").length,result.pdfEvidence.reduce((sum,pdf)=>sum+pdf.items,0),result.elapsedMs,JSON.stringify({ pages: result.pageEvidence, pdfs: result.pdfEvidence }),result.error?.slice(0,500) ?? null]
    );
    for (const evidence of result.items) {
      const item = evidence.item;
      await client.query(
        `insert into website_menu_v2_observations(run_id,entity_id,website_id,evidence_url,extraction_method,source_key,item_name,item_description,image_url,price,confidence,item_fingerprint)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict do nothing`,
        [runId,website.entityId,website.websiteId,evidence.evidenceUrl,evidence.method,sourceKey(item,result.platforms),item.name,item.description??null,item.imageUrl??null,item.price??null,evidence.confidence,fingerprint(item)]
      );
    }
    for (const image of [...new Set([...result.genericPhotos, ...result.linkedPhotos])].slice(0, 160)) {
      await client.query(
        `insert into website_asset_v2_observations(run_id,entity_id,website_id,page_url,asset_url,kind,fetch_status,metadata)
         values($1,$2,$3,$4,$5,'image','discovered',$6::jsonb) on conflict do nothing`,
        [runId,website.entityId,website.websiteId,website.url,image,JSON.stringify({ menuLinked: result.linkedPhotos.includes(image) })]
      );
    }
    for (const pdf of result.pdfEvidence) {
      await client.query(
        `insert into website_asset_v2_observations(run_id,entity_id,website_id,page_url,asset_url,kind,fetch_status,content_sha256,byte_count,page_count,extraction_method,extracted_item_count,metadata)
         values($1,$2,$3,$4,$5,'pdf',$6,$7,$8,$9,$10,$11,$12::jsonb) on conflict do nothing`,
        [runId,website.entityId,website.websiteId,website.url,pdf.url,pdf.status,pdf.sha256??null,pdf.bytes??null,pdf.pages??null,pdf.method??null,pdf.items,JSON.stringify({ error: pdf.error??null })]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

async function main() {
  loadEnv();
  const args = options(), market = args.market ?? "temecula-ca";
  const resumeRunId = args["run-id"] ?? null;
  const limit = Math.min(5_000, Math.max(1, Number(args.limit ?? 5_000)));
  const concurrency = Math.min(16, Math.max(1, Number(args.concurrency ?? 8)));
  const renderEnabled = args["no-render"] !== "true";
  if (renderEnabled) {
    const python = ensurePythonEnv();
    if (!python.ready) throw new Error(`Advanced browser environment unavailable: ${python.reason}`);
  }
  const pool = new pg.Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: concurrency + 3 });
  const websites = (await pool.query(
    `with candidates as (
       select distinct on (w.entity_id)
         w.id "websiteId",w.entity_id "entityId",w.url,w.domain,e.name "restaurantName"
       from restaurant_websites w
       join acquisition_market_entities m on m.entity_id=w.entity_id and m.market_key=$1 and m.active
       join restaurant_entities e on e.id=w.entity_id
       where w.active and ($3::uuid is null or not exists(
         select 1 from website_crawl_v2_results previous
         where previous.run_id=$3 and previous.entity_id=w.entity_id and previous.status<>'failed'
       ))
       order by w.entity_id,
         case when w.domain ~ '(toasttab|menufy|chownow|olo|popmenu|bentobox|spothopper|slicelife|flipdish|clover|square)' then 0 else 1 end,
         length(w.url),w.url
     )
     select * from candidates
     order by case when domain ~ '(toasttab|menufy|chownow|olo|popmenu|bentobox|spothopper|slicelife|flipdish|clover|square)' then 0 else 1 end,
       case when lower("restaurantName") ~ '(restaurant|bistro|grill|sushi|thai|italian|mexican|seafood|steak|cafe)' then 0 else 1 end,
       "restaurantName",url limit $2`, [market, limit,resumeRunId]
  )).rows as Website[];
  let runId: string;
  if (resumeRunId) {
    const resumed = await pool.query(
      `update website_crawl_v2_runs set status='running',completed_at=null,
       metadata=metadata||jsonb_build_object('resumedAt',now())
       where id=$1 and market_key=$2 returning id`, [resumeRunId,market]
    );
    if (!resumed.rowCount) throw new Error(`Cannot resume run ${resumeRunId} for ${market}`);
    runId = resumed.rows[0].id;
  } else {
    const run = await pool.query(
      `insert into website_crawl_v2_runs(market_key,collector_version,configuration,website_count)
       values($1,'website-v2.0.0',$2::jsonb,$3) returning id`,
      [market,JSON.stringify({ concurrency, renderEnabled, maxPagesPerWebsite: 5, maxPdfsPerWebsite: 5, paidFallback: false }),websites.length]
    );
    runId = run.rows[0].id as string;
  }
  let finished = 0;
  log.setLevel(log.LEVELS.INFO);
  // A unique queue prevents a stopped/resumed market crawl from inheriting
  // handled-request state from an earlier process.
  const requestQueue = await RequestQueue.open(`website-v2-${runId}-${Date.now()}`);
  const crawler = new BasicCrawler({
    requestQueue,
    maxConcurrency: concurrency,
    maxRequestRetries: 0,
    requestHandlerTimeoutSecs: 300,
    async requestHandler({ request }) {
      const website = request.userData.website as Website;
      const result = await crawlWebsite(website, renderEnabled);
      await persistResult(pool, runId, website, result);
      finished++;
      if (finished % 10 === 0 || finished === websites.length) {
        console.log(JSON.stringify({ progress: `${finished}/${websites.length}`, restaurant: website.restaurantName, items: result.items.length, pdfItems: result.pdfEvidence.reduce((sum,pdf)=>sum+pdf.items,0), status: result.status }));
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      const website = request.userData.website as Website;
      await persistResult(pool, runId, website, {
        status: "failed", items: [], genericPhotos: [], linkedPhotos: [], pdfs: [], pageEvidence: [], pdfEvidence: [], platforms: [], methods: [], elapsedMs: 0, error: String(error),
      });
      finished++;
    },
  });
  try {
    await crawler.run(websites.map((website) => ({ url: website.url, uniqueKey: website.websiteId, userData: { website } })));
    const metrics = (await pool.query(
      `select count(*) completed,
        count(*) filter(where status='failed') failed,
        count(*) filter(where status='blocked') blocked,
        count(distinct entity_id) restaurants,
        count(distinct entity_id) filter(where item_count>0) restaurants_with_menu,
        coalesce(sum(item_count),0) items,coalesce(sum(photo_candidate_count),0) photos,
        coalesce(sum(menu_linked_photo_count),0) menu_linked_photos,
        coalesce(sum(pdf_found_count),0) pdfs_found,coalesce(sum(pdf_processed_count),0) pdfs_processed,
        coalesce(sum(pdf_item_count),0) pdf_items
       from website_crawl_v2_results where run_id=$1`, [runId]
    )).rows[0];
    await pool.query(
      `update website_crawl_v2_runs set status='completed',completed_count=$2,failed_count=$3,blocked_count=$4,restaurant_count=$5,
       restaurant_with_menu_count=$6,item_count=$7,photo_candidate_count=$8,menu_linked_photo_count=$9,pdf_found_count=$10,pdf_processed_count=$11,pdf_item_count=$12,completed_at=now()
       where id=$1`, [runId,metrics.completed,metrics.failed,metrics.blocked,metrics.restaurants,metrics.restaurants_with_menu,metrics.items,metrics.photos,metrics.menu_linked_photos,metrics.pdfs_found,metrics.pdfs_processed,metrics.pdf_items]
    );
    console.log(JSON.stringify({ runId, market, ...metrics }, null, 2));
  } catch (error) {
    await pool.query(`update website_crawl_v2_runs set status='failed',metadata=jsonb_build_object('error',$2::text),completed_at=now() where id=$1`, [runId,String(error)]);
    throw error;
  } finally { await pool.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
