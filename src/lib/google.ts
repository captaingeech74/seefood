import { Restaurant, DishPhoto } from "./types";
import { extractPopularDishes } from "./reviewParser";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY!;

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

  // Build photo list
  const dishPhotos: DishPhoto[] = photos
    .slice(0, 10)
    .map((photo: GooglePhoto, i: number) => {
      // Google attributions often look like:
      // <a href="https://maps.google.com/maps/contrib/...">Name</a>
      // Owner photos sometimes have "Google" or the business name in attribution
      const attrText = photo.html_attributions.join(" ").toLowerCase();
      const isOwner =
        attrText.includes("owner") ||
        attrText.includes("the official") ||
        (!attrText.includes("maps.google.com/maps/contrib") && attrText.length > 0);

      return {
        id: `google-${placeId}-${i}`,
        url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${API_KEY}`,
        dishName: null,
        source: "google" as const,
        attribution: isOwner ? "owner" : "user",
        width: photo.width,
        height: photo.height,
      } satisfies DishPhoto;
    });

  return { photos: dishPhotos, popularDishes };
}
