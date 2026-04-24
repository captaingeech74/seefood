"use client";

import { DishPhoto } from "@/lib/types";
import DishCard from "./DishCard";

export default function DishGallery({
  dishes,
  loading,
}: {
  dishes: DishPhoto[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 px-4 pt-3 pb-8">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl bg-[#1a1a1a] animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    );
  }

  if (dishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-5xl mb-4">📷</div>
        <p className="text-white/60 text-base">No photos found</p>
        <p className="text-white/30 text-sm mt-1">Try a different restaurant</p>
      </div>
    );
  }

  const named = dishes.filter((d) => d.dishName);
  const unnamed = dishes.filter((d) => !d.dishName);

  return (
    <div className="px-4 pt-2 pb-12">
      {named.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-2 mt-1">
            Identified Dishes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {named.map((dish) => (
              <DishCard key={dish.id} dish={dish} />
            ))}
          </div>
        </>
      )}

      {unnamed.length > 0 && (
        <>
          {named.length > 0 && (
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-2 mt-4">
              More Photos
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {unnamed.map((dish) => (
              <DishCard key={dish.id} dish={dish} />
            ))}
          </div>
          <p className="text-center text-white/20 text-[11px] mt-4">
            {dishes.length} photo{dishes.length !== 1 ? "s" : ""} from Google
          </p>
        </>
      )}
    </div>
  );
}
