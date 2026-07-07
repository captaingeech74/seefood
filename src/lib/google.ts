import { Restaurant, DishPhoto, MenuItemData } from "./types";
import { extractPopularDishes } from "./reviewParser";
import { fetchMenuFromUrl } from "./menuSources";

const API_KEY   = process.env.GOOGLE_MAPS_API_KEY!.trim();
const VISION_KEY = (process.env.VISION_API_KEY || API_KEY).trim();

// ── Shared interfaces ─────────────────────────────────────────────────────────

interface GooglePhoto {
  photo_reference: string;
  width: number;
  height: number;
  html_attributions: string[];
}

interface GoogleReview {
  text: string;
  rating: number;
  author_name: string;
}

interface GooglePlace {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: { location: { lat: number; lng: number } };
  photos?: GooglePhoto[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: { open_now?: boolean };
}

// Source "places_v1" (Places API New `menuItems` field) was removed July 2026 —
// the field does not exist on Google's API (confirmed: 400 "cannot find matching
// fields for path 'menuItems'"). Do not re-add without Google actually shipping it.

// ── Anti-bot fetch helper ─────────────────────────────────────────────────────
// Routes through Scrapfly (SCRAPFLY_KEY env var) when set.
// Scrapfly with asp=true uses residential IP rotation + fingerprint spoofing —
// the industry-leading approach for bypassing DoorDash, Grubhub, and similar
// platforms that block datacenter IPs at the ASN level.
//
// Free tier: 1,000 API calls/month at scrapfly.io — sufficient for ~500 unique
// restaurant lookups/month given 24h response caching (2 calls per lookup).
//
// Falls back to a direct browser-fingerprinted fetch when no key is set.
// Direct works for lightly-protected sites (Grubhub); fails for DoorDash.

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "upgrade-insecure-requests": "1",
};

async function fetchWithAntiBot(
  url: string,
  referer: string,
  timeoutMs = 12000
): Promise<string | null> {
  const scrapflyKey = process.env.SCRAPFLY_KEY;

  if (scrapflyKey) {
    // Scrapfly asp=true: Anti Scraping Protection — residential IPs + challenge solving.
    // render_js=false: DoorDash and Grubhub are Next.js SSR; __NEXT_DATA__ is in HTML.
    // cost_budget=100: DoorDash's ASP challenge alone costs 51–75+ credits (observed
    // via ERR::SCRAPE::COST_BUDGET_LIMIT, rising across repeated probes — a hard,
    // expensive target). At that rate, DoorDash consumes the entire 1,000-credit free
    // tier in ~10-13 lookups/month; Grubhub is far cheaper and unaffected by this cap.
    // See DECISIONS.md "Phase 0 fixes" for the cost finding — flagged for Kyle, not
    // a blank check to keep raising this further.
    const apiUrl =
      `https://api.scrapfly.io/scrape` +
      `?key=${scrapflyKey}` +
      `&url=${encodeURIComponent(url)}` +
      `&asp=true&render_js=false&country=us&cost_budget=100`;
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(timeoutMs + 5000) });
      if (!res.ok) {
        console.error(`[Scrapfly] HTTP ${res.status} for ${url}`);
        return null;
      }
      const data = await res.json();
      if (data.result?.status_code === 200 && data.result?.content) {
        console.log(`[Scrapfly] ✓ ${url}`);
        return data.result.content as string;
      }
      console.error(`[Scrapfly] upstream status ${data.result?.status_code} for ${url}`);
      return null;
    } catch (e) {
      console.error("[Scrapfly] exception:", e);
      return null;
    }
  }

  // Direct fallback with full browser fingerprint (blocked by DoorDash, may work for Grubhub)
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...BROWSER_HEADERS, Referer: referer },
    });
    if (!res.ok) {
      console.log(`[fetchWithAntiBot] ${res.status} for ${url} (no Scrapfly key)`);
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

// ── Shared __NEXT_DATA__ slug/URL helpers ─────────────────────────────────────

/** Score URLs by how many words from the restaurant name appear in the URL. */
function scoreByNameMatch(candidates: string[], restaurantName: string): string | null {
  if (!candidates.length) return null;
  const parts = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 2);
  return candidates.sort((a, b) => {
    const score = (s: string) => parts.filter((p) => s.toLowerCase().includes(p)).length;
    return score(b) - score(a);
  })[0];
}

