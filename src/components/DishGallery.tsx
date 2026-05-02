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

  // Photos arrive pre-sorted by priority score from the server.
  // We split into three display buckets without re-sorting.
  const { menuMatches, otherIdentified, unidentified } = useMemo(() => {
    return {
      menuMatches:    dishes.filter((d) =>  d.isMenuMatch),
      otherIdentified: dishes.filter((d) => !d.isMenuMatch && d.dishName),
      unidentified:   dishes.filter((d) => !d.isMenuMatch && !d.dishName),
    };
  }, [dishes]);

  // Build a flat index map so lightbox indices are consistent
  const flatDishes = useMemo(
    () => [...menuMatches, ...otherIdentified, ...unidentified],
    [menuMatches, otherIdentified, unidentified]
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

  if (flatDishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "var(--surface-2)" }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-white/30">
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

  const totalIdentified = menuMatches.length + otherIdentified.length;

  return (
    <>
      <div className="px-4 pt-3 pb-12 fade-up">

        {/* ── Menu Matches section ──────────────────────────────────── */}
        {menuMatches.length > 0 && (
          <div className="mb-5">
            <div className="flex items-baseline justify-between mb-3 px-0.5">
              <div className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  strokeLinejoin="round" style={{ color: "var(--success)" }}>
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
                <p className="text-[10px] uppercase font-bold" style={{
                  color: "var(--success)", letterSpacing: "0.18em",
                }}>
                  Menu Matches
                </p>
              </div>
              <p className="text-[10px] text-white/30 font-medium tabular-nums">
                {menuMatches.length} of {flatDishes.length} photos
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {menuMatches.map((dish, i) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  onOpen={() => setLightboxIndex(i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Other identified dishes ───────────────────────────────── */}
        {otherIdentified.length > 0 && (
          <div className="mb-5">
            {(menuMatches.length > 0 || totalIdentified > 0) && (
              <div className="flex items-baseline justify-between mb-3 px-0.5">
                <p className="text-[10px] uppercase font-bold text-white/45"
                  style={{ letterSpacing: "0.18em" }}>
                  {menuMatches.length > 0 ? "More Dishes" : "Identified Dishes"}
                </p>
                <p className="text-[10px] text-white/25 font-medium tabular-nums">
                  {totalIdentified} identified · {flatDishes.length} total
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {otherIdentified.map((dish, i) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  onOpen={() => setLightboxIndex(menuMatches.length + i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Unlabelled food photos ────────────────────────────────── */}
        {unidentified.length > 0 && (
          <div>
            {totalIdentified === 0 && (
              <div className="flex items-baseline justify-between mb-3 px-0.5">
                <p className="text-[10px] uppercase font-bold text-white/45"
                  style={{ letterSpacing: "0.18em" }}>
                  Photos
                </p>
                <p className="text-[10px] text-white/25 font-medium tabular-nums">
                  {flatDishes.length} total
                </p>
              </div>
            )}
            {totalIdentified > 0 && unidentified.length > 0 && (
              <div className="flex items-baseline justify-between mb-3 mt-1 px-0.5">
                <p className="text-[10px] uppercase font-bold text-white/30"
                  style={{ letterSpacing: "0.18em" }}>
                  More Photos
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {unidentified.map((dish, i) => (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  onOpen={() =>
                    setLightboxIndex(menuMatches.length + otherIdentified.length + i)
                  }
                />
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-white/20 text-[11px] mt-6 font-medium">
          Photos via Google Places
        </p>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={flatDishes}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
