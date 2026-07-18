"use client";

import { DishPhoto } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/labels";
import type { DishSourceMix } from "@/lib/dishGrouping";
import { useEffect, useRef, useState } from "react";
import { withPhotoSignals } from "@/lib/photoSignals";

/** PRD §4.2/§4.3 provenance label used in the immersive Reveal. */
export function provenanceLabel(dish: DishPhoto): string {
  if (dish.isMenuMatch) return "Menu Match";
  if (withPhotoSignals(dish).photoAuthorType === "management") return "From management";
  return "Spotted here";
}

export default function DishTile({
  dish,
  hero = false,
  variantCount = 1,
  sourceMix,
  onOpen,
}: {
  dish: DishPhoto;
  hero?: boolean;
  /** How many photos exist of this same dish — renders a small "multiple photos" badge when > 1. */
  variantCount?: number;
  /** Mgmt/customer coverage for the dish, including SeeFood's promoted customer subset. */
  sourceMix?: DishSourceMix;
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
  const canCompare = !!sourceMix && sourceMix.management > 0 && sourceMix.customers > 0;

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
            {sourceMix && (
              <p className={`mt-0.5 max-w-full truncate text-white/60 font-semibold ${hero ? "text-[10.5px]" : "text-[8.5px]"}`}>
                {sourceMix.management > 0 && sourceMix.customers > 0
                  ? `Mgmt ${sourceMix.management} · Customers ${sourceMix.customers}`
                  : sourceMix.management > 0
                  ? `Mgmt photo${sourceMix.management === 1 ? "" : `s · ${sourceMix.management}`}`
                  : sourceMix.customers > 0
                  ? `Customer photo${sourceMix.customers === 1 ? "" : `s · ${sourceMix.customers}`}`
                  : "Be first to add a photo"}
                {sourceMix.seeFood > 0 && (
                  <span className="ml-1 rounded-full px-1 py-0.5 border border-[var(--accent)] text-white/90">
                    {hero ? `${sourceMix.seeFood} on SF` : "SF"}
                  </span>
                )}
              </p>
            )}
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

      {/* Source coverage now lives with the dish name. The top-left is kept
          for rank context so the image never becomes a wall of badges. */}
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
            {canCompare ? (
              <span className="flex gap-0.5" aria-hidden>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              </span>
            ) : (
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="14" height="14" rx="2" />
                <path d="M7 7V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3" />
              </svg>
            )}
            <span className="text-white/90 text-[10px] font-bold leading-none tabular-nums">
              {canCompare ? `Compare ${variantCount}` : variantCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