/** Deduplicate MenuItemData[] by lowercase name. */
function deduplicateItems(items: MenuItemData[]): MenuItemData[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key) || item.name.length < 2) return false;
    seen.add(key);
    return true;
  });
}

// ── Source 4: DoorDash ────────────────────────────────────────────────────────
// Pre-labeled photos bypass Gemini (score 200, always shown first).
// Three parallel strategies — whichever yields data wins:
//   A. Direct scrape via fetchWithAntiBot (works when SCRAPFLY_KEY is set)
//   B. Google Custom Search (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID)

export async function fetchMenuFromDoorDash(
  restaurantName: string,
  address: string,
  lat?: number,
  lng?: number
): Promise<MenuItemData[]> {
  void lat; void lng;
  const [directResult, searchResult] = await Promise.allSettled([
    fetchDoorDashDirect(restaurantName),
    fetchDoorDashViaGoogleSearch(restaurantName, address),
  ]);

  return deduplicateItems([
    ...(directResult.status === "fulfilled" ? directResult.value : []),
    ...(searchResult.status === "fulfilled" ? searchResult.value : []),
  ]);
}

async function fetchDoorDashDirect(restaurantName: string): Promise<MenuItemData[]> {
  try {
    const q = encodeURIComponent(restaurantName);
    const html = await fetchWithAntiBot(
      `https://www.doordash.com/search/?q=${q}`,
      "https://www.doordash.com/"
    );
    if (!html) return [];

    const slugs = [...new Set(
      [...html.matchAll(/["'](\/store\/([a-z0-9][a-z0-9-]{3,70})\/)/gi)].map((m) => m[2])
    )].filter((s) => !["pickup", "search", "home", "dasher"].some((x) => s.startsWith(x)));

    const bestSlug = scoreByNameMatch(slugs, restaurantName);
    if (!bestSlug) {
      console.log(`[DoorDash] no slugs found for "${restaurantName}"`);
      return [];
    }
    console.log(`[DoorDash] "${restaurantName}" → slug: ${bestSlug} (${slugs.length} candidates)`);
    return fetchDeliveryStorePage(
      `https://www.doordash.com/store/${bestSlug}/`,
      "https://www.doordash.com/",
      extractDoorDashItems
    );
  } catch (e) {
    console.error("[DoorDash direct] failed:", e);
    return [];
  }
}

async function fetchDoorDashViaGoogleSearch(
  restaurantName: string,
  address: string
): Promise<MenuItemData[]> {
  const searchKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchCx  = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!searchKey || !searchCx) return [];
  try {
    const query = `"${restaurantName}" ${address} site:doordash.com`;
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${searchKey}&cx=${searchCx}&num=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const url: string | undefined = data.items?.[0]?.link;
    if (!url || !url.includes("doordash.com/store/")) return [];
    return fetchDeliveryStorePage(url, "https://www.doordash.com/", extractDoorDashItems);
  } catch {
    return [];
  }
}

// ── Source 5: Grubhub ─────────────────────────────────────────────────────────
// Free, no API keys — Grubhub has less aggressive bot protection than DoorDash.
// Same pre-labeled pattern: menu items with photos bypass Gemini entirely.
// With SCRAPFLY_KEY set this becomes very reliable; without it, best-effort.

export async function fetchMenuFromGrubhub(
  restaurantName: string,
  lat: number,
  lng: number
): Promise<MenuItemData[]> {
  try {
    const q = encodeURIComponent(restaurantName);
    const html = await fetchWithAntiBot(
      `https://www.grubhub.com/search?queryText=${q}&latitude=${lat}&longitude=${lng}&orderMethod=delivery`,
      "https://www.grubhub.com/"
    );
    if (!html) return [];

    // Grubhub restaurant URLs: /restaurant/{slug}/{id}
    const urls = [...new Set(
      [...html.matchAll(/["'](\/restaurant\/([^"'?#]+)\/(\d{5,})\/?)["']/gi)]
        .map((m) => `https://www.grubhub.com/restaurant/${m[2]}/${m[3]}/`)
    )];

    const bestUrl = scoreByNameMatch(urls, restaurantName);
    if (!bestUrl) {
      console.log(`[Grubhub] no results for "${restaurantName}"`);
      return [];
    }
    console.log(`[Grubhub] "${restaurantName}" → ${bestUrl}`);
    return fetchDeliveryStorePage(bestUrl, "https://www.grubhub.com/", extractGrubhubItems);
  } catch (e) {
    console.error("[Grubhub] failed:", e);
    return [];
  }
}

// ── Shared store page fetcher ─────────────────────────────────────────────────

/**
 * Fetch a delivery platform store page and extract menu items from __NEXT_DATA__.
 * Shared by DoorDash and Grubhub; takes a platform-specific item extractor.
 */
async function fetchDeliveryStorePage(
  url: string,
  referer: string,
  extractor: (obj: unknown, out: MenuItemData[]) => void
): Promise<MenuItemData[]> {
  try {
    const html = await fetchWithAntiBot(url, referer, 15000);
    if (!html) return [];

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      console.log(`[store page] no __NEXT_DATA__ found at ${url}`);
      return [];
    }

    const items: MenuItemData[] = [];
    try { extractor(JSON.parse(match[1]), items); } catch { return []; }

    const deduped = deduplicateItems(items);
    console.log(`[store page] ${url}: ${deduped.length} menu items`);
    return deduped;
  } catch (e) {
    console.error(`[store page] failed for ${url}:`, e);
    return [];
  }
}

/** Recursively walks DoorDash __NEXT_DATA__ looking for menu item objects. */
function extractDoorDashItems(obj: unknown, out: MenuItemData[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { obj.forEach((v) => extractDoorDashItems(v, out)); return; }

  const o = obj as Record<string, unknown>;

  // DoorDash items have name + (description or imageUrl or price)
  if (
    typeof o.name === "string" &&
    o.name.trim().length > 1 &&
    (typeof o.description === "string" || typeof o.imageUrl === "string")
  ) {
    const item: MenuItemData = { name: o.name.trim() };
    if (typeof o.description === "string" && o.description.trim()) {
      item.description = o.description.trim().substring(0, 300);
    }
    if (typeof o.imageUrl === "string" && o.imageUrl.startsWith("http")) {
      item.imageUrl = o.imageUrl;
    }
    out.push(item);
  }

  for (const val of Object.values(o)) {
    if (val && typeof val === "object") extractDoorDashItems(val, out);
  }
}

/**
 * Recursively walks Grubhub __NEXT_DATA__ for menu item objects.
 * Grubhub items typically have: name, description, photo (URL), price.
 */
function extractGrubhubItems(obj: unknown, out: MenuItemData[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { obj.forEach((v) => extractGrubhubItems(v, out)); return; }

  const o = obj as Record<string, unknown>;

  // Grubhub items: name + at least one of description / photo / price
  if (
    typeof o.name === "string" &&
    o.name.trim().length > 1 &&
    (
      typeof o.description === "string" ||
      typeof o.photo === "string" ||
      typeof o.photoUrl === "string" ||
      typeof o.imageUrl === "string" ||
      typeof o.price === "number"
    )
  ) {
    const item: MenuItemData = { name: o.name.trim() };
    const desc = (o.description as string | undefined)?.trim();
    if (desc) item.description = desc.substring(0, 300);
    const img = o.photo ?? o.photoUrl ?? o.imageUrl;
    if (typeof img === "string" && img.startsWith("http")) item.imageUrl = img;
    out.push(item);
  }

  for (const val of Object.values(o)) {
    if (val && typeof val === "object") extractGrubhubItems(val, out);
  }
}

// ── Image fetch helper ────────────────────────────────────────────────────────

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    return { data: Buffer.from(buffer).toString("base64"), mimeType };
  } catch {
    return null;
  }
}

// ── Gemini vision analysis ────────────────────────────────────────────────────

interface GeminiResult {
  dishName: string | null;
  dishDescription: string | null;
  isMenuMatch: boolean;
  isFood: boolean;
}

// A name is unusable if it looks cut off mid-thought — trailing conjunctions,
// dangling punctuation, or a stray closing fragment. Cheaper and more reliable
// than asking Gemini to self-police length.
const TRUNCATION_ENDINGS = /(,|and|with|or|the|a|an|in|on|of|&)$/i;
function isTruncatedOrInvalid(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed.length > 60) return true; // ~4 words of menu-style naming, generous ceiling
  const words = trimmed.split(/\s+/);
  if (TRUNCATION_ENDINGS.test(words[words.length - 1])) return true;
  return false;
}

