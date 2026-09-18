const FOOD_SERVICE_CATEGORIES = new Set([
  "restaurant",
  "american_restaurant",
  "fast_food_restaurant",
  "pizza_restaurant",
  "sandwich_shop",
  "cafe",
  "coffee_shop",
  "bakery",
  "bar",
  "pub",
  "irish_pub",
  "brewery",
  "winery",
  "food_truck",
  "ice_cream_shop",
  "dessert_shop",
  "juice_shop",
  "smoothie_shop",
  "bubble_tea_shop",
  "donut_shop",
  "donuts",
  "delicatessen",
  "bagel_shop",
  "cafeteria",
  "wine_bar",
  "cocktail_bar",
  "sports_bar",
  "gastropub",
  "salad_bar",
  "pancake_house",
  "pasta_shop",
  "pretzels",
  "tea_room",
  "gelato",
  "frozen_yoghurt_shop",
  "shaved_ice_shop",
  "bubble_tea",
  "smoothie_juice_bar",
  "desserts",
]);

type OvertureClassification = {
  categories?: { primary?: string | null; alternate?: string[] | null } | null;
  taxonomy?: { hierarchy?: string[] | null } | null;
};

/**
 * Overture's restaurant taxonomy does not put every genuine meal-serving
 * venue under the literal `restaurant` hierarchy. Pubs and breweries are the
 * common counterexample. Accept a bounded food-service category list while
 * keeping generic retail and nightlife records out of the restaurant corpus.
 */
export function isOvertureFoodServicePlace(properties: OvertureClassification): boolean {
  const primary = properties.categories?.primary;
  const isFoodService = (category: string) =>
    category.endsWith("_restaurant") || FOOD_SERVICE_CATEGORIES.has(category);

  // An explicit primary classification outranks noisy alternate tags. This
  // prevents a dentist, beach, shop, or office with an erroneous alternate
  // "cafe" label from becoming a restaurant. Records without a primary still
  // get the more permissive hierarchy/alternate fallback.
  if (primary) return isFoodService(primary);
  const hierarchy = properties.taxonomy?.hierarchy ?? [];
  if (hierarchy.includes("restaurant")) return true;
  return (properties.categories?.alternate ?? []).some(isFoodService);
}

type OvertureAddress = {
  freeform?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
};

export function normalizeOverturePlaceName(name: string, websites: string[]): string {
  const domains = websites.flatMap((value) => {
    try { return [new URL(value).hostname.toLowerCase()]; } catch { return []; }
  });
  // Some chain location pages export their page title ("City, ST (Store)") as
  // the place name. Preserve the location identity but show the actual brand.
  if (domains.some((domain) => domain === "locations.dutchbros.com")
      && /^[^,]+,\s*[a-z]{2}\s*\(.+\)$/i.test(name.trim())) {
    return "Dutch Bros Coffee";
  }
  return name.trim();
}

export function formatOvertureAddress(address: OvertureAddress | null | undefined): string | null {
  if (!address) return null;
  const street = address.freeform?.trim() ?? "";
  const locality = address.locality?.trim() ?? "";
  const regionPostal = [address.region?.trim(), address.postcode?.trim()].filter(Boolean).join(" ");
  const localityAlreadyPresent = locality
    && street.toLowerCase().includes(locality.toLowerCase());
  const parts = [street, localityAlreadyPresent ? "" : locality, regionPostal].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
