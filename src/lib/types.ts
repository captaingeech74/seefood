export interface DishPhoto {
  id: string;
  url: string;
  dishName: string | null;
  /** true = verbatim match against the restaurant's menu or known popular dishes */
  isMenuMatch: boolean;
  source: "google" | "yelp";
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
  priceLevel?: number; // 0-4
  isOpen?: boolean;
}

export interface DishesResponse {
  dishes: DishPhoto[];
  popularDishes: string[]; // dish names extracted from reviews, shown as chips
}