/**
 * One batched Gemini call for ALL candidate photos of a restaurant (PRD §5.4).
 * Cheaper and more consistent than one call per photo, and lets the model reason
 * about the whole set at once (e.g. "these two are the same dish").
 */
async function analyzePhotosWithGeminiBatch(
  analysisUrls: string[],
  menuItems: MenuItemData[],
  popularDishes: string[],
  restaurantName: string
): Promise<GeminiResult[]> {
  const fallback: GeminiResult = {
    dishName: null,
    dishDescription: null,
    isMenuMatch: false,
    isFood: true,
  };
  if (analysisUrls.length === 0) return [];

  const images = await Promise.all(analysisUrls.map(fetchImageAsBase64));
  const validIndices = images
    .map((img, i) => (img ? i : -1))
    .filter((i) => i >= 0);
  if (validIndices.length === 0) return analysisUrls.map(() => fallback);

  const hasMenu = menuItems.length > 0;
  const referenceNames: string[] = hasMenu
    ? menuItems.slice(0, 60).map((i) => i.name)
    : popularDishes.slice(0, 20);

  const promptIntro = `You are identifying dishes in ${validIndices.length} food photos from "${restaurantName}", numbered in the order they appear below (Photo 1, Photo 2, ...).

${
  referenceNames.length > 0
    ? `${hasMenu ? "Their menu includes:" : "Dishes commonly ordered here:"}\n${referenceNames
        .map((name, i) => `${i + 1}. ${name}`)
        .join("\n")}\n\n`
    : ""
}For EACH photo, first decide: is this something a customer would actually order and be excited to eat — a plated dish, a drink made for them, a dessert? NOT a fridge of assorted bottled/canned drinks, a storefront, an interior/decor shot, a menu board, or a group of unrelated items. Set isOrderable to false for all of those, even if food is technically visible.

If isOrderable is true for a photo:
- "name": a SHORT, menu-style name of 4 words or fewer, exactly like it would appear on a printed menu (e.g. "Brisket Plate", "Loaded Nachos", "Iced Vanilla Latte"). If it matches an item in the list above, use that item's exact name if it's short enough; otherwise write your own short name. Never include ingredient lists or cooking instructions in "name".
- "description": a longer sentence with ingredients, preparation, and how it's served. This is where detail belongs, not in "name".

If isOrderable is false, set "name" and "description" to null.

Respond with ONLY a JSON array with exactly ${validIndices.length} entries, one per photo in order, no markdown fences, no explanation:
[{"isFood": boolean, "isOrderable": boolean, "name": string|null, "description": string|null}, ...]`;

  const parts: unknown[] = [{ text: promptIntro }];
  validIndices.forEach((idx, n) => {
    const img = images[idx]!;
    parts.push({ text: `Photo ${n + 1}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    // Thinking tokens count against maxOutputTokens; scale the ceiling with photo
    // count so a full batch doesn't get truncated mid-array.
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024 + validIndices.length * 300,
      responseMimeType: "application/json",
    },
  });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        // v1beta required: responseMimeType (structured JSON output) is not
        // recognized on the v1 endpoint ("Cannot find field" 400) — confirmed
        // live July 2026. This silently zeroed out every Gemini-only restaurant
        // (no pre-labeled source) since the JSON prompt was introduced.
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(45000),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[Gemini batch] ${model} HTTP ${res.status}:`, errText.slice(0, 300));
        if (res.status === 403) break;
        continue;
      }

      const json = await res.json();
      const rawText: string =
        json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      let parsed: Array<{
        isFood?: boolean;
        isOrderable?: boolean;
        name?: string | null;
        description?: string | null;
      }>;
      try {
        parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed)) throw new Error("not an array");
      } catch {
        console.error(`[Gemini batch] ${model} returned invalid JSON:`, rawText.slice(0, 300));
        continue;
      }

      // Map back from "valid photo" positions to the original analysisUrls indices.
      const out: GeminiResult[] = analysisUrls.map(() => fallback);
      validIndices.forEach((originalIdx, n) => {
        const entry = parsed[n];
        out[originalIdx] = resolveGeminiEntry(entry, menuItems, popularDishes, hasMenu);
      });
      return out;
    } catch (e) {
      console.error(`[Gemini batch] ${model} request failed:`, e);
    }
  }
  return analysisUrls.map(() => fallback);
}

