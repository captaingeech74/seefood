import { Restaurant, DishPhoto, MenuItemData } from "./types";
import { extractPopularDishes } from "./reviewParser";
import { fetchYelpBusinessData } from "./yelp";
import { fetchMenuFromUrl } from "./menuSources";

const API_KEY   = process.env.GOOGLE_MAPS_API_KEY!;
const VISION_KEY = process.env.VISION_API_KEY || API_KEY;

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

// ── Source 1: Google Places API v1 menu ───────────────────────────────────────
// Returns MenuItemData[] with names and descriptions when available (~15–25% coverage).

async function fetchMenuFromPlacesV1(placeId: string): Promise<MenuItemData[]> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${API_KEY}&languageCode=en`,
      {
        headers: { "X-Goog-FieldMask": "menuItems" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.menuItems) || data.menuItems.length === 0) return [];

    return (
      data.menuItems as Array<{
        displayName?: { text?: string };
        description?: { text?: string };
      }>
    )
      .map((item) => {
        const name = item.displayName?.text?.trim();
        if (!name) return null;
        const result: MenuItemData = { name };
        const desc = item.description?.text?.trim();
        if (desc) result.description = desc.substring(0, 300);
        return result;
      })
      .filter((item): item is MenuItemData => item !== null);
  } catch {
    return [];
  }
}

// ── Source 4: DoorDash (two parallel strategies) ─────────────────────────────
// Every DoorDash menu item has name + description + photo already paired together.
// Pre-labeled photos bypass Gemini entirely and score 200 (always shown first).
//
// Strategy A — Direct scrape (no env vars needed, best-effort):
//   Search DoorDash's own website for the restaurant, find the store URL from
//   the HTML, then fetch the store page and parse __NEXT_DATA__.
//
// Strategy B — Google Custom Search fallback (requires env vars):
//   GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID — more reliable when present.
//
// Both strategies run in parallel; results are merged and deduplicated.

async function fetchMenuFromDoorDash(
  restaurantName: string,
  address: string,
  lat?: number,
  lng?: number
): Promise<MenuItemData[]> {
  const [directResult, searchResult] = await Promise.allSettled([
    lat && lng
      ? fetchDoorDashDirect(restaurantName, lat, lng)
      : Promise.resolve([] as MenuItemData[]),
    fetchDoorDashViaGoogleSearch(restaurantName, address),
  ]);

  const combined = [
    ...(directResult.status === "fulfilled" ? directResult.value : []),
    ...(searchResult.status === "fulfilled" ? searchResult.value : []),
  ];

  const seen = new Set<string>();
  return combined.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key) || item.name.length < 2) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Strategy A: Find the store on DoorDash's search page via HTML scraping.
 * No API key required. Gracefully returns [] on any failure.
 */
async function fetchDoorDashDirect(
  restaurantName: string,
  lat: number,
  lng: number
): Promise<MenuItemData[]> {
  void lat; void lng; // coordinates reserved for future geo-biased search
  try {
    const q = encodeURIComponent(restaurantName);
    const searchRes = await fetch(
      `https://www.doordash.com/search/?q=${q}`,
      {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );
    if (!searchRes.ok) return [];

    const html = await searchRes.text();

    // Extract store URL slugs embedded in the search results page
    const slugSet = new Set(
      [...html.matchAll(/["'](\/store\/([a-z0-9][a-z0-9-]{3,70})\/)/gi)].map(
        (m) => m[2]
      )
    );
    const slugs = [...slugSet].filter(
      (s) => !["pickup", "search", "home", "dasher"].some((x) => s.startsWith(x))
    );

    if (!slugs.length) {
      console.log(`[DoorDash direct] no store slugs found for "${restaurantName}"`);
      return [];
    }

    // Score slugs by name-part overlap with the restaurant name
    const nameParts = restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(" ")
      .filter((w) => w.length > 2);

    const bestSlug = slugs.sort((a, b) => {
      const score = (s: string) => nameParts.filter((p) => s.includes(p)).length;
      return score(b) - score(a);
    })[0];

    console.log(
      `[DoorDash direct] "${restaurantName}" → slug: ${bestSlug} (${slugs.length} candidates)`
    );
    return fetchDoorDashStorePage(`https://www.doordash.com/store/${bestSlug}/`);
  } catch (e) {
    console.error("[DoorDash direct] failed:", e);
    return [];
  }
}

