export interface VisionLabel {
  name: string;
  confidence: number;
}

export type VisionFoodDecision = "food" | "reject" | "uncertain";

const FOOD_LABELS = new Set([
  "food", "appetizer", "baked_goods", "barbecue", "bread", "breakfast",
  "burger", "burrito", "cake", "cereal", "cheese", "chicken", "cookie",
  "curry", "dessert", "dumpling", "falafel", "fries", "fried_chicken",
  "fruit", "hot_dog", "ice_cream", "meat", "noodle", "pancake", "pasta",
  "pastry", "pizza", "rice", "salad", "sandwich", "seafood", "soup",
  "steak", "sushi", "taco", "tortilla", "vegetable", "waffle",
]);

const HARD_REJECT_LABELS = new Set([
  "adult", "art", "artwork", "building", "cat", "clothing", "dog",
  "bottle", "document", "drawing", "exterior", "frame", "furniture", "illustrations",
  "interior", "lingerie", "map", "menu", "nudity", "people", "person",
  "portrait", "printed_page", "room", "screenshot", "sign", "storefront",
  "swimwear", "text", "text_heavy", "television",
]);

const NAME_STOPWORDS = new Set([
  "and", "bar", "cafe", "coffee", "company", "eatery", "food", "grill",
  "house", "kitchen", "restaurant", "the", "tavern", "temecula", "carlsbad",
  "spokane", "diego", "cabo", "san", "los",
]);

export function normalizeEvidenceText(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function distinctiveNameTokens(name: string): string[] {
  return normalizeEvidenceText(name).split(" ")
    .filter((token) => token.length >= 3 && !NAME_STOPWORDS.has(token));
}

export function hasRestaurantIdentityInUrl(name: string, ...urls: Array<string | null | undefined>): boolean {
  const tokens = distinctiveNameTokens(name);
  if (!tokens.length) return false;
  const haystack = normalizeEvidenceText(urls.filter(Boolean).join(" ")).replace(/ /g, "");
  return tokens.some((token) => haystack.includes(token));
}

export function decideLocalFoodVision(labels: VisionLabel[]): VisionFoodDecision {
  const normalized = labels.map((label) => ({
    name: normalizeEvidenceText(label.name).replace(/ /g, "_"),
    confidence: Number(label.confidence),
  }));
  const food = Math.max(0, ...normalized.filter((label) => FOOD_LABELS.has(label.name)).map((label) => label.confidence));
  const explicit = Math.max(0, ...normalized.filter((label) =>
    ["adult", "lingerie", "nudity", "swimwear"].includes(label.name)
  ).map((label) => label.confidence));
  const nonFood = Math.max(0, ...normalized.filter((label) => HARD_REJECT_LABELS.has(label.name)).map((label) => label.confidence));

  // A positive food signal must be strong in its own right. Strong explicit,
  // document, person, interior, merchandise, or building evidence wins over
  // incidental food/tableware labels. Ambiguity stays unpublished.
  const textHeavy = Math.max(0, ...normalized.filter((label) => label.name === "text_heavy").map((label) => label.confidence));
  const sceneContext = Math.max(0, ...normalized.filter((label) => ["structure", "wood_processed"].includes(label.name)).map((label) => label.confidence));
  if (explicit >= 0.05 || textHeavy >= 0.5 || (nonFood >= 0.55 && food < 0.90)) return "reject";
  if (food < 0.85 && sceneContext >= 0.70 && food - sceneContext < 0.08) return "uncertain";
  if (food >= 0.55 && nonFood < 0.55) return "food";
  return "uncertain";
}

export function selectCoverageFirstCandidates<T extends {
  restaurantId: string;
  contentHash: string;
  dishLinked: boolean;
  score: number;
}>(candidates: T[], maxPerRestaurant = 3): T[] {
  const selected: T[] = [];
  const counts = new Map<string, number>();
  const restaurantLevelCounts = new Map<string, number>();
  const hashes = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) =>
    Number(b.dishLinked) - Number(a.dishLinked) || b.score - a.score
  )) {
    if (hashes.has(`${candidate.restaurantId}|${candidate.contentHash}`)) continue;
    const count = counts.get(candidate.restaurantId) ?? 0;
    const unmatched = restaurantLevelCounts.get(candidate.restaurantId) ?? 0;
    if (count >= maxPerRestaurant || (!candidate.dishLinked && unmatched >= 1)) continue;
    selected.push(candidate);
    hashes.add(`${candidate.restaurantId}|${candidate.contentHash}`);
    counts.set(candidate.restaurantId, count + 1);
    if (!candidate.dishLinked) restaurantLevelCounts.set(candidate.restaurantId, unmatched + 1);
  }
  return selected;
}
