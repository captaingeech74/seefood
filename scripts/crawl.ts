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
import { getGooglePhotosAndReviews, parseDoorDashSearchSlugs, extractDoorDashItems } from "../src/lib/google";
import { parseNextDataMenuItems } from "../src/lib/google";
import { persistPipelineResult, saveMenuItems, savePhotos, logSourceRun, getCorpusSnapshot } from "../src/lib/db";
import { ensurePythonEnv, pythonFetch } from "../src/crawler/pythonFetch";
import { MenuItemData } from "../src/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

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

/** DoorDash via Python (the one target banned from the live Scrapfly path). */
async function crawlDoorDash(target: CrawlTarget): Promise<MenuItemData[]> {
  const searchUrl = `https://www.doordash.com/search/?q=${encodeURIComponent(target.name)}`;
  const searchResult = pythonFetch(searchUrl, { render: true, referer: "https://www.doordash.com/" });
  if (!searchResult.ok || !searchResult.html) {
    console.log(`  [doordash] search fetch failed: ${searchResult.error ?? searchResult.status}`);
    return [];
  }

  const slug = parseDoorDashSearchSlugs(searchResult.html, target.name);
  if (!slug) {
    console.log(`  [doordash] no store slug found for "${target.name}"`);
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

async function main() {
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