/**
 * Strategy B: Google Custom Search → DoorDash store URL.
 * Requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID env vars.
 * Returns [] gracefully when keys are absent.
 */
async function fetchDoorDashViaGoogleSearch(
  restaurantName: string,
  address: string
): Promise<MenuItemData[]> {
  const searchKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchCx  = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!searchKey || !searchCx) return [];

  try {
    const query = `"${restaurantName}" ${address} site:doordash.com`;
    const searchRes = await fetch(
      `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${searchKey}&cx=${searchCx}&num=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!searchRes.ok) return [];

    const data = await searchRes.json();
    const url: string | undefined = data.items?.[0]?.link;
    if (!url || !url.includes("doordash.com/store/")) return [];

    return fetchDoorDashStorePage(url);
  } catch {
    return [];
  }
}

/**
 * Fetch a DoorDash store page and extract menu items from __NEXT_DATA__.
 * Works for any DoorDash store URL; called by both strategies above.
 */
async function fetchDoorDashStorePage(url: string): Promise<MenuItemData[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match) return [];

    const items: MenuItemData[] = [];
    try {
      extractDoorDashItems(JSON.parse(match[1]), items);
    } catch {
      return [];
    }

    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key) || item.name.length < 2) return false;
      seen.add(key);
      return true;
    });

    console.log(`[DoorDash store] ${url}: ${deduped.length} items`);
    return deduped;
  } catch (e) {
    console.error(`[DoorDash store] failed for ${url}:`, e);
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

async function analyzePhotoWithGemini(
  analysisUrl: string,
  menuItems: MenuItemData[],       // from all merged sources
  popularDishes: string[],         // fallback when no menu data
  restaurantName: string
): Promise<GeminiResult> {
  const fallback: GeminiResult = {
    dishName: null,
    dishDescription: null,
    isMenuMatch: false,
    isFood: true,
  };

  const imageData = await fetchImageAsBase64(analysisUrl);
  if (!imageData) return fallback;

  // Build reference list: formal menu takes priority over popular dishes
  const hasMenu = menuItems.length > 0;
  const referenceNames: string[] = hasMenu
    ? menuItems.slice(0, 60).map((i) => i.name)
    : popularDishes.slice(0, 20);

  const prompt =
    referenceNames.length > 0
      ? `You are identifying a dish in a food photo from "${restaurantName}".

${hasMenu ? "Their menu includes:" : "Dishes commonly ordered here:"}
${referenceNames.map((name, i) => `${i + 1}. ${name}`).join("\n")}

Look at this photo and respond with ONE of:
- The EXACT text from the list above if this photo shows that dish (verbatim, same capitalization).
- The full, specific dish name if food is visible but not in the list — include cooking method, key ingredients, and how it's served (e.g. "Smoked Brisket with Fried Eggs and Hash Browns", "Brisket Sliders with BBQ Dipping Sauce").
- The word: null — if NO food or drink is visible (decor, exterior, signage only).

No explanation. Just the dish name or null.`
      : `You are identifying a dish in a food photo from "${restaurantName}".

If food or drink is visible, respond with the full, specific dish name — include cooking method, key ingredients, and how it's served (e.g. "Smoked Brisket with Fried Eggs and Hash Browns", "Spicy Salmon Avocado Roll", "Truffle Parmesan Fries with Aioli").
If nothing edible is visible, respond with the word: null

No explanation. Just the dish name or null.`;

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
        ],
      },
    ],
    // Gemini 2.5 Flash uses thinking tokens that count against maxOutputTokens.
    // Empirical: thinking alone consumes 200–700 tokens, leaving almost nothing
    // for actual output at 200. 1024 gives ample room after thinking budget.
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(20000),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[Gemini] ${model} HTTP ${res.status}:`, errText.slice(0, 300));
        if (res.status === 403) return fallback;
        continue;
      }

      const json = await res.json();
      const rawText: string =
        json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      const text = rawText.split("\n")[0].substring(0, 120).trim();

      if (!text || text.toLowerCase() === "null") {
        return { dishName: null, dishDescription: null, isMenuMatch: false, isFood: false };
      }

      // Match against menu reference list — exact first, then one-way fuzzy.
      // IMPORTANT: only match when the menu item *contains* Gemini's response,
      // not the reverse. This prevents generic terms ("Brisket") from swallowing
      // specific dish descriptions ("Smoked Brisket with Eggs and Hash Browns").
      const lowerText = text.toLowerCase();
      const matchedItem = hasMenu
        ? menuItems.slice(0, 60).find((item) => {
            const itemL = item.name.toLowerCase().trim();
            return (
              itemL === lowerText ||      // exact
              itemL.includes(lowerText)   // menu item is more verbose: "House Truffle Wagyu Burger" ⊇ "Truffle Burger"
            );
          })
        : undefined;

      // For popular dishes (string[]), same logic
      const matchedPopular =
        !hasMenu && !matchedItem
          ? popularDishes.find((p) => {
              const pl = p.toLowerCase().trim();
              return pl === lowerText || pl.includes(lowerText);
            })
          : undefined;

      return {
        dishName: matchedItem?.name ?? matchedPopular ?? text,
        dishDescription: matchedItem?.description ?? null,
        isMenuMatch: !!(matchedItem || matchedPopular),
        isFood: true,
      };
    } catch (e) {
      console.error(`[Gemini] ${model} request failed:`, e);
    }
  }
  return fallback;
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

