import { DishPhoto } from "./types";
import { heroScore, withPhotoSignals } from "./photoSignals";

/** Grouping key — unnamed (unidentified) photos are never grouped with each other, each stays its own entry. */
function dishKey(photo: DishPhoto): string {
  return photo.dishName ? photo.dishName.toLowerCase().trim() : `__unnamed-${photo.id}`;
}

/**
 * Which of a group of same-dish photo variants should represent the dish —
 * shared by dedupeToPrimary (grid tile selection) and Reveal (identifying
 * which variant is currently "primary" so the thumbs-up-to-promote control
 * only shows on the others). Most votes wins, tier as tiebreaker, then
 * original order.
 */
export function pickPrimary(group: DishPhoto[]): DishPhoto {
  const signaled = group.map(withPhotoSignals);
  return [...signaled].sort((a, b) => {
    if (b.primaryVotes !== a.primaryVotes) return b.primaryVotes - a.primaryVotes;
    const qualityDelta = (b.photoQualityScore ?? 0) - (a.photoQualityScore ?? 0);
    if (qualityDelta !== 0) return qualityDelta;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return signaled.indexOf(a) - signaled.indexOf(b);
  })[0];
}

/**
 * Collapses `photos` to one representative tile per distinct dish name —
 * the grid was showing "Mushroom Pizza" twice because it had two photos and
 * nothing deduped by name before tiering. The representative is whichever
 * same-dish variant has the most thumbs-up votes (see incrementPrimaryVotes
 * in db.ts — browsing variants in the Reveal lets diners promote which
 * photo should represent the dish), tier as the next tiebreaker, then
 * original (server priority-score) order. Returns the deduped list in
 * original first-occurrence order, plus a variant-count map keyed by the
 * representative's id, for the grid's "multiple photos" badge.
 */
export interface DishSourceMix {
  management: number;
  customers: number;
  seeFood: number;
}

export function dedupeToPrimary(photos: DishPhoto[]): {
  primary: DishPhoto[];
  variantCounts: Map<string, number>;
  sourceMixes: Map<string, DishSourceMix>;
} {
  const groups = new Map<string, DishPhoto[]>();
  const order: string[] = [];
  photos.forEach((p) => {
    const key = dishKey(p);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(p);
  });

  const primary: DishPhoto[] = [];
  const variantCounts = new Map<string, number>();
  const sourceMixes = new Map<string, DishSourceMix>();
  for (const key of order) {
    const group = groups.get(key)!;
    const best = pickPrimary(group);
    const management = group.filter((photo) => withPhotoSignals(photo).photoAuthorType === "management").length;
    const customers = group.filter((photo) => withPhotoSignals(photo).photoAuthorType === "customer").length;
    const comparisonReady = management > 0 && customers > 0;
    const signaledBest = { ...best, comparisonReady };
    primary.push(signaledBest);
    variantCounts.set(signaledBest.id, group.length);
    sourceMixes.set(signaledBest.id, {
      management,
      customers,
      seeFood: group.filter((photo) => photo.source === "user_upload" || photo.source === "user_suggested").length,
    });
  }
  primary.sort((a, b) => {
    const scoreDelta = heroScore(b, variantCounts.get(b.id) ?? 1) - heroScore(a, variantCounts.get(a.id) ?? 1);
    if (scoreDelta !== 0) return scoreDelta;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return order.indexOf(dishKey(a)) - order.indexOf(dishKey(b));
  });
  return { primary, variantCounts, sourceMixes };
}
