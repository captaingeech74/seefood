"use client";

import { Restaurant } from "@/lib/types";

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

function PriceLevel({ level }: { level: number }) {
  const filled = "$".repeat(level);
  const empty = "$".repeat(4 - level);
  return (
    <span className="text-[11px] font-semibold">
      <span className="text-white/60">{filled}</span>
      <span className="text-white/15">{empty}</span>
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
  const hasPrice = typeof restaurant.priceLevel === "number" && restaurant.priceLevel > 0;
  const isOpen = restaurant.isOpen;

  return (
    <div
      className="sticky top-0 z-20 bg-[#0a0a0a]/96 backdrop-blur-md border-b border-white/5 px-4 pb-3"
      style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            <span className="text-[10px] text-white/35 uppercase tracking-[0.15em] font-semibold">
              You&apos;re at
            </span>
          </div>
          <h1 className="text-xl font-bold text-white leading-tight truncate">
            {restaurant.name}
          </h1>

          {/* Meta row: rating, reviews, price, open/closed */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {hasRating && (
              <div className="flex items-center gap-1">
                <span className="text-amber-400 text-[11px]">★</span>
                <span className="text-white/70 text-[11px] font-semibold">
                  {restaurant.rating!.toFixed(1)}
                </span>
                {restaurant.reviewCount ? (
                  <span className="text-white/30 text-[11px]">
                    ({formatReviewCount(restaurant.reviewCount)})
                  </span>
                ) : null}
              </div>
            )}

            {hasPrice && <PriceLevel level={restaurant.priceLevel!} />}

            {typeof isOpen === "boolean" && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                  isOpen
                    ? "bg-green-500/15 text-green-400"
                    : "bg-red-500/15 text-red-400"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </span>
            )}

            {!hasRating && (
              <p className="text-[11px] text-white/30 truncate">
                {restaurant.address}
              </p>
            )}
          </div>

          {/* Address shown below meta row when we have rating */}
          {hasRating && (
            <p className="text-[11px] text-white/25 mt-0.5 truncate">
              {restaurant.address}
            </p>
          )}
        </div>

        <button
          onClick={onChangeRestaurant}
          className="shrink-0 mt-1 bg-[#ff6b35]/10 border border-[#ff6b35]/30 text-[#ff6b35] text-[11px] font-bold px-3 py-1.5 rounded-full active:scale-95 transition-all hover:bg-[#ff6b35]/20 whitespace-nowrap"
        >
          Switch ↕
        </button>
      </div>
    </div>
  );
}
