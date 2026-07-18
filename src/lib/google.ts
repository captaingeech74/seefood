import { Restaurant, DishPhoto, MenuItemData, DataSource } from "./types";
import { extractPopularDishes } from "./reviewParser";
import { fetchMenuFromUrl } from "./menuSources";
import { defaultPhotoQuality, heroScore, withPhotoSignals } from "./photoSignals";

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

// ── Source 4: DoorDash + Grubhub ──────────────────────────────────────────────
// Both are corpus-only (Tier 1 crawler, Python/Camoufox) — see DECISIONS.md.
// DoorDash: Scrapfly's ASP challenge costs 51-75+ credits/attempt. Grubhub:
// Scrapfly's render_js wait never finishes hydrating the search page's SPA
// (confirmed 0% success rate). Discovery + fetching for both live entirely in
// scripts/crawl.ts; this file only keeps the parsers so there is exactly one
// parser per source, shared between the crawler and (for DoorDash) corpus reads.
// Google Custom Search JSON API is permanently closed to new customers
// (confirmed July 2026, hard 403 even with a clean project + enabled API), so
// DoorDash discovery is sitemap-first with a Camoufox-driven interactive
// search fallback — see src/crawler/doordashSitemap.ts.

/** Pure parse of a Grubhub search-results page. */
export function parseGrubhubSearchUrl(html: string, restaurantName: string): string | null {
  const urls = [...new Set(
    [...html.matchAll(/["'](\/restaurant\/([^"'?#]+)\/(\d{5,})\/?)["']/gi)]
      .map((m) => `https://www.grubhub.com/restaurant/${m[2]}/${m[3]}/`)
  )];
  return scoreByNameMatch(urls, restaurantName);
}

// ── Shared store page fetcher ─────────────────────────────────────────────────

/**
 * Pure parse of a delivery platform store page's __NEXT_DATA__ blob. Exported
 * so the Tier 1 crawler (which fetches this HTML itself via Python/Camoufox)
 * reuses the exact same parser as any other consumer.
 */
export function parseNextDataMenuItems(
  html: string,
  extractor: (obj: unknown, out: MenuItemData[]) => void
): MenuItemData[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  const items: MenuItemData[] = [];
  try {
    extractor(JSON.parse(match[1]), items);
  } catch {
    return [];
  }
  return deduplicateItems(items);
}

