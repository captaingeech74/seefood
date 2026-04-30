import { Restaurant, DishPhoto } from "./types";
import { extractPopularDishes } from "./reviewParser";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const VISION_KEY = process.env.VISION_API_KEY || API_KEY;

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
  geometry: {
    location: { lat: number; lng: number };
  };
  photos?: GooglePhoto[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: { open_now?: boolean };
}

// ── Vision API food detection ────────────────────────────────────────────────
// Requires Cloud Vision API to be enabled in the same Google Cloud project.
// To enable: https://console.cloud.google.com/apis/library/vision.googleapis.com
// If not enabled, all photos pass through unfiltered (fail-open behaviour).

// Labels whose presence strongly indicates a food/dish photo
const FOOD_SIGNAL_LABELS = new Set([
  "Food", "Cuisine", "Dish", "Baked goods", "Seafood", "Meat",
  "Vegetable", "Fruit", "Snack", "Dessert", "Drink", "Beverage",
  "Fast food", "Ingredient", "Recipe", "Meal", "Produce",
  "Comfort food", "Street food", "Finger food", "Breakfast",
  "Lunch", "Dinner", "Appetizer", "Entrée",
]);

// Labels too generic to surface as a meaningful dish name
const SKIP_AS_DISH_NAME = new Set([
  "Food", "Cuisine", "Dish", "Ingredient", "Recipe", "Meal",
  "Tableware", "Plate", "Bowl", "Table", "Restaurant", "Menu",
  "Cooking", "Kitchen utensil", "Drinkware", "Glassware",
  "Serveware", "Cutlery", "Chopsticks", "Fork", "Spoon",
  "Still life photography", "Photography", "Macro photography",
  "Close-up", "Product", "Finger food", "Produce", "Vegetable",
  "Fruit", "Meat", "Seafood", "Snack", "Ingredient", "Beverage",
  "Drink", "Breakfast", "Lunch", "Dinner", "Appetizer", "Entrée",
  "Fast food", "Comfort food", "Street food", "Baked goods",
]);

interface VisionResult {
  isFood: boolean;
  dishName: string | null;
}

async function analyzePhotosWithVision(photoUrls: string[]): Promise<VisionResult[]> {
  if (photoUrls.length === 0) return [];

  const fallback = (): VisionResult[] =>
    photoUrls.map(() => ({ isFood: true, dishName: null }));

  try {
    const requests = photoUrls.map((url) => ({
      image: { source: { imageUri: url } },
      features: [{ type: "LABEL_DETECTION", maxResults: 15 }],
    }));

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn("[Vision API] Error", res.status, err.slice(0, 200));
      return fallback();
    }

    const data = await res.json();

    return (data.responses as Array<{ labelAnnotations?: Array<{ description: string; score: number }> }>).map(
      (r) => {
        const labels = r.labelAnnotations ?? [];

        const isFood = labels.some(
          (l) => l.score > 0.65 && FOOD_SIGNAL_LABELS.has(l.description)
        );

        // Best dish name: highest-scoring label that isn't too generic
        const dishLabel = labels.find(
          (l) => l.score > 0.72 && isFood && !SKIP_AS_DISH_NAME.has(l.description)
        );

        return { isFood, dishName: dishLabel?.description ?? null };
      }
    );
  } catch (e) {
    console.warn("[Vision API] Failed, falling back to unfiltered:", e);
    return fallback();
  }
}

// ── Places API helpers ────────────────────────────────────────────────────────

export async function findNearbyRestaurant(
  lat: number,
  lng: number
): Promise<Restaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=restaurant&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.results?.length) return null;

  const place: GooglePlace = data.results[0];
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

export async function getRestaurantDetails(
  placeId: string
): Promise<Restaurant | null> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,photos,place_id,rating,user_ratings_total,price_level,opening_hours&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.result) return null;

  const place = data.result;
  return {
    id: place.place_id,
    name: place.name,
    address: place.formatted_address,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    placeId: place.place_id,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    priceLevel: place.price_level,
    isOpen: place.opening_hours?.open_now,
  };
}

export async function getGooglePhotosAndReviews(placeId: string): Promise<{
  photos: DishPhoto[];
  popularDishes: string[];
}> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos,reviews&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.result) return { photos: [], popularDishes: [] };

  const { photos = [], reviews = [] } = data.result;

  // Extract dish names from reviews
  const popularDishes = extractPopularDishes(reviews as GoogleReview[]);

  // Build candidate list (up to 20): non-portrait first, portrait appended at end.
  // Portrait = height > width. This ordering lets us assess portrait photo value
  // over time and tighten the filter later without changing the cap.
  const allPhotos = photos as GooglePhoto[];
  const nonPortrait = allPhotos.filter((p) => p.height <= p.width);
  const portrait    = allPhotos.filter((p) => p.height >  p.width);
  const candidates  = [...nonPortrait, ...portrait].slice(0, 20);

  const photoUrls = candidates.map(
    (p) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${API_KEY}`
  );

  // Run Vision API batch analysis
  const visionResults = await analyzePhotosWithVision(photoUrls);

  // Filter to food-only photos and merge dish names
  const dishPhotos: DishPhoto[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const photo = candidates[i];
    const vision = visionResults[i] ?? { isFood: true, dishName: null };

    if (!vision.isFood) continue; // skip non-food photos

    const attrText = photo.html_attributions.join(" ").toLowerCase();
    const isOwner =
      attrText.includes("owner") ||
      attrText.includes("the official") ||
      (!attrText.includes("maps.google.com/maps/contrib") && attrText.length > 0);

    dishPhotos.push({
      id: `google-${placeId}-${i}`,
      url: photoUrls[i],
      dishName: vision.dishName,
      source: "google",
      attribution: isOwner ? "owner" : "user",
      width: photo.width,
      height: photo.height,
    });
  }

  return { photos: dishPhotos, popularDishes };
}
