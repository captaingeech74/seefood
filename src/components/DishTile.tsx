"use client";

import { DishPhoto } from "@/lib/types";
import { useState } from "react";

/** PRD §4.2/§4.3 provenance badge — one of three labels per dish. */
export function provenanceLabel(dish: DishPhoto): string {
  if (dish.isMenuMatch) return "Menu Match";
  if (dish.attribution === "owner") return "From management";
  return "Spotted here";
}

export default function DishTile({
  dish,
  hero = false,
  variantCount = 1,
  onOpen,
}: {
  dish: DishPhoto;
  hero?: boolean;
  /** How many photos exist of this same dish — renders a small "multiple photos" badge when > 1. */
  variantCount?: number;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return null;

  const hasName = !!dish.dishName;
  const aspectRatio = dish.width && dish.height ? dish.width / dish.height : 1;
  const hasMultiple = variantCount > 1;

  return (
    <div className={`relative ${hero ? "" : "mb-2.5 break-inside-avoid"}`}>
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

      {/* Frosted ≤4-word name pill (PRD §4.2) */}
      {hasName && (
        <div className={`absolute pointer-events-none ${hero ? "left-4 right-4 bottom-4" : "left-2.5 right-2.5 bottom-2.5"}`}>
          <div
            className="inline-block glass rounded-full px-3 py-1.5 max-w-full"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            <p
              className={`text-white font-bold tracking-tight truncate ${hero ? "text-[18px]" : "text-[12px]"}`}
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
            >
              {dish.dishName}
            </p>
          </div>
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
              className="text-[8px] font-extrabold uppercase px-1.5 py-[3px] rounded-md leading-none text-white"
              style={{ background: "var(--accent)", letterSpacing: "0.06em" }}
            >
              Most Popular
            </div>
          )}
          <div
            className={`text-[8px] font-extrabold uppercase px-1.5 py-[3px] rounded-md leading-none ${
              dish.isMenuMatch
                ? "text-[#0a0a0a]"
                : dish.attribution === "owner"
                ? "text-[#0a0a0a]"
                : "text-white/75"
            }`}
            style={{
              background: dish.isMenuMatch
                ? "rgba(52,211,153,0.95)"
                : dish.attribution === "owner"
                ? "rgba(251,191,36,0.96)"
                : "rgba(0,0,0,0.45)",
              backdropFilter: dish.isMenuMatch || dish.attribution === "owner" ? undefined : "blur(6px)",
              letterSpacing: "0.06em",
            }}
          >
            {provenanceLabel(dish)}
          </div>
        </div>
      )}

      {hero && loaded && (
        <div className="absolute top-2 right-2.5 pointer-events-none">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-white/55">
            #1
          </span>
        </div>
      )}

      </button>

      {/* Multiple-photos cue — a small accent badge riding the tile's
          top-right corner, mostly OUTSIDE the photo itself (Kyle: no more
          putting things on top of the picture) rather than an overlay on
          the image content. Same pattern as an app-icon notification badge. */}
      {loaded && hasMultiple && (
        <div
          className="absolute top-0 right-0 flex items-center justify-center rounded-full font-extrabold text-white pointer-events-none"
          style={{
            transform: "translate(40%, -40%)",
            width: hero ? 24 : 19,
            height: hero ? 24 : 19,
            fontSize: hero ? 11 : 9.5,
            background: "var(--accent)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.35), 0 0 0 2.5px var(--surface-0)",
          }}
        >
          {variantCount}
        </div>
      )}
    </div>
  );
}
