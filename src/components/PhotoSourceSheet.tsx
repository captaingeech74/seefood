"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Explicit Camera-vs-Library chooser — two dedicated <input type=file>
 * elements (one with capture="environment", one without) behind a small
 * action sheet, rather than gambling on a single input's OS/browser-
 * dependent behavior.
 *
 * Why not just one input: `capture="environment"` alone launches the
 * camera directly on most devices, but whether that camera view ALSO
 * offers a small "jump to your existing photos" shortcut depends entirely
 * on which camera app the OS/browser hands off to — some do, some don't
 * (confirmed: Kyle's Android showed camera-only, no gallery option).
 * Dropping `capture` entirely swings the other way — some browsers default
 * the resulting generic chooser straight to Photos, skipping camera
 * entirely (also confirmed live). Presenting both explicitly, like every
 * major photo-upload flow (Instagram, WhatsApp, etc.) does, is the only way
 * to guarantee both remain one tap away regardless of device quirks.
 */
export default function PhotoSourceSheet({
  open,
  onClose,
  onPick,
  onSourceChoice,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: File, source: "camera" | "library") => void;
  onSourceChoice?: (source: "camera" | "library") => void;
  onCancel?: () => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const selectedSource = useRef<"camera" | "library">("library");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) setRightsAccepted(false);
  }, [open]);
  useEffect(() => {
    if (!mounted) return;
    const cancelled = () => {
      onCancel?.();
      onClose();
    };
    const inputs = [cameraInputRef.current, libraryInputRef.current];
    inputs.forEach((input) => input?.addEventListener("cancel", cancelled));
    return () =>
      inputs.forEach((input) => input?.removeEventListener("cancel", cancelled));
  }, [mounted, onCancel, onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file, selectedSource.current);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={handleChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={handleChange}
      />

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-end justify-center fade-in"
          onClick={(event) => {
            event.stopPropagation();
            onCancel?.();
            onClose();
          }}
        >
          <div
            className="w-full max-w-3xl glass rounded-t-3xl p-4 slide-up"
            style={{ background: "rgba(20,20,20,0.97)", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />

            <label className="flex items-start gap-3 px-3 py-3 mb-2 rounded-2xl bg-white/5 text-left">
              <input
                type="checkbox"
                checked={rightsAccepted}
                onChange={(event) => setRightsAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange-500"
              />
              <span className="text-[12.5px] leading-relaxed text-white/75">
                I took this photo or have permission to share it, and I allow SeeFood to
                display it with this dish.
              </span>
            </label>

            <button
              disabled={!rightsAccepted}
              onClick={() => {
                selectedSource.current = "camera";
                onSourceChoice?.("camera");
                cameraInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 py-3.5 px-3 rounded-2xl active:bg-white/8 transition-colors disabled:opacity-35"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface-2)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
              <span className="text-white text-[15px] font-bold">Take Photo</span>
            </button>

            <button
              disabled={!rightsAccepted}
              onClick={() => {
                selectedSource.current = "library";
                onSourceChoice?.("library");
                libraryInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 py-3.5 px-3 rounded-2xl active:bg-white/8 transition-colors disabled:opacity-35"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surface-2)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </span>
              <span className="text-white text-[15px] font-bold">Choose from Library</span>
            </button>

            <button
              onClick={() => {
                onCancel?.();
                onClose();
              }}
              className="w-full mt-1.5 py-3 text-center text-white/45 font-semibold text-[14px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
