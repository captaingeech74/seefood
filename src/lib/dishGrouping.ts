import { DishPhoto } from "./types";

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
  return [...group].sort((a, b) => {
    if (b.primaryVotes !== a.primaryVotes) return b.primaryVotes - a.primaryVotes;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return group.indexOf(a) - group.indexOf(b);
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
    primary.push(best);
    variantCounts.set(best.id, group.length);
    sourceMixes.set(best.id, {
      management: group.filter((photo) => photo.attribution === "owner" && photo.source !== "user_upload" && photo.source !== "user_suggested").length,
      customers: group.filter((photo) => photo.attribution === "user" || photo.source === "user_upload" || photo.source === "user_suggested").length,
      seeFood: group.filter((photo) => photo.source === "user_upload" || photo.source === "user_suggested").length,
    });
  }
  return { primary, variantCounts, sourceMixes };
}
