import { Restaurant, DishPhoto } from "./types";
import { extractPopularDishes } from "./reviewParser";

const API_KEY   = process.env.GOOGLE_MAPS_API_KEY!;
const VISION_KEY = process.env.VISION_API_KEY || API_KEY; // Gemini uses same project

// ── Shared interfaces ─────────────────────────────────────────────────────

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

// ── Tier 1: Places API v1 menu fetch ─────────────────────────────────────
// Coverage is ~30-40% of restaurants. Returns [] gracefully when unavailable.
// Places API (New) must be enabled on the same Google Cloud project as API_KEY.
// Field mask: menuItems — returns item displayName.text strings.

async function fetchMenuFromPlacesV1(placeId: string): Promise<string[]> {
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
      data.menuItems as Array<{ displayName?: { text?: string } }>
    )
      .map((item) => item.displayName?.text)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  } catch {
    return [];
  }
}

// ── Image fetch helper ────────────────────────────────────────────────────
// Follows the Google Places Photo API redirect and returns base64 + mimeType.
// Used to send images inline to Gemini (inlineData requires base64).

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    const data = Buffer.from(buffer).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

// ── Gemini vision analysis ────────────────────────────────────────────────
// Replaces Google Vision LABEL_DETECTION entirely.
// Strategy:
//   - With menu items: ask Gemini to pick the closest menu item (verbatim match)
//   - With only popular dishes: use them as a reference list
//   - Without any reference: ask for a free-form 2-5 word dish description
// Returns: dishName (verbatim from list or free-form), isMenuMatch, isFood
//
// Model cascade: try gemini-2.0-flash first (latest), fall back to 1.5-flash.
// Endpoint: v1 (stable). v1beta is deprecated.

interface GeminiResult {
  dishName: string | null;
  isMenuMatch: boolean;
  isFood: boolean;
}

async function analyzePhotoWithGemini(
  analysisUrl: string, // lower-res URL for bandwidth efficiency
  menuItems: string[], // from Places API v1; may be empty
  popularDishes: string[], // from review NLP; used as fallback reference
  restaurantName: string
): Promise<GeminiResult> {
  // Fail-open: if we can't analyze, treat as food (show photo, no label)
  const fallback: GeminiResult = { dishName: null, isMenuMatch: false, isFood: true };

  const imageData = await fetchImageAsBase64(analysisUrl);
  if (!imageData) return fallback;

  // Build reference list: prefer formal menu, supplement with popular dishes
  const hasMenu = menuItems.length > 0;
  const referenceItems = hasMenu
    ? menuItems.slice(0, 60)
    : popularDishes.slice(0, 20);

  const prompt =
    referenceItems.length > 0
      ? `You are analyzing a food photo from "${restaurantName}".

${hasMenu ? "Their menu includes:" : "Dishes commonly ordered here:"}
${referenceItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Look at this photo. Respond with ONE of these exact options:
- If this photo shows a dish or drink from the list above, respond with the EXACT text from the list (verbatim, same capitalization).
- If food or drink is visible but it's not in the list, respond with a 2–5 word dish name.
- If NO food or drink is visible (decor, exterior, people, signage, menus, packaging only), respond with the word: null

No explanation. Just the dish name or null.`
      : `Look at this food photo from "${restaurantName}".
- If a specific dish or drink is visible, respond with the item name in 2–5 words (e.g. "Carne Asada Plate", "Iced Matcha Latte").
- If no food or drink is visible, respond with the word: null

No explanation. Just the name or null.`;

  // Model cascade: gemini-2.0-flash (stable v1) → gemini-1.5-flash (fallback)
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
    generationConfig: { temperature: 0, maxOutputTokens: 40 },
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
        // 429 = rate limit → worth retrying with next model; 403 = blocked → skip all
        if (res.status === 403) return fallback;
        continue; // try next model
      }

      const json = await res.json();
      const rawText: string =
        json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      // First line only, capped at 80 chars
      const text = rawText.split("\n")[0].substring(0, 80).trim();

      if (!text || text.toLowerCase() === "null") {
        return { dishName: null, isMenuMatch: false, isFood: false };
      }

      // Check for verbatim match against reference list (case-insensitive)
      const lowerText = text.toLowerCase();
      const matchedItem = referenceItems.find(
        (item) => item.toLowerCase().trim() === lowerText
      );

      return {
        dishName: matchedItem ?? text,
        isMenuMatch: !!matchedItem,
        isFood: true,
      };
    } catch (e) {
      console.error(`[Gemini] ${model} request failed:`, e);
      // Network error — try next model
    }
  }

  return fallback;
}

