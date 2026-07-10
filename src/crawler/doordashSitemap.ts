/**
 * DoorDash store discovery via their public sitemap (PRD DoorDash discovery,
 * Kyle's priority #1). Confirmed live July 2026:
 *   - `www.doordash.com/robots.txt` lists `Sitemap: https://www.doordash.com/
 *     sitemap-store-doordash-index.xml`, which 301-redirects to
 *     `cdn.doordash.com/sitemaps/sitemaps/sitemap-store-doordash-index.xml` —
 *     a per-state index (sitemap-doordash-{state}-stores.xml).
 *   - The cdn.doordash.com host carries NO Cloudflare wall — plain fetch()
 *     works from anywhere, no Camoufox/residential IP needed for discovery.
 *   - Individual store pages (www.doordash.com/store/...) ARE still
 *     Cloudflare-walled (403) — those still need the crawler's Camoufox fetch.
 *     Sitemap only solves discovery (finding the URL), not the page fetch.
 *
 * One state sitemap is ~100k URLs / ~18MB — cached to disk with a 24h TTL
 * (matching DoorDash's own `changefreq: daily`) so we don't re-download it
 * for every restaurant in a crawl run.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(__dirname, "..", "..", "crawler", ".cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function sitemapUrl(state: string): string {
  return `https://cdn.doordash.com/sitemaps/sitemaps/sitemap-doordash-${state}-stores.xml`;
}

function cachePath(state: string): string {
  return join(CACHE_DIR, `sitemap-${state}-stores.xml`);
}

const STORE_INDEX_URL = "https://cdn.doordash.com/sitemaps/sitemaps/sitemap-store-doordash-index.xml";

/** Fetches the live list of state/region codes DoorDash publishes a store sitemap for. */
export async function listStoreSitemapRegions(): Promise<string[]> {
  const res = await fetch(STORE_INDEX_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`DoorDash store sitemap index fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/sitemap-doordash-([a-z0-9_]+)-stores/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * Downloads every region's store sitemap to the local disk cache (does NOT
 * touch Supabase — Kyle's instruction: preload the local cache, persist to
 * the corpus only per-restaurant matches as they're actually crawled, never
 * bulk-write raw sitemap URLs to the database). Safe to re-run — each region
 * respects its own 24h cache TTL, so a re-run only re-downloads stale ones.
 */
export async function preloadAllStoreSitemaps(
  onProgress?: (region: string, index: number, total: number, urlCount: number) => void
): Promise<{ region: string; urlCount: number }[]> {
  const regions = await listStoreSitemapRegions();
  const results: { region: string; urlCount: number }[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    try {
      const urls = await loadStoreSitemap(region);
      results.push({ region, urlCount: urls.length });
      onProgress?.(region, i + 1, regions.length, urls.length);
    } catch (e) {
      onProgress?.(region, i + 1, regions.length, -1);
      console.error(`  [doordash sitemap] ${region} failed:`, e);
    }
  }
  return results;
}

/** Downloads (or reuses a fresh disk cache of) a state's store sitemap, returns real /store/ URLs only. */
export async function loadStoreSitemap(state: string): Promise<string[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = cachePath(state);

  let xml: string;
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs < CACHE_TTL_MS) {
    xml = readFileSync(path, "utf-8");
  } else {
    const res = await fetch(sitemapUrl(state), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`DoorDash sitemap fetch failed: HTTP ${res.status}`);
    xml = await res.text();
    writeFileSync(path, xml);
  }

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // Exclude /convenience/store/ (retail, not restaurants) and anything not
  // matching the plain /store/ pattern.
  return urls.filter((u) => /\/store\/[^/]+\/?$/.test(u) && !u.includes("/convenience/"));
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Find the best-matching store URL for a restaurant by name + city. Filters
 * to URLs containing the city (if given) before scoring by word overlap —
 * DoorDash lists thousands of same-named chains (e.g. "Starbucks") per state,
 * so city disambiguation matters much more here than in-page slug matching.
 */
export function findDoorDashStoreUrlInSitemap(
  urls: string[],
  restaurantName: string,
  city?: string
): string | null {
  const nameWords = normalizeWords(restaurantName);
  if (nameWords.length === 0) return null;

  const cityLower = city?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidates = cityLower ? urls.filter((u) => u.toLowerCase().includes(cityLower)) : urls;
  if (candidates.length === 0) return null;

  let best: { url: string; score: number; extraWords: number } | null = null;
  for (const url of candidates) {
    const slug = decodeURIComponent(url.split("/store/")[1] ?? "");
    const slugWords = normalizeWords(slug);
    const overlap = nameWords.filter((w) => slugWords.includes(w)).length;
    if (overlap === 0) continue;
    // Same-named restaurant often has extra listings (catering, ghost
    // kitchens, multiple locations sharing a name) with unrelated bonus
    // words in the slug — e.g. "bj's-restaurant-&-brewhouse-CATERING-
    // temecula". Prefer the tightest match: fewer slug words the
    // restaurant's own name didn't ask for.
    const extraWords = slugWords.filter((w) => !nameWords.includes(w) && w !== city?.toLowerCase()).length;
    const better =
      !best || overlap > best.score || (overlap === best.score && extraWords < best.extraWords);
    if (better) best = { url, score: overlap, extraWords };
  }

  // Require at least half the restaurant name's significant words to match —
  // otherwise a single common word ("grill", "cafe") could pair with the
  // wrong restaurant entirely.
  if (best && best.score >= Math.max(1, Math.ceil(nameWords.length / 2))) {
    return best.url;
  }
  return null;
}
