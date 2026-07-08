#!/usr/bin/env -S npx tsx
/**
 * Tier 1 local corpus crawler (PRD §5.2). Run on the founder's Mac — the
 * residential IP is the whole point; it beats blocks that stop cloud scrapers.
 *
 * Usage:
 *   npm run crawl -- --place ChIJ... --name "Richie's Diner" --lat 33.48 --lng -117.09
 *   npm run crawl -- --zone temecula
 *   npm run crawl -- --zone temecula --refresh-stale
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
  const { getGooglePhotosAndReviews, parseDoorDashSearchSlugs, extractDoorDashItems, parseNextDataMenuItems } =
    await import("../src/lib/google");
  const { persistPipelineResult, saveMenuItems, savePhotos, logSourceRun, getCorpusSnapshot } =
    await import("../src/lib/db");
  const { ensurePythonEnv, pythonFetch } = await import("../src/crawler/pythonFetch");
  type MenuItemData = import("../src/lib/types").MenuItemData;

  async function crawlDoorDash(target: CrawlTarget): Promise<MenuItemData[]> {
    // DoorDash's search URL has changed at least once (confirmed 404 on the
    // pattern that used to work). Try a few candidate patterns in sequence —
    // cheap here since the crawler runs $0 on a residential IP, unlike the
    // live Scrapfly path where every attempt costs real credits.
    const q = encodeURIComponent(target.name);
    const candidateSearchUrls = [
      `https://www.doordash.com/search/?q=${q}`,
      `https://www.doordash.com/search/store/${q}/`,
      `https://www.doordash.com/food-delivery/search/?query=${q}`,
      `https://www.doordash.com/search/?query=${q}`,
    ];

    let slug: string | null = null;
    for (const searchUrl of candidateSearchUrls) {
      const searchResult = pythonFetch(searchUrl, { render: true, referer: "https://www.doordash.com/" });
      console.log(
        `  [doordash] search ${searchUrl} → status=${searchResult.status} ok=${searchResult.ok}` +
        (searchResult.finalUrl ? ` finalUrl=${searchResult.finalUrl}` : "") +
        (!searchResult.ok ? ` error=${searchResult.error ?? "n/a"}` : "")
      );
      if (searchResult.ok && searchResult.html) {
        slug = parseDoorDashSearchSlugs(searchResult.html, target.name);
        if (slug) {
          console.log(`  [doordash] found slug "${slug}" via ${searchUrl}`);
          break;
        }
        // Got a real page but no recognizable store slug in it — dump a
        // snippet so we can see what DoorDash actually served.
        console.log(`  [doordash] no slug pattern matched; body snippet: ${searchResult.html.slice(0, 300).replace(/\s+/g, " ")}`);
      }
    }

    if (!slug) {
      console.log(`  [doordash] no store slug found for "${target.name}" across ${candidateSearchUrls.length} URL patterns`);
      return [];
    }

    const storeUrl = `https://www.doordash.com/store/${slug}/`;
    const storeResult = pythonFetch(storeUrl, { render: true, referer: "https://www.doordash.com/" });
    if (!storeResult.ok || !storeResult.html) {
      console.log(`  [doordash] store page fetch failed: ${storeResult.error ?? storeResult.status}`);
      return [];
    }

    const items = parseNextDataMenuItems(storeResult.html, extractDoorDashItems);
    console.log(`  [doordash] ${items.length} items from ${storeUrl}`);
    return items.map((i) => ({ ...i, source: "doordash" as const }));
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

    // DoorDash — Python-only, crawler-exclusive.
    const doorDashStart = Date.now();
    const doorDashItems = await crawlDoorDash(target);
    await logSourceRun({
      placeId: target.placeId,
      source: "doordash",
      ok: doorDashItems.length > 0,
      itemCount: doorDashItems.length,
      photoCount: doorDashItems.filter((i) => i.imageUrl).length,
      latencyMs: Date.now() - doorDashStart,
    }).catch(() => {});

    await persistPipelineResult({
      placeId: target.placeId,
      restaurantName: target.name,
      lat: target.lat,
      lng: target.lng,
      address: target.address ?? "",
      photos,
      menuItems,
    });

    if (doorDashItems.length > 0) {
      const nameToId = await saveMenuItems(target.placeId, doorDashItems);
      await savePhotos(
        target.placeId,
        doorDashItems
          .filter((i) => i.imageUrl)
          .map((i) => ({
            originUrl: i.imageUrl!,
            source: "doordash",
            attribution: "owner",
            isOrderable: true,
            width: 800,
            height: 600,
            geminiLabel: i.name,
            menuItemId: nameToId.get(i.name),
          }))
      );
    }

    console.log(`✓ ${target.name} done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  const args = parseArgs(process.argv.slice(2));
  const refreshStale = !!args["refresh-stale"];

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
