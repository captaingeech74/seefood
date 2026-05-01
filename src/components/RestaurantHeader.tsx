"use client";

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

export default function RestaurantHeader({
  restaurant,
  onChangeRestaurant,
}: {
  restaurant: Restaurant | null;
  onChangeRestaurant: () => void;
}) {
  if (!restaurant) return null;

  const hasRating = typeof restaurant.rating === "number";
  const hasPrice =
    typeof restaurant.priceLevel === "number" && restaurant.priceLevel > 0;
  const isOpen = restaurant.isOpen;

  return (
    <header
      className="sticky top-0 z-20 glass border-b border-[var(--border-subtle)] px-4 pb-3"
      style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
    >
      {/* Eyebrow with location dot */}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="relative w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-emerald-400 dot-pulse" />
        </div>
        <span className="text-[9.5px] text-white/35 uppercase tracking-[0.22em] font-bold">
          You&apos;re at
        </span>
      </div>

      {/* Restaurant name — large, confident */}
      <h1 className="text-[23px] font-bold text-white leading-[1.15] tracking-[-0.015em] truncate">
        {restaurant.name}
      </h1>

      {/* Stats row — rating · price · open status */}
      {(hasRating || hasPrice || typeof isOpen === "boolean") && (
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

          {hasPrice && hasRating && (
            <span className="text-white/15 text-[10px]">·</span>
          )}
          {hasPrice && <PriceLevel level={restaurant.priceLevel!} />}

          {typeof isOpen === "boolean" && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isOpen
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
              style={{ letterSpacing: "0.08em" }}
            >
              {isOpen ? "Open Now" : "Closed"}
            </span>
          )}
        </div>
      )}

      {/* Address + change CTA */}
      <div className="flex items-center gap-2 mt-1.5 min-w-0">
        <p className="text-[12px] text-white/35 truncate flex-1 min-w-0 font-medium">
          {restaurant.address}
        </p>
        <button
          onClick={onChangeRestaurant}
          className="shrink-0 text-[var(--accent)] text-[12px] font-bold active:opacity-60 hover:text-[var(--accent-hover)] whitespace-nowrap transition-colors flex items-center gap-1"
        >
          Not here?
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