export async function getGooglePhotosAndReviews(
  placeId: string,
  restaurantName = ""
): Promise<{
  photos: DishPhoto[];
  popularDishes: string[];
}> {
  // ── Phase 1: Place Details + Places v1 menu in parallel ─────────────────────
  // `website` and `geometry` added for menu scraping + Yelp lookup.
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,reviews,geometry,website,formatted_address&key=${API_KEY}`;

  const [detailsRes, placesMenuItems] = await Promise.all([
    fetch(detailsUrl),
    fetchMenuFromPlacesV1(placeId), // Source 1
  ]);

  const data = await detailsRes.json();
  if (!data.result) return { photos: [], popularDishes: [] };

  const { photos = [], reviews = [] } = data.result;
  const lat: number | undefined = data.result.geometry?.location?.lat;
  const lng: number | undefined = data.result.geometry?.location?.lng;
  const websiteUrl: string | undefined = data.result.website;
  const formattedAddress: string = data.result.formatted_address ?? "";

  // ── Phase 2: Website + Yelp + DoorDash in parallel ──────────────────────────
  // Source 2: restaurant website schema.org (also yields pre-labeled photos with imageUrl)
  // Source 3: Yelp menu_url attribute + reviews + photo URLs
  // Source 4: DoorDash (direct scrape + optional Google Custom Search)
  const [websiteMenuItems, yelpData, doorDashItems] = await Promise.all([
    websiteUrl ? fetchMenuFromUrl(websiteUrl) : Promise.resolve([]),
    lat && lng
      ? fetchYelpBusinessData(restaurantName, lat, lng)
      : Promise.resolve({ menuItems: [], reviews: [], photoUrls: [] }),
    fetchMenuFromDoorDash(restaurantName, formattedAddress, lat, lng), // Source 4
  ]);

  // Debug logging — helps diagnose why sources return empty
  console.log(
    `[pipeline] "${restaurantName}" — ` +
    `places:${placesMenuItems.length} website:${websiteMenuItems.length} ` +
    `yelp_menu:${yelpData.menuItems.length} yelp_photos:${yelpData.photoUrls.length} ` +
    `doordash:${doorDashItems.length}`
  );

  // Merge all menu sources, deduplicate — this is the reference list Gemini works from
  const allMenuItems = deduplicateMenuItems([
    ...placesMenuItems,
    ...websiteMenuItems,
    ...yelpData.menuItems,
    ...doorDashItems,
  ]);

  // Merge reviews for popular dish extraction
  const allReviews = [
    ...(reviews as GoogleReview[]),
    ...yelpData.reviews,
  ];
  const popularDishes = extractPopularDishes(allReviews);

  // ── Phase 3: Pre-labeled photos (bypass Gemini) ──────────────────────────────
  // These come with dish name + description + photo already paired.
  // Source: schema.org MenuItem.image and DoorDash menu item photos.
  const preLabeledPhotos: DishPhoto[] = [];

  for (const item of websiteMenuItems) {
    if (!item.imageUrl) continue;
    preLabeledPhotos.push({
      id: `website-${item.imageUrl.slice(-24)}`,
      url: item.imageUrl,
      dishName: item.name,
      dishDescription: item.description ?? null,
      isMenuMatch: true,
      source: "website",
      attribution: "owner",
      width: 800,
      height: 600,
    });
  }

  for (const item of doorDashItems) {
    if (!item.imageUrl) continue;
    preLabeledPhotos.push({
      id: `doordash-${item.imageUrl.slice(-24)}`,
      url: item.imageUrl,
      dishName: item.name,
      dishDescription: item.description ?? null,
      isMenuMatch: true,
      source: "doordash",
      attribution: "owner",
      width: 800,
      height: 600,
    });
  }

  // ── Phase 4: Build Gemini candidate pool (Google + Yelp photo URLs) ──────────
  const allGooglePhotos = photos as GooglePhoto[];
  const nonPortrait = allGooglePhotos.filter((p) => p.height <= p.width);
  const portrait    = allGooglePhotos.filter((p) => p.height >  p.width);
  const googleCandidates = [...nonPortrait, ...portrait].slice(0, 10);

  // Yelp photos appended after Google — up to 3 more
  const yelpCandidateUrls = yelpData.photoUrls.slice(0, 3);

  // Build analysis + display URLs for Google photos
  const googleAnalysisUrls = googleCandidates.map(
    (p) => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );
  const googleDisplayUrls = googleCandidates.map(
    (p) => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );

  // ── Phase 5: Gemini analysis — all candidates in parallel ────────────────────
  const geminiResults = await Promise.all([
    ...googleAnalysisUrls.map((url) =>
      analyzePhotoWithGemini(url, allMenuItems, popularDishes, restaurantName)
    ),
    ...yelpCandidateUrls.map((url) =>
      analyzePhotoWithGemini(url, allMenuItems, popularDishes, restaurantName)
    ),
  ]);

  // ── Phase 6: Score, filter, sort ─────────────────────────────────────────────
  const geminiPhotos: { photo: DishPhoto; score: number }[] = [];

  // Google photos
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

  // Yelp photos
  yelpCandidateUrls.forEach((url, i) => {
    const ri = googleCandidates.length + i;
    const result = geminiResults[ri] ?? { dishName: null, dishDescription: null, isMenuMatch: false, isFood: true };
    if (!result.isFood) return;
    const score = computePriorityScore(result.dishName, result.isMenuMatch, popularDishes);
    geminiPhotos.push({
      photo: {
        id: `yelp-analyzed-${placeId}-${i}`,
        url,
        dishName: result.dishName,
        dishDescription: result.dishDescription,
        isMenuMatch: result.isMenuMatch,
        source: "yelp",
        attribution: i === 0 ? "owner" : "user",
        width: 600,
        height: 400,
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
  };
}
