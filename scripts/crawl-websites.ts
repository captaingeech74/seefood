#!/usr/bin/env -S npx tsx
/** Bounded, resumable restaurant-website acquisition worker. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { fetchBoundedMenuFromUrl, parseCapturedMenuPayloads } from "../src/lib/menuSources";
import { ensurePythonEnv, pythonFetch } from "../src/crawler/pythonFetch";

type Job = {
  id: string; entity_id: string; website_id: string; url: string; domain: string;
  attempts: number; lease_token: string;
};

function args() {
  const values: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) {
    const key = process.argv[i].slice(2), value = process.argv[i + 1];
    values[key] = value && !value.startsWith("--") ? process.argv[++i] : "true";
  }
  return values;
}

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function client() {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  return new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: { rejectUnauthorized: false },
  });
}

const BLOCKED = /access denied|verify you are human|complete the security check|cloudflare ray id/i;
const JS_SHELL = /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>|enable javascript/i;
const looksBlocked = (html: string) => BLOCKED.test(html.replace(/<script[\s\S]*?<\/script>/gi, ""));

async function main() {
  loadEnv();
  // Local Chromium is the escalation path for this worker. Do not invoke the
  // serverless paid-render fallback from inside a metro crawl.
  delete process.env.SCRAPFLY_KEY;
  const options = args();
  const market = options.market;
  if (!market) throw new Error("Usage: npm run acquisition:websites -- --market temecula-ca [--limit 100] [--concurrency 8]");
  const limit = Math.min(250, Math.max(1, Number(options.limit ?? 50)));
  const concurrency = Math.min(16, Math.max(1, Number(options.concurrency ?? 6)));
  const db = client();
  await db.connect();
  const leased = await db.query(
    `select j.*,w.url,w.domain from lease_web_crawl_jobs($1,$2,20) j
     join restaurant_websites w on w.id=j.website_id`, [market, limit]
  );
  const jobs = leased.rows as Job[];
  if (!jobs.length) { console.log(JSON.stringify({ market, leased: 0 })); await db.end(); return; }
  await db.end();

  const pythonReady = options["no-render"] !== "true" && ensurePythonEnv().ready;
  const domainChains = new Map<string, Promise<void>>();
  let cursor = 0;
  const totals = { leased: jobs.length, completed: 0, blocked: 0, retry: 0, items: 0, photos: 0, rendered: 0 };

  async function processJob(job: Job) {
    const jobDb = client();
    await jobDb.connect();
    let usedRender = false;
    const capturedPayloads: unknown[] = [];
    let lastStatus: number | null = null;
    const fetchPage = async (url: string) => {
      const direct = await fetch(url, {
        redirect: "follow", signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "SeeFoodBot/1.0 (+https://seefood-rho.vercel.app)", Accept: "text/html,application/xhtml+xml" },
      });
      lastStatus = direct.status;
      const html = await direct.text();
      if (looksBlocked(html)) {
        throw Object.assign(new Error("access_blocked"), { blocked: true, status: direct.status });
      }
      if (direct.status === 401 || direct.status === 403 || direct.status === 429) {
        if (pythonReady) {
          const rendered = pythonFetch(url, { render: true, timeoutSec: 35, waitMs: 1_500, captureMenuJson: true });
          if (rendered.payloads) capturedPayloads.push(...rendered.payloads);
          if (rendered.ok && rendered.html && !looksBlocked(rendered.html)) { usedRender=true; return rendered.html; }
        }
        throw Object.assign(new Error("access_blocked"), { blocked: true, status: direct.status });
      }
      if (!direct.ok) throw Object.assign(new Error(`http_${direct.status}`), { status: direct.status });
      if (pythonReady && (JS_SHELL.test(html) || html.length < 2_000)) {
        const rendered = pythonFetch(url, { render: true, timeoutSec: 35, waitMs: 1_000, captureMenuJson: true });
        if (rendered.payloads) capturedPayloads.push(...rendered.payloads);
        if (rendered.ok && rendered.html && !looksBlocked(rendered.html)) {
          usedRender = true;
          return rendered.html;
        }
      }
      return html;
    };

    try {
      let result = await fetchBoundedMenuFromUrl(job.url, fetchPage);
      if (pythonReady && result.items.length === 0 && !usedRender) {
        const renderPage = async (url: string) => {
          const rendered = pythonFetch(url, { render: true, timeoutSec: 35, waitMs: 1_500, captureMenuJson: true });
          if (rendered.payloads) capturedPayloads.push(...rendered.payloads);
          if (!rendered.ok || !rendered.html || looksBlocked(rendered.html)) throw Object.assign(new Error(rendered.error??"render_failed"),{ blocked: rendered.error==="access_blocked", status: rendered.status });
          usedRender=true; return rendered.html;
        };
        try { result = await fetchBoundedMenuFromUrl(job.url, renderPage); } catch {}
      }
      const networkItems = parseCapturedMenuPayloads(capturedPayloads);
      if (networkItems.length) {
        const keyed = new Map([...result.items, ...networkItems].map((item) => [item.name.trim().toLowerCase(), item]));
        result = { ...result, items: [...keyed.values()], photoUrls: [...new Set([...result.photoUrls, ...networkItems.flatMap((item) => item.imageUrl??[])])] };
      }
      const sourceKey = result.platforms[0] ?? "schema_org";
      await jobDb.query("begin");
      await jobDb.query(
        `update website_menu_observations set active=false
         where entity_id=$1 and website_id=$2 and source_key=$3`, [job.entity_id, job.website_id, sourceKey]
      );
      for (const item of result.items) {
        const fingerprint = createHash("sha256").update(JSON.stringify([
          item.name.trim().toLowerCase(), item.description?.trim() ?? null, item.imageUrl ?? null,
        ])).digest("hex");
        await jobDb.query(
          `insert into website_menu_observations(entity_id,website_id,crawl_job_id,source_key,item_name,item_description,image_url,price,item_fingerprint)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict(entity_id,source_key,item_fingerprint) do update set active=true,last_seen_at=now(),crawl_job_id=excluded.crawl_job_id`,
          [job.entity_id,job.website_id,job.id,sourceKey,item.name,item.description??null,item.imageUrl??null,item.price??null,fingerprint]
        );
      }
      await jobDb.query(
        `update restaurant_websites set platforms=$2,page_count=$3,menu_item_count=$4,photo_count=$5,pdf_count=$6,
         last_http_status=$7,last_live_crawl_at=now(),updated_at=now() where id=$1`,
        [job.website_id,result.platforms,result.pagesVisited.length,result.items.length,result.photoUrls.length,result.pdfUrls.length,lastStatus]
      );
      await jobDb.query(
        `update web_crawl_jobs set status='completed',completed_at=now(),lease_token=null,lease_expires_at=null,
         last_http_status=$2,last_error=null,result_metadata=$3::jsonb,updated_at=now() where id=$1`,
        [job.id,lastStatus,JSON.stringify({ pages: result.pagesVisited.length, items: result.items.length, photos: result.photoUrls.length, pdfs: result.pdfUrls.length, platforms: result.platforms, rendered: usedRender, capturedPayloads: capturedPayloads.length })]
      );
      await jobDb.query("commit");
      totals.completed++; totals.items += result.items.length; totals.photos += result.photoUrls.length;
      if (usedRender) totals.rendered++;
    } catch (error: any) {
      await jobDb.query("rollback").catch(() => {});
      const blocked = Boolean(error?.blocked);
      const terminal = blocked || job.attempts >= 3;
      await jobDb.query(
        `update web_crawl_jobs set status=$2,available_at=case when $2='queued' then now()+interval '24 hours' else available_at end,
         lease_token=null,lease_expires_at=null,last_http_status=$3,last_error=$4,
         result_metadata=$5::jsonb,completed_at=case when $2 in ('blocked','failed') then now() else null end,updated_at=now() where id=$1`,
        [job.id,blocked?"blocked":terminal?"failed":"queued",error?.status??lastStatus,String(error?.message??error).slice(0,500),JSON.stringify({ blocked, rendered: usedRender })]
      );
      if (blocked) totals.blocked++; else totals.retry++;
    }
    await jobDb.end();
  }

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const previous = domainChains.get(job.domain) ?? Promise.resolve();
      const next = previous.then(() => processJob(job));
      domainChains.set(job.domain, next.catch(() => {}));
      await next;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  console.log(JSON.stringify({ market, ...totals }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
