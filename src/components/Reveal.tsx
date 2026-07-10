"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { DishPhoto, Restaurant } from "@/lib/types";
import { provenanceLabel } from "./DishTile";
import { shareDish } from "@/lib/share";

interface RevealProps {
  photos: DishPhoto[];
  startIndex: number;
  restaurant: Restaurant;
  onClose: (lastIndex: number) => void;
}

const SOURCE_LABELS: Record<DishPhoto["source"], string> = {
  google: "Google", doordash: "DoorDash", grubhub: "Grubhub", menufy: "Menufy",
  schema_org: "Restaurant", toast: "Toast", square: "Square", clover: "Clover",
  chownow: "ChowNow", olo: "Olo", popmenu: "PopMenu", menu_ocr: "Menu",
};

/** PRD §4.3 — full-bleed immersive vertical swipe, replaces the old Lightbox entirely. */
export default function Reveal({ photos, startIndex, restaurant, onClose }: RevealProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const startYRef = useRef(0);

  const photo = photos[index];

  const goNext = useCallback(
    () => setIndex((i) => Math.min(photos.length - 1, i + 1)),
    [photos.length]
  );
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const close = useCallback(() => onClose(index), [onClose, index]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") (detailOpen ? setDetailOpen(false) : close());
      else if (e.key === "ArrowUp") goPrev();
      else if (e.key === "ArrowDown") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close, goPrev, goNext, detailOpen]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setDragY(e.touches[0].clientY - startYRef.current);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const dy = e.changedTouches[0].clientY - startYRef.current;
    if (dy < -60) goNext();
    else if (dy > 60) {
      // Swipe down: previous dish, or dismiss if already at the top (PRD §4.3).
      if (index === 0) close();
      else goPrev();
    }
    setDragY(0);
  };

  // Same-dish photo grouping for Dish Detail — exact dish-name match across
  // the full ranked list (Gemini's cross-photo grouping isn't persisted yet,
  // so name equality is the practical stand-in).
  const sameDishPhotos = useMemo(() => {
    if (!photo?.dishName) return [photo].filter(Boolean) as DishPhoto[];
    const key = photo.dishName.toLowerCase().trim();
    return photos.filter((p) => p.dishName?.toLowerCase().trim() === key);
  }, [photo, photos]);

  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (!photo || sharing) return;
    setSharing(true);
    try {
      await shareDish(photo, restaurant);
    } finally {
      setSharing(false);
    }
  };

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/97 fade-in"
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
          onClick={close}
          className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/85">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Image — tap opens Dish Detail */}
      <button
        className="absolute inset-0 flex items-center justify-center w-full"
        onClick={() => setDetailOpen((v) => !v)}
        aria-label="Toggle dish detail"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.dishName || "Restaurant photo"}
          className="max-w-full max-h-full object-contain select-none scale-in"
          style={{
            transform: isDragging ? `translateY(${dragY * 0.4}px)` : undefined,
            transition: isDragging ? "none" : "transform 280ms var(--ease-spring)",
          }}
          draggable={false}
        />
      </button>

      {/* Bottom overlay — dish name + provenance badge (hidden while detail is open) */}
      {!detailOpen && (
        <div
          className="absolute bottom-0 inset-x-0 z-10 px-5 pt-14 bg-gradient-to-t from-black via-black/75 to-transparent pointer-events-none"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
              style={{
                background: photo.isMenuMatch ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)",
                color: photo.isMenuMatch ? "var(--success)" : "rgba(255,255,255,0.55)",
                letterSpacing: "0.1em",
              }}
            >
              {provenanceLabel(photo)}
            </span>
          </div>

          {photo.dishName ? (
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-1">
              {photo.dishName}
            </h2>
          ) : (
            <p className="text-white/50 text-[14px] font-medium italic mb-1">No dish identified</p>
          )}

          <p className="text-white/30 text-[11px] font-medium pointer-events-auto">
            Tap photo for details · Swipe up for next
          </p>
        </div>
      )}

      {/* Dish Detail sheet (PRD §4.3 tap-in) */}
      {detailOpen && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 glass rounded-t-3xl px-5 pt-5 slide-up"
          style={{
            background: "rgba(10,10,10,0.92)",
            paddingBottom: "max(24px, env(safe-area-inset-bottom))",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />

          {photo.dishName && (
            <h3 className="text-white text-[19px] font-bold mb-1.5">{photo.dishName}</h3>
          )}
          {photo.dishDescription && (
            <p className="text-white/60 text-[13px] leading-relaxed mb-4">{photo.dishDescription}</p>
          )}

          {sameDishPhotos.length > 1 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase font-bold text-white/35 mb-2" style={{ letterSpacing: "0.14em" }}>
                More photos of this dish
              </p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {sameDishPhotos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const i = photos.indexOf(p);
                      if (i >= 0) setIndex(i);
                    }}
                    className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2"
                    style={{ borderColor: p.id === photo.id ? "var(--accent)" : "transparent" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-white/8 text-white/55">
                {SOURCE_LABELS[photo.source]}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                  photo.attribution === "owner" ? "bg-amber-400/95 text-black" : "bg-white/10 text-white/60"
                }`}
              >
                {photo.attribution === "owner" ? "Management" : "User"}
              </span>
            </div>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded-full text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="m8.6 13.5 6.8 3.9M15.4 6.6 8.6 10.5"/>
              </svg>
              Share
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
