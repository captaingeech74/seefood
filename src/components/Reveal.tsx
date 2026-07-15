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
  user_upload: "SeeFood",
  user_suggested: "SeeFood",
};

const SWIPE_THRESHOLD = 60; // px of finger travel to commit a navigation
const ANIM_MS = 300;

/**
 * PRD §4.3 — full-bleed immersive swipe, replaces the old Lightbox entirely.
 * Two independent axes, gesture-locked so a drag can't drift between them:
 *   - Vertical: moves through the ranked dish list (the primary feed).
 *   - Horizontal: browses other photos of the SAME dish ("variants") — a
 *     real 3-slot sliding track exactly like the vertical one, just on the
 *     other axis, layered on top of whichever dish is currently centered.
 */
export default function Reveal({ photos, startIndex, restaurant, onClose }: RevealProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isHAnimating, setIsHAnimating] = useState(false);
  const [isHResetting, setIsHResetting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [hasSwiped, setHasSwiped] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<DishPhoto[]>([]);
  // Once true, the swipe-right-only hint upgrades to show both directions —
  // persisted in localStorage so it stays learned across dishes and future
  // visits, not just the current photo (Kyle: "once they have swiped right
  // one time, it should change to also show they can go left as well now").
  const [discoveredHSwipe, setDiscoveredHSwipe] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("seefood-discovered-hswipe") === "1";
    } catch {
      return false;
    }
  });

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dragAxisRef = useRef<"vertical" | "horizontal" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photo = photos[index];
  const prevPhoto = index > 0 ? photos[index - 1] : null;
  const nextPhoto = index < photos.length - 1 ? photos[index + 1] : null;

  const close = useCallback(() => onClose(index), [onClose, index]);

  // Other photos of the SAME dish — exact dish-name match (Gemini's
  // cross-photo grouping isn't persisted yet, so name equality is the
  // practical stand-in). Includes this session's own uploads.
  const variants = useMemo(() => {
    if (!photo?.dishName) return [photo].filter(Boolean) as DishPhoto[];
    const key = photo.dishName.toLowerCase().trim();
    const fromProps = photos.filter((p) => p.dishName?.toLowerCase().trim() === key);
    const fromUploads = uploadedPhotos.filter((p) => p.dishName?.toLowerCase().trim() === key);
    return [...fromProps, ...fromUploads];
  }, [photo, photos, uploadedPhotos]);

  const activePhoto = variants[variantIndex] ?? photo;
  const prevVariant = variantIndex > 0 ? variants[variantIndex - 1] : null;
  const nextVariant = variantIndex < variants.length - 1 ? variants[variantIndex + 1] : null;

  // Reset which variant is showing whenever the outer (vertical) dish
  // changes — always land back on the ranked photo for the new dish, not
  // wherever horizontal browsing last left off.
  useEffect(() => {
    const idx = variants.findIndex((v) => v.id === photo?.id);
    setVariantIndex(idx >= 0 ? idx : 0);
    setDragX(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

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

  const animateVariantTo = useCallback((targetOffset: number, nextIdx: number) => {
    setIsHAnimating(true);
    setDragX(targetOffset);
    setDiscoveredHSwipe(true);
    try { localStorage.setItem("seefood-discovered-hswipe", "1"); } catch {}
    window.setTimeout(() => {
      setIsHResetting(true);
      setVariantIndex(nextIdx);
      setDragX(0);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setIsHResetting(false);
          setIsHAnimating(false);
        })
      );
    }, ANIM_MS);
  }, []);

  const snapBackH = useCallback(() => {
    setIsHAnimating(true);
    setDragX(0);
    window.setTimeout(() => setIsHAnimating(false), ANIM_MS);
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
      else if (e.key === "ArrowLeft" && !isHAnimating && variantIndex > 0) animateVariantTo(window.innerWidth, variantIndex - 1);
      else if (e.key === "ArrowRight" && !isHAnimating && variantIndex < variants.length - 1) animateVariantTo(-window.innerWidth, variantIndex + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close, goPrev, goNext, detailOpen, isHAnimating, variantIndex, variants.length, animateVariantTo]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating || isHAnimating) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    dragAxisRef.current = null;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dragAxisRef.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (dragAxisRef.current === "horizontal") setDragX(dx);
    else if (dragAxisRef.current === "vertical") setDragY(dy);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const axis = dragAxisRef.current;
    dragAxisRef.current = null;

    if (axis === "horizontal") {
      const dx = e.changedTouches[0].clientX - startXRef.current;
      if (dx < -SWIPE_THRESHOLD && variantIndex < variants.length - 1) {
        animateVariantTo(-window.innerWidth, variantIndex + 1);
      } else if (dx > SWIPE_THRESHOLD && variantIndex > 0) {
        animateVariantTo(window.innerWidth, variantIndex - 1);
      } else {
        snapBackH();
      }
      return;
    }

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

  // "SeeFood" moment (Kyle's idea): when a dish has photos from BOTH
  // management and real diners, let people compare the ad shot to what
  // actually showed up on their table — split into two labeled carousels
  // instead of one flat strip. Falls back to the flat strip otherwise.
  const managementPhotos = useMemo(() => variants.filter((p) => p.attribution === "owner"), [variants]);
  const dinerPhotos = useMemo(() => variants.filter((p) => p.attribution === "user"), [variants]);
  const canCompare = managementPhotos.length > 0 && dinerPhotos.length > 0;

  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (!activePhoto || sharing) return;
    setSharing(true);
    try {
      await shareDish(activePhoto, restaurant);
    } finally {
      setSharing(false);
    }
  };

  const [loved, setLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(0);
  useEffect(() => {
    setLoveCount(activePhoto?.loveCount ?? 0);
    try {
      setLoved(activePhoto ? localStorage.getItem(`seefood-loved-${activePhoto.id}`) === "1" : false);
    } catch {
      setLoved(false);
    }
  }, [activePhoto?.id, activePhoto?.loveCount]);

  const handleLove = async () => {
    if (!activePhoto || loved) return;
    setLoved(true);
    setLoveCount((c) => c + 1);
    try { localStorage.setItem(`seefood-loved-${activePhoto.id}`, "1"); } catch {}
    try {
      const res = await fetch("/api/love-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: activePhoto.id }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setLoved(false);
      setLoveCount((c) => Math.max(0, c - 1));
      try { localStorage.removeItem(`seefood-loved-${activePhoto.id}`); } catch {}
    }
  };

  const [uploading, setUploading] = useState(false);
  const handleTakePhotoClick = () => fileInputRef.current?.click();
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activePhoto) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("placeId", restaurant.placeId || restaurant.id);
      if (activePhoto.dishName) form.append("dishName", activePhoto.dishName);
      if (activePhoto.dishDescription) form.append("dishDescription", activePhoto.dishDescription);
      form.append("isMenuMatch", String(activePhoto.isMenuMatch));
      form.append("tier", String(activePhoto.tier));
      const res = await fetch("/api/upload-photo", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok && data.photo) {
        const newIndex = variants.length;
        setUploadedPhotos((prev) => [...prev, data.photo]);
        setVariantIndex(newIndex);
      } else {
        alert(data.error || "Upload failed — please try again.");
      }
    } catch {
      alert("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!photo) return null;

  const trackTransition = isDragging || isResetting ? "none" : `transform ${ANIM_MS}ms var(--ease-spring)`;
  const hTrackTransition = isDragging || isHResetting ? "none" : `transform ${ANIM_MS}ms var(--ease-spring)`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/97 fade-in overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* Vertical track — prev/current/next DISH stacked, translated together */}
      {prevPhoto && (
        <Slide photo={prevPhoto} style={{ transform: `translateY(calc(-100% + ${dragY}px))`, transition: trackTransition }} />
      )}

      {/* Current dish — its own horizontal 3-slot track for same-dish variants */}
      <div
        className="absolute inset-0"
        style={{ transform: `translateY(${dragY}px)`, transition: trackTransition }}
      >
        {prevVariant && (
          <HSlide photo={prevVariant} style={{ transform: `translateX(calc(-100% + ${dragX}px))`, transition: hTrackTransition }} />
        )}
        <HSlide
          photo={activePhoto}
          interactive
          onTap={() => setDetailOpen((v) => !v)}
          style={{ transform: `translateX(${dragX}px)`, transition: hTrackTransition }}
        />
        {nextVariant && (
          <HSlide photo={nextVariant} style={{ transform: `translateX(calc(100% + ${dragX}px))`, transition: hTrackTransition }} />
        )}
      </div>

      {nextPhoto && (
        <Slide photo={nextPhoto} style={{ transform: `translateY(calc(100% + ${dragY}px))`, transition: trackTransition }} />
      )}

      {/* Same-dish swipe hint — right-only until the user has discovered the
          gesture once (globally, via localStorage), then both edges light up. */}
      {!detailOpen && !isDragging && nextVariant && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none swipe-hint-right">
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
        </div>
      )}
      {!detailOpen && !isDragging && discoveredHSwipe && prevVariant && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none swipe-hint-left">
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </div>
        </div>
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

      {/* Same-dish variant dots — only when there's more than one photo to browse */}
      {!detailOpen && variants.length > 1 && (
        <div className="absolute top-12 inset-x-0 z-10 flex items-center justify-center gap-1.5">
          {variants.map((v, i) => (
            <span
              key={v.id}
              className="rounded-full transition-all"
              style={{
                width: i === variantIndex ? 14 : 5,
                height: 5,
                background: i === variantIndex ? "var(--accent)" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>
      )}

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
              Tap for details · Swipe ↕ for next dish
              {variants.length > 1 ? ` · Swipe ${discoveredHSwipe ? "↔" : "→"} more photos` : ""}
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
            maxHeight: "72vh",
            overflowY: "auto",
          }}
        >
          <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />

          {photo.dishName && (
            <h3 className="text-white text-[19px] font-bold mb-1.5">{photo.dishName}</h3>
          )}
          {photo.dishDescription && (
            <p className="text-white/60 text-[13px] leading-relaxed">{photo.dishDescription}</p>
          )}

          {/* Visual separation between the description and the photo carousels below */}
          <div className="h-px bg-white/10 my-4" />

          {canCompare ? (
            <div className="mb-4 space-y-3">
              <PhotoStrip label="Photos - Management" photos={managementPhotos} activeId={activePhoto.id} onPick={(p) => {
                const i = variants.indexOf(p);
                if (i >= 0) setVariantIndex(i);
              }} />
              <PhotoStrip label="Photos - Real Diners" photos={dinerPhotos} activeId={activePhoto.id} onPick={(p) => {
                const i = variants.indexOf(p);
                if (i >= 0) setVariantIndex(i);
              }} accent />
            </div>
          ) : (
            variants.length > 1 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase font-bold text-white/35 mb-2" style={{ letterSpacing: "0.14em" }}>
                  More photos of this dish
                </p>
                <PhotoStrip photos={variants} activeId={activePhoto.id} onPick={(p) => {
                  const i = variants.indexOf(p);
                  if (i >= 0) setVariantIndex(i);
                }} />
              </div>
            )
          )}

          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-white/8 text-white/55">
              {SOURCE_LABELS[activePhoto.source]}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mb-1">
            <button
              onClick={handleTakePhotoClick}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border active:scale-[0.96] transition-all disabled:opacity-50"
              style={{ background: "var(--surface-2)", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span className="text-[11.5px] font-bold text-white/85 text-center leading-tight">
                {uploading ? "Uploading…" : "Take Photo"}
              </span>
            </button>

            <button
              onClick={handleLove}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border active:scale-[0.96] transition-all"
              style={{
                background: loved ? "rgba(251,191,36,0.14)" : "var(--surface-2)",
                borderColor: loved ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.1)",
              }}
            >
              <svg
                width="20" height="20" viewBox="0 0 24 24"
                fill={loved ? "var(--gold)" : "none"}
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  color: loved ? "var(--gold)" : "rgba(255,255,255,0.85)",
                  transform: loved ? "scale(1.1)" : "scale(1)",
                  transition: "transform 200ms var(--ease-spring)",
                }}
              >
                <path d="M12 2 14.6 8.6 22 9.5l-5.4 5L18 22l-6-3.5L6 22l1.4-7.5L2 9.5l7.4-.9L12 2z"/>
              </svg>
              <span className="text-[11.5px] font-bold text-center leading-tight" style={{ color: loved ? "var(--gold)" : "rgba(255,255,255,0.85)" }}>
                I Loved This{loveCount > 0 ? ` · ${loveCount}` : ""}
              </span>
            </button>

            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white active:scale-[0.96] transition-all disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="m8.6 13.5 6.8 3.9M15.4 6.6 8.6 10.5"/>
              </svg>
              <span className="text-[11.5px] font-bold text-center leading-tight">Share</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
      )}
    </div>
  );
}

/** Simple non-interactive peek slide — prev/next DISH in the vertical track. */
function Slide({ photo, style }: { photo: DishPhoto; style: React.CSSProperties }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.dishName || "Restaurant photo"}
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
      />
    </div>
  );
}

/** Horizontal-track slide — same-dish variants for the currently centered dish. */
function HSlide({
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
