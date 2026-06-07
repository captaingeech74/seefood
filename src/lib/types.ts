/**
 * A single menu item sourced from any data provider.
 * Carried through the pipeline so description and imageUrl travel
 * alongside the name and can be attached to a matched DishPhoto.
 */
export interface MenuItemData {
  name: string;
  description?: string; // sourced from Places v1, schema.org, DoorDash, etc.
  imageUrl?: string;    // photo URL when the source already provides one (schema.org, DoorDash)
}

export interface DishPhoto {
  id: string;
  url: string;
  dishName: string | null;
  dishDescription: string | null; // menu item description when available
  /** true = matched against the restaurant's actual menu (fuzzy or exact) */
  isMenuMatch: boolean;
  /** where this photo came from */
  source: "google" | "yelp" | "doordash" | "website" | "grubhub";
  /** who contributed it — "owner" = restaurant/management, "user" = customer */
  attribution: "user" | "owner";
  width: number;
  height: number;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  yelpId?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number; // 0–4
  isOpen?: boolean;
}

export interface DishesResponse {
  dishes: DishPhoto[];
  popularDishes: string[]; // dish names extracted from reviews, shown as chips
}
