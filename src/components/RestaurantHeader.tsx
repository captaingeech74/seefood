"use client";

import { useMemo, useState } from "react";
import { DishPhoto, Restaurant } from "@/lib/types";
import { dedupeToPrimary } from "@/lib/dishGrouping";
import { formatAddress } from "@/lib/labels";

/** Bolds the matched substring inside a search result name. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-white font-bold">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

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
  dishes,
  onChangeRestaurant,
  onSuggestDish,
  onOpenReveal,
}: {
  restaurant: Restaurant | null;
  /** Raw (undeduped) dish photo pool — deduped here to one entry per dish name for the search list. */
  dishes: DishPhoto[];
  onChangeRestaurant: () => void;
  /** Opens the Add-Missing-Dish modal; optionally prefilled with a dish name (e.g. a failed search query). */
  onSuggestDish: (initialName?: string) => void;
  /** Same signature TopDishesGrid uses — jumps straight into the Reveal at the matched dish. */
  onOpenReveal: (list: DishPhoto[], index: number, allPhotos: DishPhoto[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const { primary } = useMemo(() => dedupeToPrimary(dishes), [dishes]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return primary.filter((d) => d.dishName?.toLowerCase().includes(q));
  }, [primary, query]);

  if (!restaurant) return null;

  const hasRating = typeof restaurant.rating === "number";
  const hasPrice = typeof restaurant.priceLevel === "number" && restaurant.priceLevel > 0;
  const isOpen = restaurant.isOpen;
  const hasStats = hasRating || hasPrice || typeof isOpen === "boolean";

  return (
    <header
      className="sticky top-0 z-20 glass border-b border-[var(--border-subtle)] px-4 pb-3"
      // Higher-opacity glass than the default 0.72: grid text scrolling
      // beneath must never be readable through the header, even in
      // environments that support backdrop-filter but degrade the blur.
      style={{ paddingTop: "max(14px, env(safe-area-inset-top))", background: "rgba(10,10,10,0.92)" }}
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

        <div className="flex items-center gap-1.5">
          <a
            href={`/pulse?lat=${restaurant.lat}&lng=${restaurant.lng}`}
            className="relative hit-target w-8 h-8 rounded-full flex items-center justify-center text-white/28 active:bg-white/8"
            aria-label="Open development coverage analytics"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
            </svg>
          </a>
          <button
            onClick={onChangeRestaurant}
            className="hit-target relative flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full active:scale-95 transition-transform shrink-0"
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
      </div>

      {/* Restaurant name — tap toggles the address/rating section below */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-2 max-w-full -ml-2 pl-2 pr-2.5 py-2 rounded-xl active:scale-[0.98] active:bg-white/8 transition-all"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide restaurant details" : "Show restaurant details"}
      >
        <h1 className="text-[23px] font-bold text-white leading-[1.15] tracking-[-0.015em] truncate">
          {restaurant.name}
        </h1>
        <span
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "var(--accent-soft)" }}
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--accent)", transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 220ms var(--ease-standard)" }}
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </span>
      </button>

      {/* Stats row — always visible (rating, price, open-now). Only the
          address is hidden by default; Kyle: "you should only hide the
          address. Pull back out the ratings and dollar signs and if it's
          open now." Segmented stat-card treatment (subtle background +
          hairline dividers between segments) instead of loose inline text
          with "·" separators — reads as one cohesive unit at a glance. */}
      {hasStats && (
        <div
          className="flex items-stretch mt-2 rounded-xl overflow-hidden w-fit"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
        >
          {hasRating && (
            <div className="flex items-center gap-1 px-2.5 py-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400 shrink-0">
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
          {hasPrice && hasRating && <div className="w-px my-1.5" style={{ background: "var(--border-soft)" }} />}
          {hasPrice && (
            <div className="flex items-center px-2.5 py-1.5">
              <PriceLevel level={restaurant.priceLevel!} />
            </div>
          )}
          {(hasRating || hasPrice) && typeof isOpen === "boolean" && (
            <div className="w-px my-1.5" style={{ background: "var(--border-soft)" }} />
          )}
          {typeof isOpen === "boolean" && (
            <div className="flex items-center px-2.5 py-1.5">
              <span
                className={`flex items-center gap-1 text-[10px] font-bold uppercase ${
                  isOpen ? "text-emerald-400" : "text-rose-400"
                }`}
                style={{ letterSpacing: "0.08em" }}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-emerald-400" : "bg-rose-400"}`} />
                {isOpen ? "Open Now" : "Closed"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Address + dish search — hidden by default, revealed by the chevron
          above. The search box gets real room here rather than being
          squeezed into the header proper: type a few letters and jump
          straight into the Reveal at that dish, without scrolling the grid
          to find it. */}
      {expanded && (
        <div className="mt-3 fade-in">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <p className="text-[12px] text-white/35 truncate font-medium">
              {formatAddress(restaurant.address)}
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.address || restaurant.name)}${restaurant.placeId ? `&destination_place_id=${restaurant.placeId}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hit-target relative shrink-0 flex items-center gap-1 text-[12px] font-bold"
              style={{ color: "var(--accent)" }}
            >
              Directions
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          </div>
          <div className="relative mb-2">
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              style={{ left: 12 }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes…"
              className="w-full rounded-xl text-white text-[14px] font-medium outline-none focus:ring-2 focus:ring-[var(--accent-ring)] placeholder:text-white/30"
              style={{
                background: "var(--surface-2)",
                paddingLeft: 36,
                paddingRight: 32,
                paddingTop: 10,
                paddingBottom: 10,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="hit-target absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white/50 active:bg-white/10"
                style={{ right: 10 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {query.trim() && (
            <div
              className="mb-3 max-h-60 overflow-y-auto no-scrollbar rounded-xl fade-in"
              style={{
                background: "var(--surface-1)",
                maskImage: matches.length > 4 ? "linear-gradient(to bottom, black calc(100% - 20px), transparent)" : undefined,
              }}
            >
              {matches.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-white/50 text-[13px] mb-2.5">
                    No dishes match &ldquo;{query}&rdquo;
                  </p>
                  <button
                    onClick={() => {
                      onSuggestDish(query.trim());
                      setQuery("");
                      setExpanded(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-bold text-white active:scale-95 transition-transform"
                    style={{ background: "var(--accent)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add it as a missing dish
                  </button>
                </div>
              ) : (
                matches.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      const i = primary.findIndex((p) => p.id === d.id);
                      onOpenReveal(primary, Math.max(i, 0), dishes);
                      setQuery("");
                      setExpanded(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 min-h-[48px] active:bg-white/8 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0" style={{ background: "var(--surface-2)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-white/70 text-[13.5px] font-semibold truncate text-left">
                      <HighlightMatch text={d.dishName ?? ""} query={query} />
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex justify-end mt-2.5">
            <button
              onClick={() => onSuggestDish()}
              className="hit-target relative flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full active:scale-95 transition-transform shrink-0"
              style={{ background: "var(--accent)" }}
              aria-label="Add a missing photo or menu item"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="text-[12.5px] font-bold text-white whitespace-nowrap">
                Add a Missing Photo or Menu Item
              </span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
