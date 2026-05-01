"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { DishPhoto } from "@/lib/types";

interface LightboxProps {
  photos: DishPhoto[];
  startIndex: number;
  onClose: () => void;
}

export default function Lightbox({ photos, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const photo = photos[index];

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(photos.length - 1, i + 1));
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll while open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Touch handlers — swipe between photos, swipe down to close
  const onTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startXRef.current;
    setDragX(dx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const dx = e.changedTouches[0].clientX - startXRef.current;
    const dy = e.changedTouches[0].clientY - startYRef.current;
    const horizontalThreshold = 60;
    const verticalThreshold = 100;

    if (Math.abs(dy) > Math.abs(dx) && dy > verticalThreshold) {
      onClose();
    } else if (dx > horizontalThreshold) {
      goPrev();
    } else if (dx < -horizontalThreshold) {
      goNext();
    }
    setDragX(0);
  };

  if (!photo) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/96 fade-in"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar — counter + close */}
      <div
        className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="text-white/55 text-[13px] font-medium tabular-nums">
          {index + 1} <span className="text-white/25">/ {photos.length}</span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/85">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Image — fills viewport, contained */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={photo.url}
          alt={photo.dishName || "Restaurant photo"}
          className="max-w-full max-h-full object-contain select-none scale-in"
          style={{
            transform: isDragging ? `translateX(${dragX * 0.4}px)` : undefined,
            transition: isDragging ? "none" : "transform 280ms var(--ease-spring)",
          }}
          draggable={false}
        />
      </div>

      {/* Side nav arrows — desktop only, hidden on touch */}
      {index > 0 && (
        <button
          onClick={goPrev}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 items-center justify-center transition-colors z-10"
          aria-label="Previous photo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          onClick={goNext}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 items-center justify-center transition-colors z-10"
          aria-label="Next photo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      )}

      {/* Bottom info card */}
      <div
        className="absolute bottom-0 inset-x-0 z-10 px-5 pb-5 pt-12 bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            {photo.dishName ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-1">
                  Identified
                </p>
                <h2 className="text-white text-[20px] font-bold leading-tight tracking-tight">
                  {photo.dishName}
                </h2>
              </>
            ) : (
              <p className="text-white/50 text-[14px] font-medium italic">
                No dish identified
              </p>
            )}
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
              photo.attribution === "owner"
                ? "bg-amber-400/95 text-black"
                : "bg-white/10 text-white/60"
            }`}
          >
            {photo.attribution === "owner" ? "Management" : "User"}
          </span>
        </div>
      </div>
    </div>
  );
}
