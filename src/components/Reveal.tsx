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

const SWIPE_THRESHOLD = 60; // px of finger travel to commit a navigation
const ANIM_MS = 300;

/**
 * PRD §4.3 — full-bleed immersive vertical swipe, replaces the old Lightbox
 * entirely. A real 3-slot sliding track (prev/current/next stacked and
 * translated together) rather than a swap-in-place image, so the motion
 * reads like Instagram/TikTok — the next photo visibly slides up from below
 * (or down from above) instead of popping.
 */
export default function Reveal({ photos, startIndex, restaurant, onClose }: RevealProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragY, setDragY] = useState(0); // live px offset — finger-follow while dragging, animated target while settling
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isResetting, setIsResetting] = useState(false); // true for the single no-transition frame after a commit
  const [detailOpen, setDetailOpen] = useState(false);
  const [hasSwiped, setHasSwiped] = useState(false);
  const startYRef = useRef(0);

  const photo = photos[index];
  const prevPhoto = index > 0 ? photos[index - 1] : null;
  const nextPhoto = index < photos.length - 1 ? photos[index + 1] : null;

  const close = useCallback(() => onClose(index), [onClose, index]);

  // Animates the track to a target offset, then commits the index change on
  // a frame where the transition is disabled — so the swap from "next slide
  // slid into center" to "that slide is now current, offset reset to 0" is
  // visually seamless instead of a snap-back flash.
  const animateTo = useCallback((targetOffset: number, nextIdx: number) => {
    setIsAnimating(true);
    setDragY(targetOffset);
    window.setTimeout(() => {
      setIsResetting(true);
      setIndex(nextIdx);
      setDragY(0);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setIsResetting(false);
          setIsAnimating(false);
        })
      );
    }, ANIM_MS);
  }, []);

  const snapBack = useCallback(() => {
    setIsAnimating(true);
    setDragY(0);
    window.setTimeout(() => setIsAnimating(false), ANIM_MS);
  }, []);

  const goNext = useCallback(() => {
    if (isAnimating || index >= photos.length - 1) return;
    setHasSwiped(true);
    animateTo(-window.innerHeight, index + 1);
  }, [isAnimating, index, photos.length, animateTo]);

  const goPrev = useCallback(() => {
    if (isAnimating || index <= 0) return;
    setHasSwiped(true);
    animateTo(window.innerHeight, index - 1);
  }, [isAnimating, index, animateTo]);

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
    if (isAnimating) return;
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
    if (dy < -SWIPE_THRESHOLD && index < photos.length - 1) {
      setHasSwiped(true);
      animateTo(-window.innerHeight, index + 1);
    } else if (dy > SWIPE_THRESHOLD) {
      // Swipe down: previous dish, or dismiss if already at the top (PRD §4.3).
      if (index === 0) close();
      else {
        setHasSwiped(true);
        animateTo(window.innerHeight, index - 1);
      }
    } else {
      snapBack();
    }
  };

  // Same-dish photo grouping for Dish Detail — exact dish-name match across
  // the full ranked list (Gemini's cross-photo grouping isn't persisted yet,
  // so name equality is the practical stand-in).
  const sameDishPhotos = useMemo(() => {
    if (!photo?.dishName) return [photo].filter(Boolean) as DishPhoto[];
    const key = photo.dishName.toLowerCase().trim();
    return photos.filter((p) => p.dishName?.toLowerCase().trim() === key);
  }, [photo, photos]);

  // "SeeFood" moment (Kyle's idea): when a dish has photos from BOTH
  // management and real diners, let people compare the ad shot to what
  // actually showed up on their table — split into two labeled carousels
  // instead of one flat strip. Falls back to the flat strip otherwise.
  const managementPhotos = useMemo(() => sameDishPhotos.filter((p) => p.attribution === "owner"), [sameDishPhotos]);
  const dinerPhotos = useMemo(() => sameDishPhotos.filter((p) => p.attribution === "user"), [sameDishPhotos]);
  const canCompare = managementPhotos.length > 0 && dinerPhotos.length > 0;

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

  const trackTransition = isDragging || isResetting ? "none" : `transform ${ANIM_MS}ms var(--ease-spring)`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/97 fade-in overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* Sliding track — prev/current/next stacked, translated together */}
      {prevPhoto && (
        <Slide photo={prevPhoto} style={{ transform: `translateY(calc(-100% + ${dragY}px))`, transition: trackTransition }} />
      )}
      <Slide
        photo={photo}
        interactive
        onTap={() => setDetailOpen((v) => !v)}
        style={{ transform: `translateY(${dragY}px)`, transition: trackTransition }}
      />
      {nextPhoto && (
        <Slide photo={nextPhoto} style={{ transform: `translateY(calc(100% + ${dragY}px))`, transition: trackTransition }} />
      )}

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

      {/* Bottom overlay — dish name + provenance badge (hidden while detail is open) */}
      {!detailOpen && (
        <div
          className="absolute bottom-0 inset-x-0 z-10 px-5 pt-14 bg-gradient-to-t from-black via-black/75 to-transparent pointer-events-none"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
        >
          {photo.dishName && (
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
          )}

          {photo.dishName ? (
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-1">
              {photo.dishName}
            </h2>
          ) : (
            <p className="text-white/50 text-[14px] font-medium italic mb-1">No dish identified</p>
          )}

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {!hasSwiped && nextPhoto && (
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                className="text-white/40 animate-bounce"
              >
                <path d="M12 5v14M5 12l7 7 7-7"/>
              </svg>
            )}
            <p className="text-white/30 text-[11px] font-medium">
              Tap photo for details · Swipe up for next
            </p>
          </div>
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

          {canCompare ? (
            <div className="mb-4 space-y-3">
              <p className="text-[10px] uppercase font-bold text-white/35" style={{ letterSpacing: "0.14em" }}>
                See the food — management vs. real diners
              </p>
              <PhotoStrip label="From management" photos={managementPhotos} activeId={photo.id} onPick={(p) => {
                const i = photos.indexOf(p);
                if (i >= 0) setIndex(i);
              }} />
              <PhotoStrip label="From real diners" photos={dinerPhotos} activeId={photo.id} onPick={(p) => {
                const i = photos.indexOf(p);
                if (i >= 0) setIndex(i);
              }} accent />
            </div>
          ) : (
            sameDishPhotos.length > 1 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase font-bold text-white/35 mb-2" style={{ letterSpacing: "0.14em" }}>
                  More photos of this dish
                </p>
                <PhotoStrip photos={sameDishPhotos} activeId={photo.id} onPick={(p) => {
                  const i = photos.indexOf(p);
                  if (i >= 0) setIndex(i);
                }} />
              </div>
            )
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

function Slide({
  photo,
  interactive = false,
  onTap,
  style,
}: {
  photo: DishPhoto;
  interactive?: boolean;
  onTap?: () => void;
  style: React.CSSProperties;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt={photo.dishName || "Restaurant photo"}
      className="max-w-full max-h-full object-contain select-none"
      draggable={false}
    />
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={style}>
      {interactive ? (
        <button className="absolute inset-0 flex items-center justify-center w-full" onClick={onTap} aria-label="Toggle dish detail">
          {img}
        </button>
      ) : (
        img
      )}
    </div>
  );
}

function PhotoStrip({
  label,
  photos,
  activeId,
  onPick,
  accent = false,
}: {
  label?: string;
  photos: DishPhoto[];
  activeId: string;
  onPick: (p: DishPhoto) => void;
  accent?: boolean;
}) {
  return (
    <div>
      {label && (
        <p
          className="text-[10px] font-bold uppercase mb-1.5"
          style={{ letterSpacing: "0.1em", color: accent ? "var(--accent)" : "rgba(255,255,255,0.4)" }}
        >
          {label}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2"
            style={{ borderColor: p.id === activeId ? "var(--accent)" : "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