function resolveGeminiEntry(
  entry: { isFood?: boolean; isOrderable?: boolean; name?: string | null; description?: string | null } | undefined,
  menuItems: MenuItemData[],
  popularDishes: string[],
  hasMenu: boolean
): GeminiResult {
  const fallback: GeminiResult = { dishName: null, dishDescription: null, isMenuMatch: false, isFood: true };
  if (!entry) return fallback;
  if (!entry.isFood || !entry.isOrderable || !entry.name) {
    return { dishName: null, dishDescription: null, isMenuMatch: false, isFood: !!entry.isFood };
  }

  const name = entry.name.trim();
  if (isTruncatedOrInvalid(name)) {
    return { dishName: null, dishDescription: null, isMenuMatch: false, isFood: true };
  }

  // Match against menu reference list — exact first, then one-way fuzzy.
  // IMPORTANT: only match when the menu item *contains* Gemini's response,
  // not the reverse. This prevents generic terms ("Brisket") from swallowing
  // specific dish descriptions ("Smoked Brisket with Eggs and Hash Browns").
  const lowerText = name.toLowerCase();
  const matchedItem = hasMenu
    ? menuItems.slice(0, 60).find((item) => {
        const itemL = item.name.toLowerCase().trim();
        return itemL === lowerText || itemL.includes(lowerText);
      })
    : undefined;

  const matchedPopular =
    !hasMenu && !matchedItem
      ? popularDishes.find((p) => {
          const pl = p.toLowerCase().trim();
          return pl === lowerText || pl.includes(lowerText);
        })
      : undefined;

  return {
    dishName: matchedItem?.name ?? matchedPopular ?? name,
    dishDescription: matchedItem?.description ?? entry.description ?? null,
    isMenuMatch: !!(matchedItem || matchedPopular),
    isFood: true,
  };
}