/** Finds the substring of `s` starting at `start` (must be "{") up to its matching close brace. */
function extractBalancedJsonObject(s: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Pure parse of a Next.js App Router RSC "flight" payload — DoorDash's store
 * pages moved off the old Pages Router __NEXT_DATA__ blob to this streaming
 * format (confirmed live July 2026: 0 __NEXT_DATA__ matches, but real menu
 * data present as `{"__typename":"MenuPageItem",...}` objects inside
 * `self.__next_f.push([1,"..."])` script calls — see DECISIONS.md). Each
 * pushed chunk is a JSON-escaped string; unescaping via JSON.parse of the
 * quoted string (not the whole payload, which isn't valid JSON as a whole —
 * it's DoorDash's internal wire framing) recovers the readable text, from
 * which individual `{"__typename":"MenuPageItem...` objects are extracted by
 * brace-balance matching and parsed individually.
 */
export function parseNextFlightMenuItems(
  html: string,
  extractor: (obj: unknown, out: MenuItemData[]) => void
): MenuItemData[] {
  const chunkRe = /self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g;
  let combined = "";
  for (const m of html.matchAll(chunkRe)) {
    try {
      combined += JSON.parse(`"${m[1]}"`);
    } catch {
      // one malformed chunk shouldn't sink the rest
    }
  }

  const items: MenuItemData[] = [];
  const startRe = /\{"__typename":"MenuPageItemList/g;
  for (const m of combined.matchAll(startRe)) {
    const objText = extractBalancedJsonObject(combined, m.index!);
    if (!objText) continue;
    try {
      extractor(JSON.parse(objText), items);
    } catch {
      // skip unparseable fragment
    }
  }
  return deduplicateItems(items);
}

/** Recursively walks DoorDash menu data (either __NEXT_DATA__ or RSC flight payload) looking for menu item objects. */
export function extractDoorDashItems(obj: unknown, out: MenuItemData[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { obj.forEach((v) => extractDoorDashItems(v, out)); return; }

  const o = obj as Record<string, unknown>;

  // RSC flight payload objects carry an explicit __typename discriminator.
  // MenuPageItemList (a category, e.g. "Most Ordered") has the exact same
  // name+description shape as a real MenuPageItem (an actual dish) — without
  // this check every category name gets extracted as a fake menu item.
  const isListType = o.__typename === "MenuPageItemList";

  // DoorDash items have name + (description or an image field or price)
  if (
    !isListType &&
    typeof o.name === "string" &&
    o.name.trim().length > 1 &&
    (
      typeof o.description === "string" ||
      typeof o.imageUrl === "string" ||
      typeof o.photoUrl === "string" ||
      typeof o.image === "string" ||
      typeof o.displayPrice === "string"
    )
  ) {
    const item: MenuItemData = { name: o.name.trim() };
    if (typeof o.description === "string" && o.description.trim()) {
      item.description = o.description.trim().substring(0, 300);
    }
    const img = o.imageUrl ?? o.photoUrl ?? o.image;
    if (typeof img === "string" && img.startsWith("http")) {
      item.imageUrl = img;
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
export function extractGrubhubItems(obj: unknown, out: MenuItemData[]): void {
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

/**
 * Deterministic backstop for near-duplicate detection: Gemini's cross-photo
 * judgment is necessarily probabilistic and confirmed live to occasionally
 * miss an actual duplicate pair. Byte-identical images (Google re-serving
 * the same upload under a different photo_reference token is common) are
 * caught for free here — we already have the base64 data in memory for the
 * Gemini call, no extra fetch or cost. Returns originalIdx → earlier
 * originalIdx it's byte-identical to.
 */
function findExactImageDuplicates(
  images: ({ data: string; mimeType: string } | null)[],
  validIndices: number[]
): Map<number, number> {
  const seen = new Map<string, number>();
  const duplicates = new Map<number, number>();
  for (const idx of validIndices) {
    const data = images[idx]!.data;
    const earlier = seen.get(data);
    if (earlier !== undefined) duplicates.set(idx, earlier);
    else seen.set(data, idx);
  }
  return duplicates;
}

// ── Gemini vision analysis ────────────────────────────────────────────────────

interface GeminiResult {
  dishName: string | null;
  dishDescription: string | null;
  isMenuMatch: boolean;
  isFood: boolean;
  /** True only when Gemini judged this a real dish/drink someone would order — see finalizeWithGemini's filter. */
  isOrderable: boolean;
  /** Marketing graphic (logo/price text/collage), not a photo of the served dish. Conservative — see the prompt. */
  isPromotional: boolean;
  isMenuPhoto: boolean;
  isStorefront: boolean;
  /** 0-100 visual quality: sharpness, lighting, framing, appetizing presentation. */
  photoQualityScore: number;
  /** Original analysisUrls index of an earlier near-duplicate photo, or null. */
  duplicateOfIndex: number | null;
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
    isOrderable: true, // fail-open: keep the photo unlabeled rather than hide it on a Gemini outage
    isPromotional: false,
    isMenuPhoto: false,
    isStorefront: false,
    photoQualityScore: 55,
    duplicateOfIndex: null,
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
}For EACH photo, first decide: is this something a customer would actually order and be excited to eat — a plated dish, a drink made for them, a dessert? NOT a fridge of assorted bottled/canned drinks, a storefront, an interior/decor shot, a menu board, a golf course or other non-food facility shot, or a group of unrelated items. Set isOrderable to false for all of those, even if food is technically visible. Set "isStorefront" true only for an exterior/storefront photo.

Also decide "isPromotional": true if the image is clearly a marketing graphic rather than a photo of the actual served dish — e.g. it has bold overlaid price/promo text, a brand logo watermark, a solid-color ad background, or is a collage of multiple items arranged for advertising (a classic example: a delivery-app "3 MEAT TREAT $6" style pizza-chain ad graphic). A single real plated dish, drink, or dessert is NEVER promotional, even if professionally lit or styled — when in doubt, set isPromotional to false. Wrongly letting an ad through is much better than wrongly hiding a real food photo.

Separately, set "isMenuPhoto" to true if the photo is a picture of a printed menu, a menu board, or a chalkboard listing dishes and prices — these are valuable for reading dish names even though they aren't a photo of food itself. isOrderable should be false for these.

If isOrderable is true AND isPromotional is false for a photo:
- "name": a SHORT, menu-style name of 4 words or fewer, exactly like it would appear on a printed menu (e.g. "Brisket Plate", "Loaded Nachos", "Iced Vanilla Latte"). If it matches an item in the list above, use that item's exact name if it's short enough; otherwise write your own short name. Never include ingredient lists or cooking instructions in "name".
- "description": a longer sentence with ingredients, preparation, and how it's served. This is where detail belongs, not in "name".

Otherwise set "name" and "description" to null.

Set "photoQualityScore" from 0 to 100 based on sharpness, lighting, composition, clear visibility of the dish, and how appetizing the actual food looks. Ignore whether the photo is professional or customer-shot; score the visible result.

Also decide "duplicateOfPhotoNumber": if this photo is a near-identical or duplicate shot of an EARLIER photo in this set (the same physical plate/moment — e.g. Google assigned two photo IDs to what's really one upload), return that earlier photo's number; otherwise null. Two different photos of the same dish type taken by different people are NOT duplicates — only flag true same-shot duplicates.

Respond with ONLY a JSON array with exactly ${validIndices.length} entries, one per photo in order, no markdown fences, no explanation:
[{"isFood": boolean, "isOrderable": boolean, "isPromotional": boolean, "isMenuPhoto": boolean, "isStorefront": boolean, "photoQualityScore": number, "name": string|null, "description": string|null, "duplicateOfPhotoNumber": number|null}, ...]`;

  const parts: unknown[] = [{ text: promptIntro }];
  validIndices.forEach((idx, n) => {
    const img = images[idx]!;
    parts.push({ text: `Photo ${n + 1}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024 + validIndices.length * 300,
      responseMimeType: "application/json",
      // Thinking disabled — food identification + duplicate-spotting don't need
      // chain-of-thought, and leaving this unset let the model spend an
      // unbounded amount of hidden "thinking" time per call. Confirmed live:
      // this exact call was the dominant cost in a 23s stage-2 (PRD target is
      // <4s cold-miss) once the duplicate-detection instruction made the
      // per-photo judgment harder. This was a documented Phase 0 tunable that
      // never actually made it into generationConfig.
      thinkingConfig: { thinkingBudget: 0 },
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
        isPromotional?: boolean;
        isMenuPhoto?: boolean;
        isStorefront?: boolean;
        photoQualityScore?: number;
        name?: string | null;
        description?: string | null;
        duplicateOfPhotoNumber?: number | null;
      }>;
      try {
        parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed)) throw new Error("not an array");
      } catch {
        console.error(`[Gemini batch] ${model} returned invalid JSON:`, rawText.slice(0, 300));
        continue;
      }

      // Map back from "valid photo" positions to the original analysisUrls indices.
      const exactDuplicates = findExactImageDuplicates(images, validIndices);
      const out: GeminiResult[] = analysisUrls.map(() => fallback);
      validIndices.forEach((originalIdx, n) => {
        const entry = parsed[n];
        const result = resolveGeminiEntry(entry, menuItems, popularDishes, hasMenu);
        const dupNum = entry?.duplicateOfPhotoNumber;
        result.duplicateOfIndex =
          exactDuplicates.get(originalIdx) ??
          (typeof dupNum === "number" && dupNum >= 1 && dupNum <= validIndices.length && validIndices[dupNum - 1] !== originalIdx
            ? validIndices[dupNum - 1]
            : null);
        out[originalIdx] = result;
      });
      return out;
    } catch (e) {
      console.error(`[Gemini batch] ${model} request failed:`, e);
    }
  }
  return analysisUrls.map(() => fallback);
}

function resolveGeminiEntry(
  entry:
    | {
        isFood?: boolean;
        isOrderable?: boolean;
        isPromotional?: boolean;
        isMenuPhoto?: boolean;
        isStorefront?: boolean;
        photoQualityScore?: number;
        name?: string | null;
        description?: string | null;
      }
    | undefined,
  menuItems: MenuItemData[],
  popularDishes: string[],
  hasMenu: boolean
): GeminiResult {
  const fallback: GeminiResult = {
    dishName: null,
    dishDescription: null,
    isMenuMatch: false,
    isFood: true,
    isOrderable: true,
    isPromotional: false,
    isMenuPhoto: false,
    isStorefront: false,
    photoQualityScore: 55,
    duplicateOfIndex: null,
  };
  if (!entry) return fallback;
  if (!entry.isFood || !entry.isOrderable || entry.isPromotional || !entry.name) {
    return {
      dishName: null,
      dishDescription: null,
      isMenuMatch: false,
      isFood: !!entry.isFood,
      isOrderable: !!entry.isOrderable,
      isPromotional: !!entry.isPromotional,
      isMenuPhoto: !!entry.isMenuPhoto,
      isStorefront: !!entry.isStorefront,
      photoQualityScore: Math.min(100, Math.max(0, Number(entry.photoQualityScore) || 40)),
      duplicateOfIndex: null,
    };
  }

  const name = entry.name.trim();
  if (isTruncatedOrInvalid(name)) {
    return {
      dishName: null,
      dishDescription: null,
      isMenuMatch: false,
      isFood: true,
      isOrderable: true,
      isPromotional: false,
      isMenuPhoto: false,
      isStorefront: false,
      photoQualityScore: Math.min(100, Math.max(0, Number(entry.photoQualityScore) || 55)),
      duplicateOfIndex: null,
    };
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
    isOrderable: true,
    isPromotional: false,
    isMenuPhoto: false,
    isStorefront: false,
    photoQualityScore: Math.min(100, Math.max(0, Number(entry.photoQualityScore) || 55)),
    duplicateOfIndex: null,
  };
}

// ── Pre-labeled photo quality check ───────────────────────────────────────────
// Pre-labeled owner photos (Menufy/DoorDash/schema.org) bypass the "would you
// order it" Gemini filter entirely — they arrive with a trusted dish name, so
// there was never a check for whether the IMAGE itself is a real photo of the
// served dish vs. a marketing graphic (logo/text overlay, multi-dish collage
// built for an ad). Confirmed live July 2026: Richie's hero was exactly this —
// a "BBQ Family Paks" promotional graphic. Deliberately conservative per
// founder direction: letting an ad through is far cheaper than hiding a real
// food photo, so only unambiguous marketing graphics get flagged.

interface PreLabeledQualityResult {
  isPromotional: boolean;
  duplicateOfIndex: number | null; // index within `photos` of an earlier duplicate, or null
  photoQualityScore: number;
}

async function assessPreLabeledPhotos(
  photos: DishPhoto[],
  restaurantName: string
): Promise<PreLabeledQualityResult[]> {
  const fallback: PreLabeledQualityResult = { isPromotional: false, duplicateOfIndex: null, photoQualityScore: 70 };
  if (photos.length === 0) return [];

  const images = await Promise.all(photos.map((p) => fetchImageAsBase64(p.url)));
  const validIndices = images.map((img, i) => (img ? i : -1)).filter((i) => i >= 0);
  if (validIndices.length === 0) return photos.map(() => fallback);

  const promptIntro = `You are reviewing ${validIndices.length} photos "${restaurantName}" itself uploaded to its ordering menu, numbered in order (Photo 1, Photo 2, ...). Each is already labeled with a real dish name from the menu — you do NOT need to identify the dish.

For EACH photo, decide "isPromotional": true ONLY if the image is clearly a marketing graphic rather than a photo of the actual served dish — e.g. it has visible overlaid text, prices, or logos, is a collage of multiple unrelated dishes arranged for advertising, or is obviously a stock/template graphic. A single real plated dish, drink, or dessert is NEVER promotional, even if professionally lit or styled — when in doubt, set isPromotional to false. Wrongly letting an ad through is far better than wrongly hiding a real food photo.

Also decide "duplicateOfPhotoNumber": if this photo is a near-identical or duplicate shot of an EARLIER photo in this set (the same physical dish/plate/moment — not just a similar dish), return that earlier photo's number; otherwise null.

Set "photoQualityScore" from 0 to 100 based on sharpness, lighting, composition, clear visibility of the dish, and how appetizing the actual food looks.

Respond with ONLY a JSON array with exactly ${validIndices.length} entries, one per photo in order, no markdown fences, no explanation:
[{"isPromotional": boolean, "photoQualityScore": number, "duplicateOfPhotoNumber": number|null}, ...]`;

  const parts: unknown[] = [{ text: promptIntro }];
  validIndices.forEach((idx, n) => {
    const img = images[idx]!;
    parts.push({ text: `Photo ${n + 1}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 512 + validIndices.length * 60,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 }, // see analyzePhotosWithGeminiBatch — same latency fix
    },
  });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!res.ok) {
        if (res.status === 403) break;
        continue;
      }

      const json = await res.json();
      const rawText: string = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      let parsed: Array<{ isPromotional?: boolean; photoQualityScore?: number; duplicateOfPhotoNumber?: number | null }>;
      try {
        parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed)) throw new Error("not an array");
      } catch {
        console.error(`[Pre-labeled quality] ${model} returned invalid JSON:`, rawText.slice(0, 300));
        continue;
      }

      const exactDuplicates = findExactImageDuplicates(images, validIndices);
      const out: PreLabeledQualityResult[] = photos.map(() => fallback);
      validIndices.forEach((originalIdx, n) => {
        const entry = parsed[n];
        const dupNum = entry?.duplicateOfPhotoNumber;
        const dupOriginalIdx =
          exactDuplicates.get(originalIdx) ??
          (typeof dupNum === "number" && dupNum >= 1 && dupNum <= validIndices.length && validIndices[dupNum - 1] !== originalIdx
            ? validIndices[dupNum - 1]
            : null);
        out[originalIdx] = {
          isPromotional: !!entry?.isPromotional,
          duplicateOfIndex: dupOriginalIdx,
          photoQualityScore: Math.min(100, Math.max(0, Number(entry?.photoQualityScore) || 70)),
        };
      });
      return out;
    } catch (e) {
      console.error(`[Pre-labeled quality] ${model} request failed:`, e);
    }
  }
  return photos.map(() => fallback);
}

// ── Menu-photo OCR ─────────────────────────────────────────────────────────────
// Restaurants' Google photo sets frequently include a shot of the physical menu
// board/paper menu. Rather than discard these as "not orderable" (PRD §5.4: photos
// *of* menus should feed the OCR pipeline, not the trash), read them with a
// dedicated Gemini call and fold the result into the corpus for future requests.
async function ocrMenuPhoto(analysisUrl: string, restaurantName: string): Promise<MenuItemData[]> {
  const imageData = await fetchImageAsBase64(analysisUrl);
  if (!imageData) return [];

  const prompt = `This photo shows a menu (printed, board, or chalkboard) from "${restaurantName}". Read every dish name you can make out and respond with ONLY this JSON, no markdown fences, no explanation:
[{"name": string, "description": string|null, "price": number|null}, ...]
Use the short name as it appears on the menu. Omit prices/descriptions if illegible. If you can't read any dish names, respond with [].`;

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const rawText: string = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed)) continue;

      return (parsed as Array<{ name?: string; description?: string | null; price?: number | null }>)
        .filter((i) => typeof i.name === "string" && i.name.trim().length > 1)
        .map((i) => ({
          name: i.name!.trim(),
          description: i.description?.trim() || undefined,
          price: typeof i.price === "number" ? i.price : undefined,
          source: "menu_ocr" as const,
        }));
    } catch (e) {
      console.error(`[Menu OCR] ${model} failed:`, e);
    }
  }
  return [];
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
// Gemini-analyzed (raw Google) photos use this function directly. Pre-labeled
// photos (Menufy/DoorDash/schema.org) skip name/description re-derivation
// (their name is already trusted) but now go through a separate quality pass
// (assessPreLabeledPhotos) before being scored at a flat PRE_LABELED_SCORE —
// see finalizeWithGemini.

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

function computeDishPopularityScore(dishName: string | null, popularDishes: string[]): number {
  if (!dishName) return 0;
  const lower = dishName.toLowerCase();
  const index = popularDishes.findIndex((candidate) => {
    const normalized = candidate.toLowerCase();
    return normalized === lower || normalized.includes(lower) || lower.includes(normalized);
  });
  return index < 0 ? 8 : Math.max(45, 100 - index * 8);
}

/** Confidence pyramid (PRD §4.2): score → grid tier. Mirrors computePriorityScore's bands. */
function scoreToTier(score: number): 1 | 2 | 3 {
  if (score >= 50) return 1; // menu-matched or pre-labeled
  if (score >= 10) return 2; // confident AI-identified
  return 3;                  // food visible, no confident label
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

// LRay's Kitchen is a manually-curated demo fixture (see `status: "test_fixture"`
// in getCorpusSnapshot) built on a real Google Place that has no real rating/
// price/hours data of its own. Kyle wants the demo to always show up highly
// reviewed, expensive, and open — hardcoded rather than left to whatever (or
// nothing) the underlying real place happens to report.
const FIXTURE_PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI";
const FIXTURE_OVERRIDE = { rating: 4.9, reviewCount: 812, priceLevel: 4, isOpen: true };

export async function getRestaurantDetails(
  placeId: string
): Promise<Restaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,photos,place_id,rating,user_ratings_total,price_level,opening_hours&key=${API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
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
    ...(placeId === FIXTURE_PLACE_ID
      ? FIXTURE_OVERRIDE
      : {
          rating: p.rating,
          reviewCount: p.user_ratings_total,
          priceLevel: p.price_level,
          isOpen: p.opening_hours?.open_now,
        }),
  };
}

// ── Main photo + review pipeline ──────────────────────────────────────────────
// Live sources (PRD §5.3): Google photos+reviews, restaurant website (schema.org +
// Menufy 2-hop), Grubhub. DoorDash is corpus-only (Tier 1 crawler) — its anti-bot
// challenge costs 51–75+ Scrapfly credits/lookup, so it never runs in this path.
//
// Split into two stages so /api/dishes can stream: stage 1 (pre-labeled photos +
// raw Google photo candidates) resolves in a couple seconds with no Gemini call;
// stage 2 (batched Gemini + OCR + final scoring) is the slow part. Non-streaming
// callers (crawler, benchmark, debug-sources) just call getGooglePhotosAndReviews,
// which runs both stages back to back.

/**
 * A photo that needs full Gemini identification (no trusted name yet) —
 * either a raw Google Places photo, or a generic image scraped off the
 * restaurant's own website (PRD §5.3: aggregation). Both go through the
 * exact same batched Gemini pass in finalizeWithGemini; unifying them here
 * means website photos get real identification, duplicate-detection, and
 * the instant stage-1 placeholder treatment for free instead of a second
 * parallel code path.
 */
interface RawPhotoCandidate {
  analysisUrl: string; // fetched for the Gemini call
  displayUrl: string;  // shown to the user
  source: DataSource;
  attribution: "user" | "owner";
  width: number;
  height: number;
}

export interface StreamingCandidates {
  placeId: string;
  restaurantName: string;
  preLabeledPhotos: DishPhoto[];
  rawPhotoPlaceholders: DishPhoto[]; // unlabeled placeholders — shown instantly, replaced by stage 2
  photoCandidates: RawPhotoCandidate[];
  allMenuItems: MenuItemData[];
  popularDishes: string[];
}

/** Stage 1: everything that doesn't need Gemini. Typically resolves in 1-3s. */
export async function fetchStreamingCandidates(
  placeId: string,
  restaurantName = ""
): Promise<StreamingCandidates | null> {
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,reviews,geometry,website,formatted_address&key=${API_KEY}`;
  const detailsRes = await fetch(detailsUrl);
  const data = await detailsRes.json();
  if (!data.result) return null;

  const { photos = [], reviews = [] } = data.result;
  const websiteUrl: string | undefined = data.result.website;

  // Grubhub is corpus-only (Tier 1 crawler, Camoufox) — its Scrapfly path
  // never succeeded here: confirmed root cause is a pure client-rendered SPA
  // that Scrapfly's render_js wait never finishes hydrating (see
  // DECISIONS.md). Calling it live spent a Scrapfly credit on a 0% hit rate
  // every single time — same waste pattern DoorDash was pulled from this
  // path for. The Scrapfly-based fetch helper was removed entirely.
  const website = websiteUrl ? await fetchMenuFromUrl(websiteUrl) : { items: [], photoUrls: [] };
  const websiteMenuItems = website.items;

  console.log(`[pipeline] "${restaurantName}" — website:${websiteMenuItems.length} photos:${website.photoUrls.length}`);

  const allMenuItems = deduplicateMenuItems(websiteMenuItems);
  const popularDishes = extractPopularDishes(reviews as GoogleReview[]);

  // Pre-labeled photos — schema.org MenuItem.image, Grubhub/Menufy photos. Now
  // go through assessPreLabeledPhotos (a batched Gemini call, see below) for
  // ad-photo/duplicate filtering, so cap how many get sent through it — large
  // menus (Richie's Menufy listing alone is 221 items) would otherwise mean
  // fetching+analyzing hundreds of images in one request. The UI only ever
  // shows ~20-30 photos anyway (grid cap), so this loses nothing real.
  const MAX_PRE_LABELED_CANDIDATES = 40;
  const preLabeledPhotos: DishPhoto[] = [];
  for (const item of websiteMenuItems) {
    if (preLabeledPhotos.length >= MAX_PRE_LABELED_CANDIDATES) break;
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
      tier: 1,
      width: 800,
      height: 600,
      loveCount: 0,
      primaryVotes: 0,
    });
  }

  const allGooglePhotos = photos as GooglePhoto[];
  const nonPortrait = allGooglePhotos.filter((p) => p.height <= p.width);
  const portrait    = allGooglePhotos.filter((p) => p.height >  p.width);
  // Was capped at 10 — for sparse-photo restaurants (small local spots,
  // some chain locations) that left very little raw material once
  // isFood/isOrderable/duplicate filtering ran, confirmed live as part of
  // "not that many photos" feedback. Google's Place Details can return up
  // to ~20; take what's there. thinkingBudget:0 on the Gemini call keeps
  // latency roughly linear in candidate count rather than blowing up.
  const googleCandidates = [...nonPortrait, ...portrait].slice(0, 20);

  const googlePhotoCandidates: RawPhotoCandidate[] = googleCandidates.map((photo) => {
    const attrText = photo.html_attributions.join(" ").toLowerCase();
    const isOwner =
      attrText.includes("owner") ||
      attrText.includes("the official") ||
      (!attrText.includes("maps.google.com/maps/contrib") && attrText.length > 0);
    return {
      analysisUrl: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${API_KEY}`,
      displayUrl: `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}&maxwidth=800`,
      source: "google",
      attribution: isOwner ? "owner" : "user",
      width: photo.width,
      height: photo.height,
    };
  });

  // Generic photos scraped off the restaurant's own website (PRD §5.3
  // aggregation) — no trusted dish name, so these need the same full
  // identification as Google photos, not the pre-labeled/trusted path.
  // Confirmed live (Bluewater Grill, 2.6k reviews): Google's Place Details
  // caps at exactly 10 photos regardless of billing tier or API version
  // (verified against both the legacy and New Places APIs), and the
  // restaurant's own real menu page had real food photography schema.org
  // never surfaced because MenuItem.image was null for every item. This is
  // the aggregation lever that actually moves the needle for well-reviewed,
  // popular restaurants whose website isn't on a known ordering platform.
  const websitePhotoCandidates: RawPhotoCandidate[] = website.photoUrls.map((url) => ({
    analysisUrl: url,
    displayUrl: url,
    source: "schema_org",
    attribution: "owner",
    width: 800,
    height: 600,
  }));

  const photoCandidates = [...googlePhotoCandidates, ...websitePhotoCandidates];

  // Raw, unlabeled placeholders — shown to the user immediately (PRD §4.5:
  // "Cold miss: show best available source immediately, backfill") while stage 2
  // (Gemini) is still running.
  const rawPhotoPlaceholders: DishPhoto[] = photoCandidates.map((c, i) => ({
    id: `raw-${placeId}-${i}`,
    url: c.displayUrl,
    dishName: null,
    dishDescription: null,
    isMenuMatch: false,
    source: c.source,
    attribution: c.attribution,
    tier: 3, // unlabeled placeholder; upgraded once stage 2 (Gemini) resolves it
    width: c.width,
    height: c.height,
    loveCount: 0,
      primaryVotes: 0,
  }));

  return {
    placeId,
    restaurantName,
    preLabeledPhotos,
    rawPhotoPlaceholders,
    photoCandidates,
    allMenuItems,
    popularDishes,
  };
}

