#!/usr/bin/env -S npx tsx
/**
 * Tier 1 local corpus crawler (PRD §5.2). Run on the founder's Mac — the
 * residential IP is the whole point; it beats blocks that stop cloud scrapers.
 *
 * Usage:
 *   npm run crawl -- --place ChIJ... --name "Richie's Diner" --lat 33.48 --lng -117.09
 *   npm run crawl -- --zone temecula
 *   npm run crawl -- --zone temecula --refresh-stale
 *   npm run crawl -- --preload-doordash-sitemaps   (downloads every DoorDash
 *     region's store sitemap to the local disk cache only — nothing written
 *     to the corpus. Run this once so later crawls never wait on a cold
 *     sitemap download; each region is cached ~18MB/24h.)
 *
 * One command, resumable (safe to Ctrl-C — each restaurant commits to the
 * corpus immediately), polite rate limit (~1 restaurant/min default).
 *
 * Architecture: Python (crawler/fetch.py) does raw fetching ONLY for the one
 * target that genuinely needs it — DoorDash, whose Scrapfly cost (51-75+
 * credits/lookup) bans it from the live serverless path entirely (see
 * DECISIONS.md). Everything else (website, Menufy, ordering platforms,
 * Grubhub, Google photos + Gemini) reuses the exact same Node pipeline the
 * live path uses — getGooglePhotosAndReviews — so there is exactly one
 * parser per source, not two.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load .env.local into process.env BEFORE importing anything that reads env
// vars at module-load time (google.ts, db.ts, storage.ts all do). Next.js does
// this automatically; a plain tsx script doesn't, so we do it by hand here.
function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    console.error(`\n⚠ ${envPath} not found. Copy your Vercel env vars into it first.\n`);
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

interface CrawlTarget {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  address?: string;
}

const RATE_LIMIT_MS = 60_000; // ~1 restaurant/min, polite default

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function loadTargets(args: ReturnType<typeof parseArgs>): Promise<CrawlTarget[]> {
  if (args.place) {
    return [
      {
        placeId: String(args.place),
        name: String(args.name ?? args.place),
        lat: parseFloat(String(args.lat ?? "0")),
        lng: parseFloat(String(args.lng ?? "0")),
      },
    ];
  }

  if (args.zone) {
    // v1: zone lists come from a committed seed file (benchmark/restaurants.json
    // for "temecula" today). Full paginated Places-API zone discovery is a
    // follow-up once this pipeline is proven on the known set.
    const seedPath = join(__dirname, "..", "benchmark", "restaurants.json");
    const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as Array<{
      name: string;
      placeId: string;
      lat: number;
      lng: number;
    }>;
    return seed;
  }

  console.error("Usage: npm run crawl -- --place <id> --name <name> --lat <lat> --lng <lng>");
  console.error("       npm run crawl -- --zone temecula [--refresh-stale]");
  process.exit(1);
}

async function main() {
  // Dynamic imports — deferred until after loadEnvLocal() has populated
  // process.env, since these modules read env vars at module-load time.
  const { extractDoorDashItems, extractGrubhubItems, parseGrubhubSearchUrl, parseNextDataMenuItems, getGooglePhotosAndReviews } =
    await import("../src/lib/google");
  const { persistPipelineResult, saveMenuItems, savePhotos, logSourceRun, getCorpusSnapshot, getDoorDashStoreUrl, saveDoorDashStoreUrl } =
    await import("../src/lib/db");
  const { ensurePythonEnv, pythonFetch } = await import("../src/crawler/pythonFetch");
  const { loadStoreSitemap, findDoorDashStoreUrlInSitemap } = await import("../src/crawler/doordashSitemap");
  type MenuItemData = import("../src/lib/types").MenuItemData;

  // DoorDash discovery, in priority order (Kyle's direction, July 2026 —
  // Google Custom Search JSON API is permanently closed to new customers,
  // confirmed with a hard 403 on a clean project; see DECISIONS.md):
  //   1. Cache — never discover the same restaurant twice.
  //   2. Sitemap — confirmed real: www.doordash.com/robots.txt lists a genuine
  //      store-level sitemap index, unprotected on cdn.doordash.com (no
  //      Cloudflare wall, no Camoufox needed). One state file, ~100k URLs,
  //      cached to disk for 24h. This alone resolved 4/5 known-DoorDash
  //      restaurants correctly in testing.
  //   3. Camoufox interactive search — TODO, only needed for restaurants the
  //      sitemap doesn't cover (e.g. states/regions not yet cached).
  // Launch zone is Temecula, CA — hardcoded here; generalize when the crawler
  // covers more than one state.
  const DOORDASH_STATE = "ca";
  const DOORDASH_CITY = "temecula";

  async function crawlDoorDash(target: CrawlTarget): Promise<MenuItemData[]> {
    let storeUrl = await getDoorDashStoreUrl(target.placeId).catch(() => null);
    if (storeUrl) {
      console.log(`  [doordash] using cached store URL: ${storeUrl}`);
    } else {
      const sitemapUrls = await loadStoreSitemap(DOORDASH_STATE).catch((e) => {
        console.log(`  [doordash] sitemap load failed: ${e}`);
        return [] as string[];
      });
      console.log(`  [doordash] sitemap loaded: ${sitemapUrls.length} CA store URLs`);
      storeUrl = findDoorDashStoreUrlInSitemap(sitemapUrls, target.name, DOORDASH_CITY);

      if (storeUrl) {
        console.log(`  [doordash] found via sitemap: ${storeUrl}`);
        await saveDoorDashStoreUrl(target.placeId, storeUrl).catch(() => {});
      } else {
        console.log(`  [doordash] not found in sitemap for "${target.name}" — no interactive-search fallback yet`);
        return [];
      }
    }

    const storeResult = pythonFetch(storeUrl, { render: true, referer: "https://www.doordash.com/" });
    if (!storeResult.ok || !storeResult.html) {
      console.log(`  [doordash] store page fetch failed: ${storeResult.error ?? storeResult.status}`);
      return [];
    }

    const items = parseNextDataMenuItems(storeResult.html, extractDoorDashItems);
    console.log(`  [doordash] ${items.length} items from ${storeUrl}`);
    return items.map((i) => ({ ...i, source: "doordash" as const }));
  }

  // Grubhub root cause (confirmed live, see DECISIONS.md): zero bot protection,
  // but the search results page is a pure client-rendered SPA — the live
  // path's Scrapfly render_js=false config never executes the JS that
  // populates results, so it always finds nothing regardless of query. Unlike
  // DoorDash, Grubhub needs no anti-bot bypass at all, just real JS execution
  // — Camoufox (a real browser) should handle this more reliably than tuning
  // Scrapfly's render wait blindly. First live test of this path.
  async function crawlGrubhub(target: CrawlTarget): Promise<MenuItemData[]> {
    const searchUrl = `https://www.grubhub.com/search?queryText=${encodeURIComponent(target.name)}&latitude=${target.lat}&longitude=${target.lng}&orderMethod=delivery`;
    const searchResult = pythonFetch(searchUrl, { render: true, referer: "https://www.grubhub.com/" });
    console.log(`  [grubhub] search → status=${searchResult.status} ok=${searchResult.ok}` + (!searchResult.ok ? ` error=${searchResult.error ?? "n/a"}` : ""));
    if (!searchResult.ok || !searchResult.html) return [];

    const storeUrl = parseGrubhubSearchUrl(searchResult.html, target.name);
    if (!storeUrl) {
      console.log(`  [grubhub] no matching restaurant found for "${target.name}"`);
      return [];
    }
    console.log(`  [grubhub] found: ${storeUrl}`);

    const storeResult = pythonFetch(storeUrl, { render: true, referer: "https://www.grubhub.com/" });
    if (!storeResult.ok || !storeResult.html) {
      console.log(`  [grubhub] store page fetch failed: ${storeResult.error ?? storeResult.status}`);
      return [];
    }

    const items = parseNextDataMenuItems(storeResult.html, extractGrubhubItems);
    console.log(`  [grubhub] ${items.length} items from ${storeUrl}`);
    return items.map((i) => ({ ...i, source: "grubhub" as const }));
  }

  async function crawlOne(target: CrawlTarget, refreshStale: boolean): Promise<void> {
    if (!refreshStale) {
      const existing = await getCorpusSnapshot(target.placeId).catch(() => null);
      if (existing?.isFresh) {
        console.log(`⏭  ${target.name} — corpus already fresh, skipping`);
        return;
      }
    }

    console.log(`\n▶ ${target.name}`);
    const start = Date.now();

    // Website + Menufy + ordering platforms + Grubhub + Google photos + Gemini —
    // the exact same pipeline the live serverless path runs.
    const { photos, menuItems } = await getGooglePhotosAndReviews(target.placeId, target.name);
    console.log(`  [pipeline] ${photos.length} photos, ${menuItems.length} menu items`);

    async function crawlAndPersist(source: "doordash" | "grubhub", crawlFn: () => Promise<MenuItemData[]>) {
      const sourceStart = Date.now();
      const items = await crawlFn();
      await logSourceRun({
        placeId: target.placeId,
        source,
        ok: items.length > 0,
        itemCount: items.length,
        photoCount: items.filter((i) => i.imageUrl).length,
        latencyMs: Date.now() - sourceStart,
      }).catch(() => {});

      if (items.length > 0) {
        const nameToId = await saveMenuItems(target.placeId, items);
        await savePhotos(
          target.placeId,
          items
            .filter((i) => i.imageUrl)
            .map((i) => ({
              originUrl: i.imageUrl!,
              source,
              attribution: "owner",
              isOrderable: true,
              width: 800,
              height: 600,
              geminiLabel: i.name,
              menuItemId: nameToId.get(i.name),
            }))
        );
      }
      return items;
    }

    // DoorDash + Grubhub — Python/Camoufox, crawler-exclusive (see DECISIONS.md
    // for why each is banned/broken on the live Scrapfly path).
    await crawlAndPersist("doordash", () => crawlDoorDash(target));
    await crawlAndPersist("grubhub", () => crawlGrubhub(target));

    await persistPipelineResult({
      placeId: target.placeId,
      restaurantName: target.name,
      lat: target.lat,
      lng: target.lng,
      address: target.address ?? "",
      photos,
      menuItems,
    });

    console.log(`✓ ${target.name} done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  const args = parseArgs(process.argv.slice(2));
  const refreshStale = !!args["refresh-stale"];

  if (args["preload-doordash-sitemaps"]) {
    const { preloadAllStoreSitemaps } = await import("../src/crawler/doordashSitemap");
    console.log("Preloading DoorDash store sitemaps for every published region (local disk cache only — nothing written to the corpus)...\n");
    const results = await preloadAllStoreSitemaps((region, i, total, urlCount) => {
      const status = urlCount < 0 ? "FAILED" : `${urlCount.toLocaleString()} store URLs`;
      console.log(`[${i}/${total}] ${region}: ${status}`);
    });
    const totalUrls = results.reduce((sum, r) => sum + (r.urlCount > 0 ? r.urlCount : 0), 0);
    const failed = results.filter((r) => r.urlCount < 0);
    console.log(`\nDone. ${results.length - failed.length}/${results.length} regions cached, ${totalUrls.toLocaleString()} total store URLs.`);
    if (failed.length > 0) console.log(`Failed: ${failed.map((r) => r.region).join(", ")}`);
    return;
  }

  const pythonEnv = ensurePythonEnv();
  if (!pythonEnv.ready) {
    console.error(`\n⚠ ${pythonEnv.reason}`);
    console.error("Continuing without DoorDash coverage — every other source still runs.\n");
  }

  const targets = await loadTargets(args);
  console.log(`SeeFood crawler — ${targets.length} restaurant(s), ~1/min${refreshStale ? " (refresh-stale)" : ""}\n`);

  let done = 0;
  for (const target of targets) {
    try {
      await crawlOne(target, refreshStale);
    } catch (e) {
      console.error(`✗ ${target.name} failed:`, e);
    }
    done++;
    if (done < targets.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  console.log(`\nDone. ${done}/${targets.length} restaurants processed.`);
}

main();