// ── Priority scoring ──────────────────────────────────────────────────────
// Controls the sort order of photos in the gallery.
//
// Scores:
//   100+ — menu match AND popular dish   → shown first, these are the money shots
//    50  — menu match only               → confirmed menu item
//    30+ — AI-identified AND popular     → strong signal from reviews
//    10  — AI-identified food            → generic dish description
//     5  — food detected, no label       → pass-through
//    -1  — non-food                      → filtered out

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

// ── Places API helpers ────────────────────────────────────────────────────

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

// ── Main photo + review pipeline ──────────────────────────────────────────

export async function getGooglePhotosAndReviews(
  placeId: string,
  restaurantName = ""
): Promise<{
  photos: DishPhoto[];
  popularDishes: string[];
}> {
  // ① Fetch Place Details (photos + reviews) AND Places API v1 menu in parallel
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,reviews&key=${API_KEY}`;

  const [detailsRes, menuItems] = await Promise.all([
    fetch(detailsUrl),
    fetchMenuFromPlacesV1(placeId),
  ]);

  const data = await detailsRes.json();
  if (!data.result) return { photos: [], popularDishes: [] };

  const { photos = [], reviews = [] } = data.result;
  const popularDishes = extractPopularDishes(reviews as GoogleReview[]);

  if ((photos as GooglePhoto[]).length === 0) {
    return { photos: [], popularDishes };
  }

  // ② Non-portrait photos first, portrait appended (for tie-breaking within score tiers)
  const allPhotos = photos as GooglePhoto[];
  const nonPortrait = allPhotos.filter((p) => p.height <= p.width);
  const portrait    = allPhotos.filter((p) => p.height >  p.width);
  const candidates  = [...nonPortrait, ...portrait].slice(0, 20);

  // ③ Two URLs per candidate:
  //    - analysisUrl: maxwidth=400  — sent to Gemini (smaller = faster + cheaper)
  //    - displayUrl:  maxwidth=800  — delivered to the browser
  const analysisUrls = candidates.map(
    (p) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );
  const displayUrls = candidates.map(
    (p) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );

  // ④ Analyze all photos in parallel with Gemini 1.5 Flash
  const geminiResults = await Promise.all(
    analysisUrls.map((url) =>
      analyzePhotoWithGemini(url, menuItems, popularDishes, restaurantName)
    )
  );

  // ⑤ Score each photo, filter non-food, stable-sort descending by score
  const scored = candidates
    .map((photo, i) => {
      const result = geminiResults[i] ?? {
        dishName: null,
        isMenuMatch: false,
        isFood: true,
      };
      const score = result.isFood
        ? computePriorityScore(result.dishName, result.isMenuMatch, popularDishes)
        : -1;
      return { photo, displayUrl: displayUrls[i], result, score };
    })
    .filter((e) => e.score >= 0); // drop non-food

  // JS sort is stable — ties preserve non-portrait-first ordering
  scored.sort((a, b) => b.score - a.score);

  // ⑥ Build DishPhoto objects
  const dishPhotos: DishPhoto[] = scored.map(({ photo, displayUrl, result }, i) => {
    const attrText = photo.html_attributions.join(" ").toLowerCase();
    const isOwner =
      attrText.includes("owner") ||
      attrText.includes("the official") ||
      (!attrText.includes("maps.google.com/maps/contrib") && attrText.length > 0);

    return {
      id: `google-${placeId}-${i}`,
      url: displayUrl,
      dishName: result.dishName,
      isMenuMatch: result.isMenuMatch,
      source: "google",
      attribution: isOwner ? "owner" : "user",
      width: photo.width,
      height: photo.height,
    };
  });

  return { photos: dishPhotos, popularDishes };
}
