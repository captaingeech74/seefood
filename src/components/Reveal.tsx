"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { DishPhoto, Restaurant } from "@/lib/types";
import { provenanceLabel } from "./DishTile";
import { shareDish } from "@/lib/share";
import { pickPrimary } from "@/lib/dishGrouping";
import PhotoSourceSheet from "./PhotoSourceSheet";

interface RevealProps {
  /** Deduped, one-per-dish list — drives vertical prev/next so a dish never repeats while scrolling. */
  photos: DishPhoto[];
  /** Full undeduped pool (every photo, including same-dish duplicates) — used only to find a dish's OTHER photos for horizontal browsing. */
  allPhotos: DishPhoto[];
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

// The image is always capped well short of full-bleed (Kyle: "the image
// should always be constrained to never exceed a certain vertical height
// where it would throw off the arrangement") — this guarantees the top
// cluster (vote button / dots / name) and the bottom info block always have
// somewhere to sit, in the worst case of a near-square viewport + portrait
// photo, without needing per-photo math. Below this cap, object-contain
// still shrinks further for wide/short photos, and the top/bottom clusters
// hug wherever the image actually ends up (measured via imgBounds).
const RESERVED_TOP = 170;
const RESERVED_BOTTOM = 150;
const IMG_MAX_HEIGHT = `max(200px, calc(100dvh - ${RESERVED_TOP + RESERVED_BOTTOM}px))`;
const TOP_CLUSTER_GAP = 16; // gap between the image's top edge and the cluster above it
const TOP_CLUSTER_FLOOR = 76; // never let the cluster's bottom edge creep above the top bar
const BOTTOM_INFO_GAP = 12; // gap between the image's bottom edge and the info block below it
const BOTTOM_INFO_CEILING = 140; // reserve this much room at the bottom of the screen at minimum

/**
 * PRD §4.3 — full-bleed immersive swipe, replaces the old Lightbox entirely.
 * Two independent axes, gesture-locked so a drag can't drift between them:
 *   - Vertical: moves through the ranked dish list (the primary feed).
 *   - Horizontal: browses other photos of the SAME dish ("variants") — a
 *     real 3-slot sliding track exactly like the vertical one, just on the
 *     other axis, layered on top of whichever dish is currently centered.
 */
export default function Reveal({ photos, allPhotos, startIndex, restaurant, onClose }: RevealProps) {
  const [index, setIndex] = useState(startIndex);
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isHAnimating, setIsHAnimating] = useState(false);
  const [isHResetting, setIsHResetting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
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
  const activeImgRef = useRef<HTMLImageElement>(null);
  // Tracks the in-flight vertical transition so a new swipe/tap can interrupt
  // it immediately instead of the user having to wait out the full 300ms —
  // Kyle: "I have to wait a split second before I can make subsequent
  // scrolling actions... make it so I can [go faster]."
  const pendingVerticalRef = useRef<{ timeoutId: number; nextIdx: number } | null>(null);
  const [imgBounds, setImgBounds] = useState<{ top: number; bottom: number } | null>(null);

  const photo = photos[index];
  const prevPhoto = index > 0 ? photos[index - 1] : null;
  const nextPhoto = index < photos.length - 1 ? photos[index + 1] : null;

  const close = useCallback(() => onClose(index), [onClose, index]);

  // Other photos of the SAME dish — exact dish-name match (Gemini's
  // cross-photo grouping isn't persisted yet, so name equality is the
  // practical stand-in). Looked up against the full undeduped pool (not the
  // vertical `photos` list, which only has one photo per dish), plus this
  // session's own uploads.
  const variants = useMemo(() => {
    if (!photo?.dishName) return [photo].filter(Boolean) as DishPhoto[];
    const key = photo.dishName.toLowerCase().trim();
    const fromProps = allPhotos.filter((p) => p.dishName?.toLowerCase().trim() === key);
    const fromUploads = uploadedPhotos.filter((p) => p.dishName?.toLowerCase().trim() === key);
    return [...fromProps, ...fromUploads];
  }, [photo, allPhotos, uploadedPhotos]);

  const activePhoto = variants[variantIndex] ?? photo;
  const prevVariant = variantIndex > 0 ? variants[variantIndex - 1] : null;
  const nextVariant = variantIndex < variants.length - 1 ? variants[variantIndex + 1] : null;
  // Whichever variant currently represents this dish in the grid (see
  // dedupeToPrimary) — the thumbs-up-to-promote control only shows on the
  // OTHER variants, since promoting the one already primary is a no-op.
  const primaryPhoto = useMemo(() => (variants.length > 1 ? pickPrimary(variants) : null), [variants]);

  // Reset which variant is showing whenever the outer (vertical) dish
  // changes — always land back on the ranked photo for the new dish, not
  // wherever horizontal browsing last left off.
  useEffect(() => {
    const idx = variants.findIndex((v) => v.id === photo?.id);
    setVariantIndex(idx >= 0 ? idx : 0);
    setDragX(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  // The vertical swipe-hint arrows sit "just outside the edges of the
  // photo" (Kyle's spec) rather than at a fixed screen position — every
  // photo's rendered height differs under object-contain, so this measures
  // the actual displayed <img> bounds and repositions on every photo change
  // and window resize.
  const measureImgBounds = useCallback(() => {
    const el = activeImgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setImgBounds({ top: r.top, bottom: r.bottom });
  }, []);

  useEffect(() => {
    measureImgBounds();
    window.addEventListener("resize", measureImgBounds);
    return () => window.removeEventListener("resize", measureImgBounds);
  }, [measureImgBounds, activePhoto?.id]);

  // Commits whatever vertical transition is currently in flight immediately
  // (no visible flash — isDragging/isResetting already force transition:none
  // for the frame this runs in), so a new swipe/tap never has to wait out
  // the previous one's remaining animation time.
  const commitPendingVertical = useCallback(() => {
    if (!pendingVerticalRef.current) return;
    clearTimeout(pendingVerticalRef.current.timeoutId);
    const { nextIdx } = pendingVerticalRef.current;
    pendingVerticalRef.current = null;
    setIsResetting(true);
    setIndex(nextIdx);
    setDragY(0);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setIsResetting(false);
      })
    );
  }, []);

  const animateTo = useCallback((targetOffset: number, nextIdx: number) => {
    if (pendingVerticalRef.current) {
      clearTimeout(pendingVerticalRef.current.timeoutId);
      pendingVerticalRef.current = null;
    }
    setDragY(targetOffset);
    const timeoutId = window.setTimeout(() => {
      setIsResetting(true);
      setIndex(nextIdx);
      setDragY(0);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setIsResetting(false);
          pendingVerticalRef.current = null;
        })
      );
    }, ANIM_MS);
    pendingVerticalRef.current = { timeoutId, nextIdx };
  }, []);

  const snapBack = useCallback(() => {
    setDragY(0);
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
    if (index >= photos.length - 1) return;
    animateTo(-window.innerHeight, index + 1);
  }, [index, photos.length, animateTo]);

  const goPrev = useCallback(() => {
    if (index <= 0) return;
    animateTo(window.innerHeight, index - 1);
  }, [index, animateTo]);

  // Once the user has scrolled to the very last dish, there's nothing left
  // to swipe down to — the down-hint slot repurposes into a direct jump
  // back to the top of the feed instead of just disappearing.
  const backToTop = useCallback(() => {
    if (pendingVerticalRef.current) commitPendingVertical();
    setIsResetting(true);
    setIndex(0);
    setDragY(0);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setIsResetting(false))
    );
  }, [commitPendingVertical]);

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
    if (isHAnimating) return;
    if (pendingVerticalRef.current) commitPendingVertical();
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
      animateTo(-window.innerHeight, index + 1);
    } else if (dy > SWIPE_THRESHOLD) {
      // Swipe down: previous dish, or dismiss if already at the top (PRD §4.3).
      if (index === 0) close();
      else {
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

  const [votedPrimary, setVotedPrimary] = useState(false);
  useEffect(() => {
    try {
      setVotedPrimary(activePhoto ? localStorage.getItem(`seefood-voted-primary-${activePhoto.id}`) === "1" : false);
    } catch {
      setVotedPrimary(false);
    }
  }, [activePhoto?.id]);

  const handleVotePrimary = async () => {
    if (!activePhoto || votedPrimary) return;
    setVotedPrimary(true);
    try { localStorage.setItem(`seefood-voted-primary-${activePhoto.id}`, "1"); } catch {}
    try {
      const res = await fetch("/api/vote-primary-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: activePhoto.id }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setVotedPrimary(false);
      try { localStorage.removeItem(`seefood-voted-primary-${activePhoto.id}`); } catch {}
    }
  };

  const [uploading, setUploading] = useState(false);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const handleFileSelected = async (file: File) => {
    if (!activePhoto) return;
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
          imgRef={activeImgRef}
          onImgLoad={measureImgBounds}
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
          gesture once (globally, via localStorage), then both edges light up.
          Stays visible through the detail sheet too (Kyle: horizontal/
          vertical browsing still works there, so the hints should keep
          showing, not just the dots). */}
      {!isDragging && nextVariant && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none swipe-hint-right">
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
        </div>
      )}
      {!isDragging && discoveredHSwipe && prevVariant && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none swipe-hint-left">
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </div>
        </div>
      )}

      {/* Vertical swipe hint — sits just outside the photo's actual rendered
          edges (measured via imgBounds, not a fixed screen position, since
          object-contain photos vary in displayed height). Replaces the old
          bounce-chevron + "Swipe for next dish" text entirely. */}
      {!isDragging && imgBounds && prevPhoto && (
        <div
          className="absolute left-1/2 z-10 pointer-events-none swipe-hint-up"
          style={{ top: Math.max(imgBounds.top - 36, 56) }}
        >
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </div>
        </div>
      )}
      {!isDragging && imgBounds && nextPhoto && (
        <div
          className="absolute left-1/2 z-10 pointer-events-none swipe-hint-down"
          style={{ top: Math.min(imgBounds.bottom + 4, (typeof window !== "undefined" ? window.innerHeight : 800) - 96) }}
        >
          <div className="w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      )}
      {!isDragging && imgBounds && !nextPhoto && (
        <button
          onClick={backToTop}
          className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 pl-2.5 pr-3.5 py-1.5 rounded-full bg-black/45 backdrop-blur-sm active:scale-95 transition-transform"
          style={{ top: Math.min(imgBounds.bottom + 4, (typeof window !== "undefined" ? window.innerHeight : 800) - 96) }}
          aria-label="Back to top"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          <span className="text-white/85 text-[12px] font-bold">Back to top</span>
        </button>
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

      {/* Top cluster — vote button, variant dots, dish name, stacked and
          anchored as ONE group a fixed gap above the image's actual
          rendered top edge (not a fixed screen position). A flex column
          sized to whichever pieces are actually rendered + translateY(-100%)
          means the group's bottom edge always lands exactly TOP_CLUSTER_GAP
          above the photo regardless of which of the three are present —
          Kyle: "too far away from it" for horizontal (short) photos when
          these were pinned to fixed screen offsets instead. Clamped with a
          floor so a near-full-height portrait photo never pushes the
          cluster up under (or above) the top bar. */}
      <div
        className="absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-8 pointer-events-none"
        style={{
          top: Math.max((imgBounds?.top ?? 400) - TOP_CLUSTER_GAP, TOP_CLUSTER_FLOOR),
          transform: "translateY(-100%)",
        }}
      >
        {!detailOpen && primaryPhoto && activePhoto.id !== primaryPhoto.id && (
          <button
            onClick={handleVotePrimary}
            disabled={votedPrimary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold active:scale-95 transition-all pointer-events-auto"
            style={{
              background: votedPrimary ? "rgba(52,211,153,0.16)" : "rgba(0,0,0,0.4)",
              color: votedPrimary ? "var(--success)" : "rgba(255,255,255,0.75)",
              backdropFilter: "blur(6px)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={votedPrimary ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 10v12M15 5.88 14 10h6.28a2 2 0 0 1 1.94 2.5l-2.06 8a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h.5a2.5 2.5 0 0 1 2.5 2.5c0 .38-.07.75-.2 1.11L15 5.88Z" />
            </svg>
            {votedPrimary ? "Voted as best photo" : "Make this the main photo"}
          </button>
        )}

        {variants.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
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

        {!detailOpen && photo.dishName && (
          <h2
            className="text-white text-[24px] font-extrabold leading-tight tracking-tight truncate max-w-full text-center"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.65)" }}
          >
            {photo.dishName}
          </h2>
        )}
      </div>

      {/* Bottom info — provenance badge + tap/swipe instructions (hidden
          while detail is open). Anchored a fixed gap below the image's
          actual rendered bottom edge rather than pinned to the screen
          bottom, so it hugs short/horizontal photos instead of floating far
          beneath them — clamped with a ceiling so a near-full-height photo
          still leaves this block fully on-screen above the safe area. No
          longer needs a fade-to-black gradient: with RESERVED_BOTTOM always
          held clear, this block never actually overlaps the photo. */}
      {!detailOpen && (
        <div
          className="absolute inset-x-0 z-10 px-5 pt-3 pointer-events-none"
          style={{
            top: Math.min(
              (imgBounds?.bottom ?? 400) + BOTTOM_INFO_GAP,
              (typeof window !== "undefined" ? window.innerHeight : 800) - BOTTOM_INFO_CEILING
            ),
            paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          }}
        >
          {photo.dishName ? (
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full"
                style={{
                  background: photo.isMenuMatch ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)",
                  color: photo.isMenuMatch ? "var(--success)" : "rgba(255,255,255,0.55)",
                  letterSpacing: "0.1em",
                }}
              >
                {provenanceLabel(photo)}
              </span>
            </div>
          ) : (
            <p className="text-white/50 text-[15px] font-medium italic mb-2">No dish identified</p>
          )}

          {/* Vertical "swipe for next dish" no longer needs text — it's
              taught visually now by the up/down arrow hints beside the
              photo. The horizontal same-dish-photos note stays (Kyle only
              asked to remove the vertical mention), just carried by bigger
              type now that it's doing more of the teaching. */}
          <p className="text-white/45 text-[15px] font-semibold pointer-events-auto">
            Tap for details
            {variants.length > 1 ? ` · Swipe ${discoveredHSwipe ? "↔" : "→"} more photos` : ""}
          </p>
        </div>
      )}

      {/* Dish Detail sheet (PRD §4.3 tap-in). Tap-to-close only (preserves
          the photo swipe gestures underneath), so this uses a visible top
          border/glow to read as a distinct overlay instead of a misleading
          "slide to close" drag handle. The rounded corner + glass blur live
          on this OUTER wrapper, which is overflow-hidden (a hard clip that
          holds regardless of how a given browser handles backdrop-filter +
          border-radius compositing) — the actual scrolling happens on an
          INNER div with its own padding, so the corner clip is never at the
          mercy of whatever padding the scrollable content needs. */}
      {detailOpen && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 glass rounded-t-3xl overflow-hidden slide-up"
          style={{
            background: "rgba(10,10,10,0.94)",
            borderTop: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 -12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            maxHeight: "74vh",
          }}
        >
          <div
            className="px-6 pt-7 overflow-y-auto"
            style={{
              maxHeight: "74vh",
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
            }}
          >
          {photo.dishName && (
            <h3 className="text-white text-[21px] font-bold mb-2 tracking-tight">{photo.dishName}</h3>
          )}
          {photo.dishDescription && (
            <p className="text-white/65 text-[14px] leading-relaxed">{photo.dishDescription}</p>
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
              onClick={() => setPhotoSourceOpen(true)}
              disabled={uploading}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border active:scale-[0.96] transition-all disabled:opacity-50"
              style={{ background: "var(--surface-2)", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span className="text-[11.5px] font-bold text-white/85 text-center leading-tight">
                {uploading ? "Uploading…" : "Add a Photo"}
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
          </div>
        </div>
      )}

      <PhotoSourceSheet
        open={photoSourceOpen}
        onClose={() => setPhotoSourceOpen(false)}
        onPick={handleFileSelected}
      />
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
        className="max-w-full object-contain select-none"
        style={{ maxHeight: IMG_MAX_HEIGHT }}
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
  imgRef,
  onImgLoad,
  style,
}: {
  photo: DishPhoto;
  interactive?: boolean;
  onTap?: () => void;
  /** Only passed for the active/interactive slide — used to measure its rendered bounds for the vertical swipe-hint arrows. */
  imgRef?: React.RefObject<HTMLImageElement | null>;
  onImgLoad?: () => void;
  style: React.CSSProperties;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={photo.url}
      alt={photo.dishName || "Restaurant photo"}
      className="max-w-full object-contain select-none"
      style={{ maxHeight: IMG_MAX_HEIGHT }}
      draggable={false}
      onLoad={onImgLoad}
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