// ── Pre-labeled name cleanup ──────────────────────────────────────────────────
// Pre-labeled sources (Menufy, DoorDash, website schema.org) provide their own
// verbatim menu text, which is often longer than the ≤4-word menu-style overlay
// name the Reveal/Grid want. Trim serving-size qualifiers and cap word count for
// display, but keep the original full text as/with the description.

function toMenuStyleName(rawName: string): { shortName: string; fullName: string } {
  const fullName = rawName.trim();
  // Strip trailing serving-size qualifiers: "(5people)", "(Serves 4)", etc.
  const stripped = fullName.replace(/\s*\(\s*(serves?\s*)?\d+\s*(people|ppl|pax)?\s*\)\s*$/i, "").trim();
  const words = stripped.split(/\s+/);
  const shortName = words.length > 4 ? words.slice(0, 4).join(" ") : stripped;
  return { shortName: shortName || fullName, fullName };
}

function mergeDescription(shortName: string, fullName: string, description?: string): string | null {
  const nameWasTruncated = shortName !== fullName;
  if (description) return nameWasTruncated ? `${fullName} — ${description}` : description;
  return nameWasTruncated ? fullName : null;
}

// ── Priority scoring ──────────────────────────────────────────────────────────
// Pre-labeled photos (DoorDash, website schema.org) bypass Gemini and score 200.
// Gemini-analyzed photos use this function.

