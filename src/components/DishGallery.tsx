"use client";

import { useState, useMemo } from "react";
import { DishPhoto } from "@/lib/types";
import DishCard from "./DishCard";
import Lightbox from "./Lightbox";

export default function DishGallery({
  dishes,
  loading,
}: {
  dishes: DishPhoto[];
  loading: boolean;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Sort: named photos first, then unnamed. Stable within each group.
  const sortedDishes = useMemo(() => {
    const named = dishes.filter((d) => d.dishName);
    const unnamed = dishes.filter((d) => !d.dishName);
    return [...named, ...unnamed];
  }, [dishes]);

  const namedCount = useMemo(
    () => sortedDishes.filter((d) => d.dishName).length,
    [sortedDishes]
  );

  if (loading) {
    return (
      <div className="px-4 pt-3 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl shimmer"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (sortedDishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "var(--surface-2)" }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
        </div>
        <p className="text-white/75 text-[15px] font-semibold mb-1">No photos yet</p>
        <p className="text-white/35 text-[13px]">Try a different restaurant</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pt-3 pb-12 fade-up">
        {/* Section header — minimal, confident */}
        {namedCount > 0 && (
          <div className="flex items-baseline justify-between mb-3 px-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">
              The Menu
            </p>
            <p className="text-[10px] text-white/25 font-medium tabular-nums">
              {namedCount} identified · {sortedDishes.length} total
            </p>
          </div>
        )}

        {/* Unified grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {sortedDishes.map((dish, i) => (
            <DishCard
              key={dish.id}
              dish={dish}
              onOpen={() => setLightboxIndex(i)}
            />
          ))}
        </div>

        {/* Footer attribution */}
        <p className="text-center text-white/20 text-[11px] mt-6 font-medium">
          Photos via Google Places
        </p>
      </div>

      {/* Lightbox overlay */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={sortedDishes}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
