"use client";

import { useState } from "react";
import { DishPhoto, Restaurant } from "@/lib/types";
import PhotoSourceSheet from "./PhotoSourceSheet";

interface SuggestDishModalProps {
  restaurant: Restaurant;
  onClose: () => void;
  onAdded: (photo: DishPhoto) => void;
}

const CONFETTI = ["🎉", "🍽️", "✨", "🥳", "👏", "🌟"];

/**
 * "Add a Missing Photo or Menu Item" — for a diner sitting at the table with
 * a dish SeeFood has no photo or menu record of. A name, a photo, and an
 * attestation that they were actually served it. Hidden under the
 * restaurant-name caret (Kyle's spec). The delight is threefold: an
 * AI-written description when the diner leaves it blank, a confetti
 * celebration on success, and a "Menu Scout" milestone badge tracked
 * per-browser via localStorage — small surprises that reward the action
 * without needing any accounts.
 */
export default function SuggestDishModal({ restaurant, onClose, onAdded }: SuggestDishModalProps) {
  const [dishName, setDishName] = useState("");
  const [dishDescription, setDishDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ photo: DishPhoto; aiWrote: boolean; scoutCount: number } | null>(null);

  const handleFileSelected = (f: File) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const canSubmit = dishName.trim().length > 0 && !!file && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("placeId", restaurant.placeId || restaurant.id);
      form.append("dishName", dishName.trim());
      form.append("dishDescription", dishDescription.trim());
      form.append("attested", "true");
      const res = await fetch("/api/suggest-dish", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.photo) {
        setError(data.error || "Something went wrong — please try again.");
        setSubmitting(false);
        return;
      }

      let scoutCount = 1;
      try {
        scoutCount = parseInt(localStorage.getItem("seefood-dishes-suggested") || "0", 10) + 1;
        localStorage.setItem("seefood-dishes-suggested", String(scoutCount));
      } catch {}

      setResult({ photo: data.photo, aiWrote: !!data.aiWrote, scoutCount });
      onAdded(data.photo);
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 flex items-end justify-center fade-in" onClick={onClose}>
      <div
        className="w-full max-w-3xl glass rounded-t-3xl px-6 pt-6 slide-up max-h-[88vh] overflow-y-auto"
        style={{ background: "rgba(10,10,10,0.96)", paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-5" />

        {result ? (
          <SuccessState result={result} onDone={onClose} />
        ) : (
          <>
            <h2 className="text-white text-[22px] font-bold mb-6 tracking-tight">Add a Missing Photo or Menu Item</h2>

            <label className="block text-[13px] font-bold text-white/55 mb-2">
              Dish Name <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <input
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="e.g. Spicy Tuna Roll"
              maxLength={60}
              className="w-full px-4 py-4 rounded-2xl text-white text-[18px] font-semibold mb-5 outline-none focus:ring-2 focus:ring-[var(--accent-ring)] placeholder:text-white/25 placeholder:font-normal"
              style={{ background: "var(--surface-2)" }}
            />

            <label className="block text-[13px] font-bold text-white/55 mb-2">
              Description <span className="font-medium text-white/30">(optional)</span>
            </label>
            <textarea
              value={dishDescription}
              onChange={(e) => setDishDescription(e.target.value)}
              placeholder="Leave blank and we'll write one for you from your photo ✨"
              maxLength={300}
              rows={2}
              className="w-full px-4 py-3.5 rounded-2xl text-white text-[15px] mb-5 outline-none resize-none focus:ring-2 focus:ring-[var(--accent-ring)] placeholder:text-white/25"
              style={{ background: "var(--surface-2)" }}
            />

            <label className="block text-[13px] font-bold text-white/55 mb-2">
              Photo <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <button
              onClick={() => setPhotoSourceOpen(true)}
              className="w-full rounded-2xl mb-5 overflow-hidden border-2 border-dashed flex items-center justify-center transition-colors active:scale-[0.99]"
              style={{
                borderColor: previewUrl ? "transparent" : "rgba(255,255,255,0.18)",
                background: "var(--surface-2)",
                height: previewUrl ? 200 : 110,
              }}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/50">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Tap to add a photo</span>
                </div>
              )}
            </button>

            <p className="text-[12.5px] text-white/40 leading-relaxed mb-6">
              * I confirm I was served this at {restaurant.name}.
            </p>

            {error && <p className="text-rose-400 text-[13px] mb-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl text-[16px] font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
            >
              {submitting ? "Adding to the menu…" : "Add This Dish"}
            </button>
          </>
        )}
      </div>

      <PhotoSourceSheet
        open={photoSourceOpen}
        onClose={() => setPhotoSourceOpen(false)}
        onPick={handleFileSelected}
      />
    </div>
  );
}

function SuccessState({
  result,
  onDone,
}: {
  result: { photo: DishPhoto; aiWrote: boolean; scoutCount: number };
  onDone: () => void;
}) {
  const isFirstEver = result.scoutCount === 1;
  return (
    <div className="pb-2 text-center fade-in">
      <div className="relative h-16 mb-2">
        {CONFETTI.map((emoji, i) => (
          <span
            key={i}
            className="absolute text-2xl confetti-piece"
            style={{
              left: `${8 + i * 16}%`,
              animationDelay: `${i * 70}ms`,
            }}
          >
            {emoji}
          </span>
        ))}
      </div>

      <h2 className="text-white text-[20px] font-bold mb-1.5">
        {isFirstEver ? "You're a Menu Scout! 🎖️" : "Added to the menu!"}
      </h2>
      <p className="text-white/55 text-[13.5px] mb-1 leading-relaxed px-4">
        <strong className="text-white/80">{result.photo.dishName}</strong> is now live for other diners to see.
      </p>
      {result.aiWrote && (
        <p className="text-white/35 text-[12px] mb-1 italic">
          We wrote a description from your photo — you can always edit it later.
        </p>
      )}
      <p className="text-white/35 text-[12px] mb-6">
        {isFirstEver
          ? "That's your first contribution — thank you!"
          : `That's ${result.scoutCount} dishes you've added. Legend.`}
      </p>

      <button
        onClick={onDone}
        className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all"
      >
        Nice
      </button>
    </div>
  );
}
