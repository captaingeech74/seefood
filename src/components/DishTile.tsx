"use client";

import { DishPhoto } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/labels";
import { useEffect, useRef, useState } from "react";

/** PRD §4.2/§4.3 provenance badge — one of three labels per dish. */
export function provenanceLabel(dish: DishPhoto): string {
  if (dish.isMenuMatch) return "Menu Match";
  if (dish.attribution === "owner") return "From management";
  return "Spotted here";
}

/**
 * Which provenance badge a tile WOULD earn in the grid. Menu-match is the
 * baseline expectation ("this is a menu dish") so it never badges a tile;
 * management-provided and diner-contributed photos are the differentiating
 * cases. The grid then suppresses whichever label is the MAJORITY for the
 * current restaurant (see TopDishesGrid) — a badge repeated on nearly every
 * tile is the house norm, not information. The Reveal still shows full
 * provenance for every photo.
 */
export function tileBadge(dish: DishPhoto): string | null {
  if (dish.attribution === "owner") return "From management";
  if (dish.source === "user_upload" || dish.source === "user_suggested") return "Spotted here";
  return null;
}

export default function DishTile({
  dish,
  hero = false,
  variantCount = 1,
  hiddenBadge = null,
  onOpen,
}: {
  dish: DishPhoto;
  hero?: boolean;
  /** How many photos exist of this same dish — renders a small "multiple photos" badge when > 1. */
  variantCount?: number;
  /** Badge label suppressed grid-wide because it's this restaurant's majority provenance (see TopDishesGrid). */
  hiddenBadge?: string | null;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // A cached image can be `complete` before React attaches onLoad — without
  // this check the tile stays at opacity 0 forever on warm loads.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);

  if (errored) return null;

  const hasName = !!dish.dishName;
  const aspectRatio = dish.width && dish.height ? dish.width / dish.height : 1;
  const hasMultiple = variantCount > 1;

  return (
    <div className={`relative ${hero ? "" : "mb-2.5"}`}>
      <button
        onClick={onOpen}
        data-dish-id={dish.id}
        className={`group relative block w-full overflow-hidden text-left tap-scale focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
          hero ? "rounded-3xl" : "rounded-2xl"
        }`}
        style={{
          background: "var(--surface-2)",
          aspectRatio: hero ? "4 / 3" : aspectRatio > 0.4 && aspectRatio < 2.6 ? aspectRatio : 1,
        }}
        aria-label={dish.dishName ? `View ${dish.dishName}` : "View photo"}
      >
      {!loaded && <div className="absolute inset-0 shimmer" />}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={dish.url}
        alt={dish.dishName || "Restaurant photo"}
        className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        } group-hover:scale-[1.03]`}
        style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />

      {hasName && (
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />
      )}

      {/* Frosted ≤4-word name pill (PRD §4.2) — wraps to two lines before
          truncating so longer names aren't cut mid-word while vertical
          space is free. */}
      {hasName && (
        <div className={`absolute pointer-events-none ${hero ? "left-4 right-4 bottom-4" : "left-2.5 right-2.5 bottom-2.5"}`}>
          <div
            className={`inline-block glass max-w-full px-3 py-1.5 ${hero ? "rounded-3xl" : "rounded-2xl"}`}
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            <p
              className={`text-white font-bold tracking-tight line-clamp-2 ${hero ? "text-[18px]" : "text-[12px]"}`}
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
            >
              {dish.dishName}
            </p>
          </div>
        </div>
      )}

      {/* Unnamed photos still get a caption — a grid of fully unlabeled
          tiles (common for uncurated pipeline restaurants) reads as broken.
          Cite the photo's source instead. */}
      {!hasName && loaded && (
        <div className="absolute left-2.5 bottom-2.5 pointer-events-none">
          <span
            className="glass rounded-full px-2.5 py-1 text-[10px] font-semibold text-white/60"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            Photo · {SOURCE_LABELS[dish.source]}
          </span>
        </div>
      )}

      {/* Provenance badge — top-left. Only once a dish is actually
          identified; showing "Spotted here" on an unlabeled loading
          placeholder claimed a provenance that wasn't real yet. On the hero
          tile, a "Most Popular" tag stacks above it explaining the #1 spot. */}
      {loaded && hasName && (
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1 pointer-events-none">
          {hero && (
            <div
              className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-md leading-none text-white"
              style={{ background: "var(--accent)", letterSpacing: "0.06em" }}
            >
              Most Popular
            </div>
          )}
          {(() => {
            const badge = tileBadge(dish);
            if (!badge || badge === hiddenBadge) return null;
            const owner = dish.attribution === "owner";
            return (
              <div
                className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-md leading-none ${
                  owner ? "text-[#0a0a0a]" : "text-white/85"
                }`}
                style={{
                  background: owner ? "rgba(251,191,36,0.96)" : "rgba(0,0,0,0.55)",
                  backdropFilter: owner ? undefined : "blur(6px)",
                  letterSpacing: "0.06em",
                }}
              >
                {badge}
              </div>
            );
          })()}
        </div>
      )}

      {hero && loaded && (
        <div className="absolute top-2 right-2.5 pointer-events-none">
          <span
            className="glass rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/85"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            #1
          </span>
        </div>
      )}

      </button>

      {/* Multiple-photos cue — stacked-photos glyph + count, on a scrim so
          it stays legible over bright photos. (The hero's top-right corner
          belongs to the #1 chip, so the hero pill sits below it.) */}
      {loaded && hasMultiple && (
        <div className={`absolute pointer-events-none ${hero ? "top-9 right-2.5" : "top-2.5 right-2.5"}`}>
          <div
            className="glass rounded-full flex items-center gap-1 px-1.5 py-1"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="14" height="14" rx="2" />
              <path d="M7 7V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3" />
            </svg>
            <span className="text-white/90 text-[10px] font-bold leading-none tabular-nums">
              {variantCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
