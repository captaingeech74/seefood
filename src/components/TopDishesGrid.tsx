"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DishPhoto } from "@/lib/types";
import { dedupeToPrimary } from "@/lib/dishGrouping";
import DishTile, { tileBadge } from "./DishTile";

const INITIAL_VISIBLE = 30;
const BATCH_SIZE = 20;
const MAX_VISIBLE = 100;

/**
 * PRD §4.2 — the landing view. Masonry grid, hero tile for #1, confidence
 * pyramid ordering (Tier 1 → Tier 2 → Tier 3, all reachable by scrolling —
 * no manual "expand" gate). Tapping any tile opens The Reveal starting at
 * that dish, continuing vertically through the ranked list (deduped, so a
 * dish never appears twice) while still able to browse that dish's OTHER
 * photos horizontally (the undeduped `dishes` pool, passed through as
 * `onOpenReveal`'s third argument).
 *
 * One tile per distinct dish name (see dedupeToPrimary) — a dish with two
 * photos used to show up as two separate grid tiles, which read as two
 * different dishes. The representative photo shown is whichever variant has
 * the most thumbs-up votes from diners browsing the Reveal's horizontal
 * same-dish carousel, so the grid's primary photo improves over time.
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
  resetKey,
  onOpenReveal,
}: {
  dishes: DishPhoto[];
  loading: boolean;
  finalized: boolean;
  /** Restaurant identity (e.g. placeId) — visible-count resets only when this changes, not on every dish-list mutation (e.g. a diner adding a missing dish shouldn't collapse the scroll position). */
  resetKey: string;
  onOpenReveal: (rankedList: DishPhoto[], startIndex: number, allPhotos: DishPhoto[]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [resetKey]);

  // Dishes arrive pre-sorted by priority score from the server; dedupe to
  // one tile per dish, then bucket by tier without re-sorting within each.
  const { primary, variantCounts } = useMemo(() => dedupeToPrimary(dishes), [dishes]);

  const { tier1, tier2, tier3 } = useMemo(
    () => ({
      tier1: primary.filter((d) => d.tier === 1),
      tier2: primary.filter((d) => d.tier === 2),
      tier3: primary.filter((d) => d.tier === 3),
    }),
    [primary]
  );

  // Continuous scroll through the whole confidence pyramid — tier1, then
  // tier2, then tier3 — rather than a manual "More photos" click gate.
  const rankedList = useMemo(() => [...tier1, ...tier2, ...tier3], [tier1, tier2, tier3]);

  // A provenance badge stamped on most of the grid is the restaurant's norm,
  // not signal (LRay's: everything "From management") — suppress the label
  // when it would appear on more than half the tiles, so only the
  // exceptional provenance stands out.
  const hiddenBadge = useMemo(() => {
    if (primary.length < 4) return null;
    const counts = new Map<string, number>();
    for (const d of primary) {
      const b = tileBadge(d);
      if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    for (const [label, n] of counts) {
      if (n > primary.length / 2) return label;
    }
    return null;
  }, [primary]);
  const maxVisible = Math.min(rankedList.length, MAX_VISIBLE);
  const canGrow = visibleCount < maxVisible;

  // IntersectionObserver is the primary trigger, but some WebView/browser
  // combinations are unreliable about firing it reliably (confirmed one
  // such environment while building this) — a plain scroll-position check
  // is a robust fallback that doesn't depend on IO semantics at all, and at
  // this list size (max 100 items) the extra scroll listener costs nothing
  // measurable.
  useEffect(() => {
    if (!canGrow) return;
    const el = sentinelRef.current;
    if (!el) return;

    const tryGrow = () => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 600) {
        setVisibleCount((v) => Math.min(v + BATCH_SIZE, MAX_VISIBLE));
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => Math.min(v + BATCH_SIZE, MAX_VISIBLE));
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);

    window.addEventListener("scroll", tryGrow, { passive: true });
    window.addEventListener("resize", tryGrow);
    tryGrow(); // covers the case where the sentinel is already on-screen at mount

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", tryGrow);
      window.removeEventListener("resize", tryGrow);
    };
  }, [canGrow]);

  if (loading) {
    return (
      <div className="px-4 pt-3 pb-8">
        <div className="rounded-3xl shimmer mb-2.5" style={{ aspectRatio: "4 / 3" }} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 items-start gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl shimmer"
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

  // Stage 1 — flat streaming grid. Every distinct dish that's arrived so
  // far, in server order, no hero/tier treatment (nothing's confidently
  // identified yet so there's nothing real to tier). Tapping still opens
  // the Reveal.
  if (!finalized) {
    return (
      <div className="px-4 pt-3 pb-12 fade-up">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 items-start gap-2.5">
          {primary.map((dish, i) => (
            <DishTile
              key={dish.id}
              dish={dish}
              variantCount={variantCounts.get(dish.id) ?? 1}
              hiddenBadge={hiddenBadge}
              onOpen={() => onOpenReveal(primary, i, dishes)}
            />
          ))}
        </div>
      </div>
    );
  }

  const hero = rankedList[0];
  const visibleRest = rankedList.slice(1, visibleCount);

  return (
    <div className="px-4 pt-3 pb-12 fade-up">
      {hero && (
        <div className="mb-2.5">
          <DishTile
            dish={hero}
            hero
            variantCount={variantCounts.get(hero.id) ?? 1}
              hiddenBadge={hiddenBadge}
            onOpen={() => onOpenReveal(rankedList, 0, dishes)}
          />
        </div>
      )}

      {visibleRest.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 items-start gap-2.5">
          {visibleRest.map((dish, i) => (
            <DishTile
              key={dish.id}
              dish={dish}
              variantCount={variantCounts.get(dish.id) ?? 1}
              hiddenBadge={hiddenBadge}
              onOpen={() => onOpenReveal(rankedList, i + 1, dishes)}
            />
          ))}
        </div>
      )}

      {canGrow && <div ref={sentinelRef} className="h-1" aria-hidden />}

      {!hero && visibleRest.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-white/50 text-[13px]">
            We found photos here, but couldn&apos;t confidently identify any dishes yet.
          </p>
        </div>
      )}

      <p
        className="text-center text-white/30 text-[11px] mt-6 font-medium"
        style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
      >
        Photos via Google · Grubhub · Menufy · Restaurant
      </p>
    </div>
  );
}
