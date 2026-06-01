import { DishPhoto, MenuItemData } from "./types";
import { fetchMenuFromUrl } from "./menuSources";

const API_KEY = process.env.YELP_API_KEY!;
const YELP_BASE = "https://api.yelp.com/v3";

interface YelpReview {
  id: string;
  text: string;
  rating?: number;
  user: { name: string };
}

interface YelpPhoto {
  photo_id: string;
  url: string;
  caption: string;
  label: string; // "food", "inside", "outside", "drink", "menu"
  user?: { name: string };
}

export interface YelpBusinessData {
  /** Menu item names + descriptions from attributes.menu_url (empty if unavailable) */
  menuItems: MenuItemData[];
  /** Up to 20 reviews, compatible with extractPopularDishes */
  reviews: { text: string; rating?: number }[];
  /** Up to 3 Yelp photo URLs for Gemini analysis */
  photoUrls: string[];
}

/**
 * Single Yelp lookup: business details + reviews + menu items.
 * Returns menu items (with descriptions), reviews, and raw photo URLs.
 * Used by getGooglePhotosAndReviews to supplement Google data.
 */
export async function fetchYelpBusinessData(
  name: string,
  lat: number,
  lng: number
): Promise<YelpBusinessData> {
  const empty: YelpBusinessData = { menuItems: [], reviews: [], photoUrls: [] };
  try {
    const businessId = await findYelpBusiness(name, lat, lng);
    if (!businessId) return empty;

    const [bizRes, reviewRes] = await Promise.all([
      fetch(`${YELP_BASE}/businesses/${businessId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(
        `${YELP_BASE}/businesses/${businessId}/reviews?limit=20&sort_by=yelp_sort`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      ),
    ]);

    const [bizData, reviewData] = await Promise.all([
      bizRes.json(),
      reviewRes.json(),
    ]);

    const reviews = ((reviewData.reviews as YelpReview[]) ?? []).map((r) => ({
      text: r.text,
      rating: r.rating,
    }));

    // Photo URLs (up to 3) — routed through Gemini in the main pipeline
    const photoUrls: string[] = Array.isArray(bizData.photos)
      ? (bizData.photos as string[]).slice(0, 3)
      : [];

    // Menu items from menu_url if available (returns MenuItemData[] with descriptions)
    const menuUrl: string | undefined = bizData.attributes?.menu_url ?? undefined;
    const menuItems = menuUrl ? await fetchMenuFromUrl(menuUrl) : [];

    return { menuItems, reviews, photoUrls };
  } catch {
    return empty;
  }
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

// getYelpPhotos is kept for reference but not called in the main pipeline.
// Yelp photo URLs are now returned via fetchYelpBusinessData.photoUrls
// and routed through Gemini for analysis.
export async function getYelpPhotos(
  businessId: string
): Promise<DishPhoto[]> {
  const [bizRes] = await Promise.all([
    fetch(`${YELP_BASE}/businesses/${businessId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
  ]);
  const bizData = await bizRes.json();
  const photos: DishPhoto[] = [];

  if (bizData.photos) {
    (bizData.photos as string[]).forEach((url: string, i: number) => {
      photos.push({
        id: `yelp-${businessId}-${i}`,
        url,
        dishName: null,
        dishDescription: null,
        isMenuMatch: false,
        source: "yelp",
        attribution: i === 0 ? "owner" : "user",
        width: 600,
        height: 400,
      });
    });
  }
  return photos;
}
