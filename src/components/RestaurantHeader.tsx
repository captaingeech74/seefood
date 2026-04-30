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
    <span className="text-[11px] font-semibold tracking-tight">
      <span className="text-white/55">{filled}</span>
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
  const hasPrice =
    typeof restaurant.priceLevel === "number" && restaurant.priceLevel > 0;
  const isOpen = restaurant.isOpen;

  return (
    <div
      className="sticky top-0 z-20 bg-[#0a0a0a]/96 backdrop-blur-md border-b border-white/[0.06] px-4 pb-3"
      style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
    >
      {/* YOU'RE AT label */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        <span className="text-[9px] text-white/30 uppercase tracking-[0.18em] font-semibold">
          You&apos;re at
        </span>
      </div>

      {/* Restaurant name — full width, no button competing */}
      <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight truncate">
        {restaurant.name}
      </h1>

      {/* Meta row: rating · price · open/closed */}
      {(hasRating || hasPrice || typeof isOpen === "boolean") && (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {hasRating && (
            <div className="flex items-center gap-1">
              <span className="text-amber-400 text-[12px]">★</span>
              <span className="text-white/75 text-[12px] font-semibold">
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
                  ? "bg-green-500/12 text-green-400"
                  : "bg-red-500/12 text-red-400"
              }`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          )}
        </div>
      )}

      {/* Address line + inline "Not here?" trigger */}
      <div className="flex items-center gap-1.5 mt-1 min-w-0">
        <p className="text-[11px] text-white/22 truncate flex-1 min-w-0">
          {restaurant.address}
        </p>
        <button
          onClick={onChangeRestaurant}
          className="shrink-0 text-[#ff6b35] text-[11px] font-semibold active:opacity-60 transition-opacity hover:text-[#ff8555] whitespace-nowrap"
        >
          Not here?
        </button>
      </div>
    </div>
  );
}
