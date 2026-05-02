import { DishPhoto } from "./types";

const API_KEY = process.env.YELP_API_KEY!;
const YELP_BASE = "https://api.yelp.com/v3";

interface YelpBusiness {
  id: string;
  name: string;
  alias: string;
}

interface YelpReview {
  id: string;
  text: string;
  user: { name: string };
}

interface YelpPhoto {
  photo_id: string;
  url: string;
  caption: string;
  label: string; // "food", "inside", "outside", "drink", "menu"
  user?: { name: string };
}

// Common dish keywords to extract dish names from captions/reviews
const DISH_PATTERNS = [
  // Look for quoted dish names
  /"([^"]+)"/,
  /'([^']+)'/,
  // "the X was/is/are"
  /the\s+([a-z\s]{3,30})\s+(?:was|is|are|were)\b/i,
  // "ordered the X"
  /ordered\s+(?:the\s+)?([a-z\s]{3,30})(?:\.|,|!|\s+and)/i,
  // "tried the X"
  /tried\s+(?:the\s+)?([a-z\s]{3,30})(?:\.|,|!|\s+and)/i,
  // "had the X"
  /had\s+(?:the\s+)?([a-z\s]{3,30})(?:\.|,|!|\s+and)/i,
  // "got the X"
  /got\s+(?:the\s+)?([a-z\s]{3,30})(?:\.|,|!|\s+and)/i,
  // "their X"
  /their\s+([a-z\s]{3,30})(?:\.|,|!|\s+is|\s+was)/i,
];

function extractDishName(text: string): string | null {
  if (!text || text.length < 3) return null;

  // If it's short (likely a caption), just use it directly
  if (text.length < 50 && !text.includes(".")) {
    // Clean up and title-case
    const cleaned = text.trim().replace(/^(the|a|an)\s+/i, "");
    if (cleaned.length > 2 && cleaned.length < 40) {
      return titleCase(cleaned);
    }
  }

  for (const pattern of DISH_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 40) {
        return titleCase(name);
      }
    }
  }
  return null;
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function findYelpBusiness(
  name: string,
  lat: number,
  lng: number
): Promise<string | null> {
  const url = `${YELP_BASE}/businesses/search?term=${encodeURIComponent(name)}&latitude=${lat}&longitude=${lng}&limit=1&categories=restaurants,food`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const data = await res.json();

  if (!data.businesses?.length) return null;
  return data.businesses[0].id;
}

export async function getYelpPhotos(
  businessId: string
): Promise<DishPhoto[]> {
  // Get business details (includes up to 3 photos) and reviews
  const [bizRes, reviewRes] = await Promise.all([
    fetch(`${YELP_BASE}/businesses/${businessId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
    fetch(`${YELP_BASE}/businesses/${businessId}/reviews?limit=20&sort_by=yelp_sort`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
  ]);

  const bizData = await bizRes.json();
  const reviewData = await reviewRes.json();

  const photos: DishPhoto[] = [];

  // Extract dish names from reviews for context
  const reviewDishNames: string[] = [];
  if (reviewData.reviews) {
    for (const review of reviewData.reviews as YelpReview[]) {
      const name = extractDishName(review.text);
      if (name) reviewDishNames.push(name);
    }
  }

  // Yelp business endpoint returns photos array
  if (bizData.photos) {
    bizData.photos.forEach((url: string, i: number) => {
      photos.push({
        id: `yelp-${businessId}-${i}`,
        url,
        dishName: reviewDishNames[i] || null,
        isMenuMatch: false, // Yelp photos bypass Gemini — no menu matching
        source: "yelp",
        attribution: i === 0 ? "owner" : "user", // first photo is usually the business photo
        width: 600,
        height: 400,
      });
    });
  }

  // Also try to get photos from the Yelp GraphQL-like endpoint
  // via the business details categories to infer dish context
  if (bizData.categories) {
    const cuisineTypes = bizData.categories.map(
      (c: { alias: string; title: string }) => c.title
    );
    // Use cuisine type as fallback context for unnamed dishes
    for (const photo of photos) {
      if (!photo.dishName && cuisineTypes.length > 0) {
        // Don't assign cuisine as dish name - leave null
        // This keeps our data honest
      }
    }
  }

  return photos;
}