function computePriorityScore(
  dishName: string | null,
  isMenuMatch: boolean,
  popularDishes: string[]
): number {
  if (!dishName) return 5;
  const lower = dishName.toLowerCase();
  const popIndex = popularDishes.findIndex((p) => {
    const pl = p.toLowerCase();
    return pl === lower || lower.includes(pl) || pl.includes(lower);
  });
  const isPopular = popIndex >= 0;

  if (isMenuMatch && isPopular) return 100 + Math.max(0, 8 - popIndex);
  if (isMenuMatch)              return 50;
  if (isPopular)                return 30 + Math.max(0, 8 - popIndex);
  return 10;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deduplicateMenuItems(items: MenuItemData[]): MenuItemData[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeToRestaurant(place: GooglePlace): Restaurant {
  return {
    id: place.place_id,
    name: place.name,
    address: place.vicinity,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    placeId: place.place_id,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    priceLevel: place.price_level,
    isOpen: place.opening_hours?.open_now,
  };
}

// ── Public place lookup helpers ───────────────────────────────────────────────

export async function findNearbyRestaurant(
  lat: number,
  lng: number
): Promise<Restaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=restaurant&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results?.length) return null;
  return placeToRestaurant(data.results[0] as GooglePlace);
}

export async function getRestaurantDetails(
  placeId: string
): Promise<Restaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,photos,place_id,rating,user_ratings_total,price_level,opening_hours&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.result) return null;
  const p = data.result;
  return {
    id: p.place_id,
    name: p.name,
    address: p.formatted_address,
    lat: p.geometry.location.lat,
    lng: p.geometry.location.lng,
    placeId: p.place_id,
    rating: p.rating,
    reviewCount: p.user_ratings_total,
    priceLevel: p.price_level,
    isOpen: p.opening_hours?.open_now,
  };
}

// ── Main photo + review pipeline ──────────────────────────────────────────────
// Live sources (PRD §5.3): Google photos+reviews, restaurant website (schema.org +
// Menufy 2-hop), Grubhub. DoorDash is corpus-only (Tier 1 crawler) — its anti-bot
// challenge costs 51–75+ Scrapfly credits/lookup, so it never runs in this path.

