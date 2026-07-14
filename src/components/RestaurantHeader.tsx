"use client";

import { useState } from "react";
import { Restaurant } from "@/lib/types";

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

function PriceLevel({ level }: { level: number }) {
  return (
    <span className="text-[12px] font-bold tracking-tight" aria-label={`Price level ${level} of 4`}>
      <span className="text-white/65">{"$".repeat(level)}</span>
      <span className="text-white/15">{"$".repeat(4 - level)}</span>
    </span>
  );
}

/**
 * Two distinct controls, each with one job (previously both the name and a
 * "Not the right place?" row triggered Map Explore, which is why the old
 * chevron next to the name was confusing):
 * - "Change Restaurant" pill (top-right, next to the eyebrow) — opens Map
 *   Explore. Map-pin icon + solid accent background + white text so it
 *   unambiguously reads as a button, not a label.
 * - Restaurant name + chevron — toggles the address/rating section below,
 *   hidden by default so the header stays compact.
 */
export default function RestaurantHeader({
  restaurant,
  onChangeRestaurant,
}: {
  restaurant: Restaurant | null;
  onChangeRestaurant: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!restaurant) return null;

  const hasRating = typeof restaurant.rating === "number";
  const hasPrice = typeof restaurant.priceLevel === "number" && restaurant.priceLevel > 0;
  const isOpen = restaurant.isOpen;
  const hasStats = hasRating || hasPrice || typeof isOpen === "boolean";

  return (
    <header
      className="sticky top-0 z-20 glass border-b border-[var(--border-subtle)] px-4 pb-3"
      style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
    >
      {/* Top row: "YOU'RE AT" eyebrow + Change Restaurant pill */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative w-1.5 h-1.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-emerald-400 dot-pulse" />
          </div>
          <span className="text-[9.5px] text-white/35 uppercase tracking-[0.22em] font-bold">
            You&apos;re at
          </span>
        </div>

        <button
          onClick={onChangeRestaurant}
          className="flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full active:scale-95 transition-transform shrink-0"
          style={{ background: "var(--accent)" }}
          aria-label="Change restaurant — open map"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span className="text-[12.5px] font-bold text-white whitespace-nowrap">
            Change Restaurant
          </span>
        </button>
      </div>

      {/* Restaurant name — tap toggles the address/rating section below */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-2 max-w-full -ml-2 pl-2 pr-2.5 py-1 rounded-xl active:scale-[0.98] active:bg-white/8 transition-all"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide restaurant details" : "Show restaurant details"}
      >
        <h1 className="text-[23px] font-bold text-white leading-[1.15] tracking-[-0.015em] truncate">
          {restaurant.name}
        </h1>
        <span
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "var(--accent-soft)" }}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--accent)", transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 220ms var(--ease-standard)" }}
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </span>
      </button>

      {/* Address + stats — hidden by default, revealed by the chevron above */}
      {expanded && (
        <div className="mt-1.5 fade-in">
          <p className="text-[12px] text-white/35 truncate font-medium">
            {restaurant.address}
          </p>

          {hasStats && (
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              {hasRating && (
                <div className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                    <path d="M12 2 14.6 8.6 22 9.5l-5.4 5L18 22l-6-3.5L6 22l1.4-7.5L2 9.5l7.4-.9L12 2z"/>
                  </svg>
                  <span className="text-white/85 text-[13px] font-bold tabular-nums">
                    {restaurant.rating!.toFixed(1)}
                  </span>
                  {restaurant.reviewCount ? (
                    <span className="text-white/35 text-[12px] font-medium tabular-nums">
                      ({formatReviewCount(restaurant.reviewCount)})
                    </span>
                  ) : null}
                </div>
              )}
              {hasPrice && hasRating && <span className="text-white/15 text-[10px]">·</span>}
              {hasPrice && <PriceLevel level={restaurant.priceLevel!} />}
              {typeof isOpen === "boolean" && (
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    isOpen ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                  }`}
                  style={{ letterSpacing: "0.08em" }}
                >
                  {isOpen ? "Open Now" : "Closed"}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
