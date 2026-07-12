"use client";

import { useMemo, useState } from "react";
import { DishPhoto } from "@/lib/types";
import DishTile from "./DishTile";

/**
 * PRD §4.2 — the landing view. Masonry grid, hero tile for #1, confidence
 * pyramid ordering (Tier 1 → Tier 2 shown, Tier 3 collapsed under "More
 * photos"). Tapping any tile opens The Reveal starting at that dish,
 * continuing through the ranked list (Tier 3 excluded unless expanded here).
 *
 * `finalized` distinguishes two real states, not just a loading spinner:
 * while streaming (stage 1 — raw, mostly-unlabeled photos), nothing is
 * confidently tiered yet, so every photo just goes tier 3 by construction —
 * applying the hero/tier-collapse layout to that would hide almost
 * everything behind "More photos" and look broken (confirmed live: this was
 * exactly what a founder walk-test flagged). So during streaming this
 * renders a flat, ungated grid of whatever's arrived so far; once stage 2
 * lands (`finalized`), it switches to the real tiered layout.
 */
export default function TopDishesGrid({
  dishes,
  loading,
  finalized,
  onOpenReveal,
}: {
  dishes: DishPhoto[];
  loading: boolean;
  finalized: boolean;
  onOpenReveal: (rankedList: DishPhoto[], startIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Dishes arrive pre-sorted by priority score from the server; bucket by
  // tier without re-sorting within each bucket.
  const { tier1, tier2, tier3 } = useMemo(
    () => ({
      tier1: dishes.filter((d) => d.tier === 1),
      tier2: dishes.filter((d) => d.tier === 2),
      tier3: dishes.filter((d) => d.tier === 3),
    }),
    [dishes]
  );

  const rankedList = useMemo(
    () => (expanded ? [...tier1, ...tier2, ...tier3] : [...tier1, ...tier2]),
    [tier1, tier2, tier3, expanded]
  );

  if (loading) {
    return (
      <div className="px-4 pt-3 pb-8">
        <div className="rounded-3xl shimmer mb-2.5" style={{ aspectRatio: "4 / 3" }} />
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl shimmer mb-2.5 break-inside-avoid"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (dishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "var(--surface-2)" }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-white/30">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
        </div>
        <p className="text-white/75 text-[15px] font-semibold mb-1">No photos yet</p>
        <p className="text-white/35 text-[13px] mb-6">We haven&apos;t found any dishes here yet.</p>
      </div>
    );
  }

  // Stage 1 — flat streaming grid. Every photo that's arrived so far, in
  // server order, no hero/tier treatment (nothing's confidently identified
  // yet so there's nothing real to tier). Tapping still opens the Reveal.
  if (!finalized) {
    return (
      <div className="px-4 pt-3 pb-12 fade-up">
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2.5">
          {dishes.map((dish, i) => (
            <DishTile key={dish.id} dish={dish} onOpen={() => onOpenReveal(dishes, i)} />
          ))}
        </div>
      </div>
    );
  }

  const hero = rankedList[0];
  const rest = rankedList.slice(1);

  return (
    <div className="px-4 pt-3 pb-12 fade-up">
      {hero && (
        <div className="mb-2.5">
          <DishTile
            dish={hero}
            hero
            onOpen={() => onOpenReveal(rankedList, 0)}
          />
        </div>
      )}

      {rest.length > 0 && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2.5">
          {rest.map((dish, i) => (
            <DishTile
              key={dish.id}
              dish={dish}
              onOpen={() => onOpenReveal(rankedList, i + 1)}
            />
          ))}
        </div>
      )}

      {!expanded && tier3.length > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full mt-4 py-3.5 rounded-2xl text-[14px] font-bold text-white/60 active:opacity-60 transition-opacity"
          style={{ background: "var(--surface-2)" }}
        >
          More photos ({tier3.length})
        </button>
      )}

      {expanded && tier3.length > 0 && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2.5 mt-4">
          {tier3.map((dish) => {
            const idx = rankedList.indexOf(dish);
            return (
              <DishTile
                key={dish.id}
                dish={dish}
                onOpen={() => onOpenReveal(rankedList, idx)}
              />
            );
          })}
        </div>
      )}

      {!hero && rest.length === 0 && tier3.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-white/50 text-[13px]">
            We found photos here, but couldn&apos;t confidently identify any dishes yet.
          </p>
        </div>
      )}

      <p className="text-center text-white/20 text-[11px] mt-6 font-medium">
        Photos via Google · Grubhub · Menufy · Restaurant
      </p>
    </div>
  );
}
