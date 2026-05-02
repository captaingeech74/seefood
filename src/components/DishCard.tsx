"use client";

import { DishPhoto } from "@/lib/types";
import { useState } from "react";

export default function DishCard({
  dish,
  onOpen,
}: {
  dish: DishPhoto;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return null;

  return (
    <button
      onClick={onOpen}
      className="group relative rounded-2xl overflow-hidden bg-[var(--surface-2)] aspect-square w-full text-left tap-scale focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      aria-label={dish.dishName ? `View ${dish.dishName}` : "View photo"}
    >
      {/* Shimmer skeleton */}
      {!loaded && <div className="absolute inset-0 shimmer" />}

      {/* Image */}
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

      {/* Bottom vignette — only when there's a dish name to display */}
      {loaded && dish.dishName && (
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />
      )}

      {/* Dish name — padded to clear the rounded-2xl (16px) corner arc */}
      {loaded && dish.dishName && (
        <div className="absolute inset-x-0 bottom-0 pl-3.5 pr-2.5 pb-3 pointer-events-none">
          <p className="text-white text-[12px] font-bold leading-tight tracking-tight line-clamp-2 text-shadow-soft">
            {dish.dishName}
          </p>
        </div>
      )}

      {/* Attribution badge — top-left, "Management" persists throughout */}
      {loaded && (
        <div className="absolute top-2 left-2 pointer-events-none">
          {dish.attribution === "owner" ? (
            <div
              className="text-[8px] font-extrabold uppercase px-1.5 py-[3px] rounded-md leading-none"
              style={{
                background: "rgba(251,191,36,0.96)",
                color: "#0a0a0a",
                letterSpacing: "0.06em",
              }}
            >
              Management
            </div>
          ) : (
            <div
              className="text-[8px] font-bold uppercase px-1.5 py-[3px] rounded-md leading-none"
              style={{
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.06em",
              }}
            >
              User
            </div>
          )}
        </div>
      )}
    </button>
  );
}
