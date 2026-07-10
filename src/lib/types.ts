/** Ordering/menu platform a MenuItemData or DishPhoto was sourced from. */
export type DataSource =
  | "google"
  | "doordash"
  | "grubhub"
  | "menufy"
  | "schema_org"
  | "toast"
  | "square"
  | "clover"
  | "chownow"
  | "olo"
  | "popmenu"
  | "menu_ocr";

/**
 * A single menu item sourced from any data provider.
 * Carried through the pipeline so description and imageUrl travel
 * alongside the name and can be attached to a matched DishPhoto.
 */
export interface MenuItemData {
  name: string;
  description?: string;
  imageUrl?: string;    // photo URL when the source already provides one
  price?: number;       // captured for the corpus; NEVER displayed in the UI
  source?: DataSource;  // which platform this item was extracted from
}

export interface DishPhoto {
  id: string;
  url: string;
  dishName: string | null;
  dishDescription: string | null; // menu item description when available
  /** true = matched against the restaurant's actual menu (fuzzy or exact) */
  isMenuMatch: boolean;
  /** where this photo came from */
  source: DataSource;
  /** who contributed it — "owner" = restaurant/management, "user" = customer */
  attribution: "user" | "owner";
  /** confidence pyramid (PRD §4.2/§4.3): 1 = menu-matched/pre-labeled (hero-eligible),
   *  2 = confident AI-identified, 3 = low-confidence — collapsed under "More photos". */
  tier: 1 | 2 | 3;
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
  rating?: number;
  reviewCount?: number;
  priceLevel?: number; // 0–4
  isOpen?: boolean;
}

export interface DishesResponse {
  dishes: DishPhoto[];
  popularDishes: string[]; // dish names extracted from reviews, shown as chips
}
