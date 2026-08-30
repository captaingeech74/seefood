import type { DataSource, DishPhoto, PhotoAuthorType } from "./types";

const SEEFOOD_SOURCES = new Set<DataSource>(["user_upload", "user_suggested"]);
const MANAGEMENT_SOURCES = new Set<DataSource>([
  "doordash",
  "grubhub",
  "menufy",
  "schema_org",
  "toast",
  "square",
  "clover",
  "chownow",
  "olo",
  "popmenu",
  "bentobox",
  "owner",
  "spothopper",
  "slice",
  "flipdish",
  "lightspeed",
  "gloriafood",
  "common_crawl",
  "official_social",
  "merchant",
]);

export function normalizePhotoAuthor(
  source: DataSource,
  legacyAttribution?: "user" | "owner" | null
): PhotoAuthorType {
  if (SEEFOOD_SOURCES.has(source)) return "customer";
  if (MANAGEMENT_SOURCES.has(source)) return "management";
  if (legacyAttribution === "owner") return "management";
  if (legacyAttribution === "user") return "customer";
  return "unknown";
}

export function trustLabel(source: DataSource, authorType: PhotoAuthorType): DishPhoto["trustLabel"] {
  if (SEEFOOD_SOURCES.has(source)) return "seefood_photo";
  if (authorType === "management") return "management_photo";
  if (authorType === "customer") return "customer_photo";
  if (source === "google") return "google_photo";
  return "web_photo";
}

export function defaultPhotoQuality(input: {
  tier: 1 | 2 | 3;
  width: number;
  height: number;
  source: DataSource;
  isMenuMatch: boolean;
}): number {
  const ratio = input.height > 0 ? input.width / input.height : 1;
  const framing = ratio >= 0.72 && ratio <= 1.8 ? 8 : ratio >= 0.5 && ratio <= 2.2 ? 4 : 0;
  const sourceConfidence = SEEFOOD_SOURCES.has(input.source) ? 8 : MANAGEMENT_SOURCES.has(input.source) ? 6 : 3;
  const score = 34 + (4 - input.tier) * 12 + framing + sourceConfidence + (input.isMenuMatch ? 8 : 0);
  return Math.min(100, Math.max(0, score));
}

export function heroScore(photo: DishPhoto, variantCount = 1): number {
  if (!photo.dishName || photo.isStorefront || photo.isMenuPhoto || photo.isHeroCandidate === false) return 0;

  const quality = photo.photoQualityScore ?? defaultPhotoQuality(photo);
  const popularity = photo.dishPopularityScore ?? 0;
  const validation = Math.min(10, photo.loveCount * 1.5 + photo.primaryVotes * 2);
  const breadth = Math.min(8, Math.max(0, variantCount - 1) * 2);
  const menuConfidence = photo.isMenuMatch ? 14 : photo.tier === 1 ? 9 : photo.tier === 2 ? 4 : 0;
  const realCustomerBonus = photo.photoAuthorType === "customer" ? 3 : 0;

  return Math.round(
    Math.min(100, quality * 0.36 + popularity * 0.29 + validation + breadth + menuConfidence + realCustomerBonus)
  );
}

export function withPhotoSignals(photo: DishPhoto): DishPhoto {
  const photoAuthorType = photo.photoAuthorType ?? normalizePhotoAuthor(photo.source, photo.attribution);
  const photoQualityScore = photo.photoQualityScore ?? defaultPhotoQuality(photo);
  return {
    ...photo,
    sourcePlatform: photo.sourcePlatform ?? photo.source,
    photoAuthorType,
    trustLabel: photo.trustLabel ?? trustLabel(photo.source, photoAuthorType),
    photoQualityScore,
    dishPopularityScore: photo.dishPopularityScore ?? 0,
    isHeroCandidate:
      photo.isHeroCandidate ??
      (!!photo.dishName && photo.isMenuPhoto !== true && photo.isStorefront !== true && photoQualityScore >= 55),
    isStorefront: photo.isStorefront ?? false,
    isMenuPhoto: photo.isMenuPhoto ?? false,
    comparisonReady: photo.comparisonReady ?? false,
    moderationStatus: photo.moderationStatus ?? "approved",
  };
}