/** Stage 2: the batched Gemini call, OCR, and final scoring/sort. The slow part. */
export async function finalizeWithGemini(
  c: StreamingCandidates
): Promise<{ photos: DishPhoto[]; menuItems: MenuItemData[] }> {
  const { placeId, restaurantName, preLabeledPhotos, photoCandidates, popularDishes } = c;
  const allMenuItems = [...c.allMenuItems];
  const analysisUrls = photoCandidates.map((cand) => cand.analysisUrl);

  // Run both batched Gemini passes together — independent photo sets, same
  // $0 infrastructure, no reason to serialize them.
  const [geminiResults, preLabeledQuality] = await Promise.all([
    analyzePhotosWithGeminiBatch(analysisUrls, allMenuItems, popularDishes, restaurantName),
    assessPreLabeledPhotos(preLabeledPhotos, restaurantName),
  ]);

  // OCR any photos flagged as pictures of the menu itself. These items arrive too
  // late to help name photos in *this* request, but get persisted to the corpus
  // so future requests for this restaurant benefit immediately.
  const menuPhotoIndices = geminiResults
    .map((r, i) => (r.isMenuPhoto ? i : -1))
    .filter((i) => i >= 0);
  const ocrItems = (
    await Promise.all(
      menuPhotoIndices.map((i) => ocrMenuPhoto(analysisUrls[i], restaurantName))
    )
  ).flat();
  if (ocrItems.length > 0) {
    allMenuItems.push(...deduplicateMenuItems(ocrItems));
  }

  const geminiPhotos: { photo: DishPhoto; score: number }[] = [];
  photoCandidates.forEach((candidate, i) => {
    const result = geminiResults[i] ?? {
      dishName: null,
      dishDescription: null,
      isMenuMatch: false,
      isFood: true,
      isOrderable: true,
      isPromotional: false,
      isMenuPhoto: false,
      isStorefront: false,
      photoQualityScore: 55,
      duplicateOfIndex: null,
    };
    // Drop non-food, non-orderable (facility/decor/fridge shots), promotional
    // ad graphics, and menu-board photos — confirmed live July 2026: Cross
    // Creek Golf Club (isOrderable=false golf-course shots) and Little
    // Caesars ("3 MEAT TREAT" ad graphic) were leaking through as unlabeled
    // tier-3 ghost photos because this filter never checked isOrderable, and
    // this batch call never asked Gemini for isPromotional at all.
    if (!result.isFood || !result.isOrderable || result.isPromotional || result.isMenuPhoto) return;
    if (result.duplicateOfIndex !== null) return; // near-identical shot of an earlier photo — drop it, not the original
    const score = computePriorityScore(result.dishName, result.isMenuMatch, popularDishes);
    const photo = withPhotoSignals({
        id: `raw-${placeId}-${i}`,
        url: candidate.displayUrl,
        dishName: result.dishName,
        dishDescription: result.dishDescription,
        isMenuMatch: result.isMenuMatch,
        source: candidate.source,
        attribution: candidate.attribution,
        tier: scoreToTier(score),
        width: candidate.width,
        height: candidate.height,
        loveCount: 0,
        primaryVotes: 0,
        photoQualityScore: result.photoQualityScore,
        dishPopularityScore: computeDishPopularityScore(result.dishName, popularDishes),
        isHeroCandidate: !!result.dishName && !result.isStorefront && result.photoQualityScore >= 55,
        isStorefront: result.isStorefront,
        isMenuPhoto: result.isMenuPhoto,
      });
    geminiPhotos.push({
      photo,
      score: heroScore(photo),
    });
  });

  geminiPhotos.sort((a, b) => b.score - a.score);

  // Filter promotional/ad-style graphics and near-duplicates out of the
  // pre-labeled set entirely, and rescore the survivors down from an
  // unconditional 200 to PRE_LABELED_SCORE — high enough to land solidly in
  // tier 1 ("on the menu"), but no longer guaranteed to outrank every real
  // patron photo, so management photos are the fallback, not the default
  // star (founder decision, PRD hero-tile debate — see DECISIONS.md).
  const PRE_LABELED_SCORE = 60;
  const scoredPreLabeled = preLabeledPhotos
    .map((photo, i) => ({ photo, quality: preLabeledQuality[i] }))
    .filter(({ quality }) => !quality?.isPromotional && quality?.duplicateOfIndex === null)
    .map(({ photo, quality }) => {
      const signaled = withPhotoSignals({
        ...photo,
        tier: scoreToTier(PRE_LABELED_SCORE),
        photoQualityScore: quality?.photoQualityScore ?? defaultPhotoQuality(photo),
        dishPopularityScore: computeDishPopularityScore(photo.dishName, popularDishes),
        isHeroCandidate: !!photo.dishName && (quality?.photoQualityScore ?? 70) >= 55,
        isStorefront: false,
        isMenuPhoto: false,
      });
      return { photo: signaled, score: heroScore(signaled) };
    });

  const all = [...scoredPreLabeled, ...geminiPhotos];

  all.sort((a, b) => b.score - a.score);

  return { photos: all.map((e) => e.photo), menuItems: allMenuItems };
}

export async function getGooglePhotosAndReviews(
  placeId: string,
  restaurantName = ""
): Promise<{
  photos: DishPhoto[];
  popularDishes: string[];
  menuItems: MenuItemData[];
}> {
  const candidates = await fetchStreamingCandidates(placeId, restaurantName);
  if (!candidates) return { photos: [], popularDishes: [], menuItems: [] };
  const { photos, menuItems } = await finalizeWithGemini(candidates);
  return { photos, popularDishes: candidates.popularDishes, menuItems };
}