export async function getGooglePhotosAndReviews(
  placeId: string,
  restaurantName = ""
): Promise<{
  photos: DishPhoto[];
  popularDishes: string[];
  menuItems: MenuItemData[];
}> {
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,reviews,geometry,website,formatted_address&key=${API_KEY}`;
  const detailsRes = await fetch(detailsUrl);
  const data = await detailsRes.json();
  if (!data.result) return { photos: [], popularDishes: [], menuItems: [] };

  const { photos = [], reviews = [] } = data.result;
  const lat: number | undefined = data.result.geometry?.location?.lat;
  const lng: number | undefined = data.result.geometry?.location?.lng;
  const websiteUrl: string | undefined = data.result.website;

  // ── Phase 1: Website (+ Menufy 2-hop) + Grubhub in parallel ─────────────────
  const [websiteMenuItems, grubhubItems] = await Promise.all([
    websiteUrl ? fetchMenuFromUrl(websiteUrl) : Promise.resolve([]),
    lat && lng ? fetchMenuFromGrubhub(restaurantName, lat, lng) : Promise.resolve([]),
  ]);

  console.log(
    `[pipeline] "${restaurantName}" — website:${websiteMenuItems.length} grubhub:${grubhubItems.length}`
  );

  // Merge all menu sources, deduplicate — this is the reference list Gemini works from
  const allMenuItems = deduplicateMenuItems([...websiteMenuItems, ...grubhubItems]);
  const popularDishes = extractPopularDishes(reviews as GoogleReview[]);

  // ── Phase 2: Pre-labeled photos (bypass Gemini) ──────────────────────────────
  // These come with dish name + description + photo already paired.
  // Source: schema.org MenuItem.image, Grubhub/Menufy menu item photos.
  const preLabeledPhotos: DishPhoto[] = [];

  for (const item of websiteMenuItems) {
    if (!item.imageUrl) continue;
    const { shortName, fullName } = toMenuStyleName(item.name);
    preLabeledPhotos.push({
      id: `website-${item.imageUrl.slice(-24)}`,
      url: item.imageUrl,
      dishName: shortName,
      dishDescription: mergeDescription(shortName, fullName, item.description),
      isMenuMatch: true,
      source: item.source ?? "schema_org",
      attribution: "owner",
      width: 800,
      height: 600,
    });
  }

  for (const item of grubhubItems) {
    if (!item.imageUrl) continue;
    const { shortName, fullName } = toMenuStyleName(item.name);
    preLabeledPhotos.push({
      id: `grubhub-${item.imageUrl.slice(-24)}`,
      url: item.imageUrl,
      dishName: shortName,
      dishDescription: mergeDescription(shortName, fullName, item.description),
      isMenuMatch: true,
      source: "grubhub",
      attribution: "owner",
      width: 800,
      height: 600,
    });
  }

  // ── Phase 3: Build Gemini candidate pool (Google photos) ─────────────────────
  const allGooglePhotos = photos as GooglePhoto[];
  const nonPortrait = allGooglePhotos.filter((p) => p.height <= p.width);
  const portrait    = allGooglePhotos.filter((p) => p.height >  p.width);
  const googleCandidates = [...nonPortrait, ...portrait].slice(0, 10);

  const googleAnalysisUrls = googleCandidates.map(
    (p) => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );
  const googleDisplayUrls = googleCandidates.map(
    (p) => `/api/photo?ref=${encodeURIComponent(p.photo_reference)}&maxwidth=800`
  );

  // ── Phase 4: One batched Gemini call for every Google photo ──────────────────
  const geminiResults = await analyzePhotosWithGeminiBatch(
    googleAnalysisUrls,
    allMenuItems,
    popularDishes,
    restaurantName
  );

  // ── Phase 5: Score, filter, sort ─────────────────────────────────────────────
  const geminiPhotos: { photo: DishPhoto; score: number }[] = [];

  googleCandidates.forEach((photo, i) => {
    const result = geminiResults[i] ?? { dishName: null, dishDescription: null, isMenuMatch: false, isFood: true };
    if (!result.isFood) return; // drop non-food
    const attrText = photo.html_attributions.join(" ").toLowerCase();
    const isOwner =
      attrText.includes("owner") ||
      attrText.includes("the official") ||
      (!attrText.includes("maps.google.com/maps/contrib") && attrText.length > 0);
    const score = computePriorityScore(result.dishName, result.isMenuMatch, popularDishes);
    geminiPhotos.push({
      photo: {
        id: `google-${placeId}-${i}`,
        url: googleDisplayUrls[i],
        dishName: result.dishName,
        dishDescription: result.dishDescription,
        isMenuMatch: result.isMenuMatch,
        source: "google",
        attribution: isOwner ? "owner" : "user",
        width: photo.width,
        height: photo.height,
      },
      score,
    });
  });

  // Stable sort Gemini photos by score descending
  geminiPhotos.sort((a, b) => b.score - a.score);

  // Pre-labeled photos scored at 200 (always shown first)
  const scoredPreLabeled = preLabeledPhotos.map((photo) => ({ photo, score: 200 }));

  // Combine: pre-labeled first, then Gemini-analyzed
  const all = [...scoredPreLabeled, ...geminiPhotos];
  return {
    photos: all.map((e) => e.photo),
    popularDishes,
    menuItems: allMenuItems,
  };
}
