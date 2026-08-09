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
  const hierarchy = properties.taxonomy?.hierarchy ?? [];
  if (hierarchy.includes("restaurant")) return true;
  const categories = [
    properties.categories?.primary,
    ...(properties.categories?.alternate ?? []),
  ].filter((category): category is string => Boolean(category));
  return categories.some((category) => FOOD_SERVICE_CATEGORIES.has(category));
}

type OvertureAddress = {
  freeform?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
};

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
