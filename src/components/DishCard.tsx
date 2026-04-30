"use client";

import { DishPhoto } from "@/lib/types";
import { useState } from "react";

export default function DishCard({ dish }: { dish: DishPhoto }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return null;

  return (
    <div className="relative rounded-xl overflow-hidden bg-[#1a1a1a] aspect-square">
      {/* Skeleton while loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-[#1a1a1a] animate-pulse" />
      )}

      <img
        src={dish.url}
        alt={dish.dishName || "Restaurant photo"}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />

      {/* Dish name — frosted pill floating just above the bottom edge */}
      {loaded && dish.dishName && (
        <div className="absolute bottom-0 inset-x-0 flex justify-center pb-2 px-2 pointer-events-none">
          <span
            className="text-white font-semibold text-[10px] leading-tight text-center px-2 py-1 rounded-lg max-w-full truncate"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
            }}
          >
            {dish.dishName}
          </span>
        </div>
      )}

      {/* Attribution badge — top-right corner */}
      {loaded && (
        dish.attribution === "owner" ? (
          <div
            className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(251,191,36,0.92)", color: "#000" }}
          >
            Management
          </div>
        ) : (
          <div
            className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            User
          </div>
        )
      )}
    </div>
  );
}
