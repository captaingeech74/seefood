"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Restaurant } from "@/lib/types";

const PLANS = {
  starter: {
    name: "Popular 7",
    price: 9,
    limit: "7 dishes · 3 photos each",
    benefits: ["Show your seven most popular dishes", "Management photo badge", "One customer-ready SeeFood URL"],
  },
  standard: {
    name: "Standard",
    price: 99,
    limit: "Up to 75 dishes · 3 photos each",
    benefits: ["Full menu and description controls", "Management photo publishing", "Basic engagement insights"],
  },
  growth: {
    name: "Growth",
    price: 499,
    limit: "Up to 5 locations · 250 dishes each",
    benefits: ["Everything in Standard", "Priority refresh and advanced analytics", "Multi-location and seasonal tools"],
  },
} as const;

export default function MerchantClaimModal({ restaurant, onClose }: { restaurant: Restaurant; onClose: () => void }) {
  const [plan, setPlan] = useState<keyof typeof PLANS>("starter");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessRole, setBusinessRole] = useState("");
  const [authorityAttested, setAuthorityAttested] = useState(false);
  const [paymentAttested, setPaymentAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; value: string; available: boolean }>>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!submitted) return;
    void fetch("/api/merchant-connections/providers")
      .then((response) => response.json())
      .then((result) => setProviders(result.providers ?? []))
      .catch(() => setProviders([]));
  }, [submitted]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/merchant-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: restaurant.placeId ?? restaurant.id, contactName, email, phone, businessRole, plan, authorityAttested, paymentAttested }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit claim");
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not submit claim");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Claim ${restaurant.name}`}>
      <button className="absolute inset-0" onClick={onClose} aria-label="Close claim form" />
      <div className="relative w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/12 bg-[#111114] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 pt-5 pb-3 bg-[#111114]/95 backdrop-blur">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-[0.16em] text-[var(--accent)]">Management access</p>
            <h2 className="text-xl font-bold text-white mt-1">Claim {restaurant.name}</h2>
            <p className="text-[12px] text-white/45 mt-1">Choose the plan you intend to activate after verification.</p>
          </div>
          <button onClick={onClose} className="hit-target w-10 h-10 rounded-full bg-white/8 text-white/65 flex items-center justify-center" aria-label="Close">
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        {submitted ? (
          <div className="px-5 pb-8 pt-5 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-400/15 text-emerald-400 flex items-center justify-center text-2xl">✓</div>
            <h3 className="text-white text-lg font-bold mt-4">Claim received</h3>
            <p className="text-white/55 text-sm mt-2">We’ll review your connection to the restaurant before activating management controls or billing.</p>
            <div className="mt-5 text-left border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4 rounded-lg">
              <p className="text-white text-[13px] font-bold">Your table-side food gallery</p>
              <p className="text-white/55 text-[11px] leading-relaxed mt-1.5">Once approved, employees can simply tell guests: turn on location and open SeeFood. Your restaurant and its most useful food photos appear automatically.</p>
            </div>
            {providers.length > 0 && (
              <div className="mt-6 text-left border-t border-white/10 pt-4">
                <p className="text-white text-sm font-bold">Connect your menu system</p>
                <p className="text-white/40 text-[11px] mt-1">Available after developer access and claim approval.</p>
                <div className="mt-3 space-y-2">
                  {providers.map((provider) => (
                    <button key={provider.id} disabled className="w-full min-h-12 px-3 border border-white/10 bg-white/[0.035] flex items-center justify-between gap-3 text-left opacity-70">
                      <span><span className="block text-white text-[12px] font-bold">{provider.name}</span><span className="block text-white/40 text-[10px] mt-0.5">{provider.value}</span></span>
                      <span className="text-white/30 text-[10px] font-bold">Coming online</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={onClose} className="mt-6 w-full min-h-11 rounded-xl bg-[var(--accent)] text-white font-bold">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 pb-6">
            <div className="grid grid-cols-1 gap-2 mb-5" role="radiogroup" aria-label="Management plan">
              {(Object.entries(PLANS) as Array<[keyof typeof PLANS, (typeof PLANS)[keyof typeof PLANS]]>).map(([key, item]) => (
                <button key={key} type="button" role="radio" aria-checked={plan === key} onClick={() => setPlan(key)} className="text-left rounded-xl border p-3 transition-colors" style={{ borderColor: plan === key ? "var(--accent)" : "rgba(255,255,255,0.1)", background: plan === key ? "rgba(255,107,53,0.1)" : "rgba(255,255,255,0.035)" }}>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-white text-sm font-bold">{item.name}</span>
                    <span className="text-white text-sm font-bold">${item.price}<span className="text-white/35 text-[10px]">/mo</span></span>
                  </div>
                  <p className="text-[10.5px] text-[var(--accent)] font-bold mt-1">{item.limit}</p>
                  <div className="mt-2 space-y-1.5">
                    {item.benefits.map((benefit) => <p key={benefit} className="text-[10.5px] leading-snug text-white/52">✓ {benefit}</p>)}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-white/35 text-[10.5px] leading-relaxed mb-5">Larger menus cost more because every extra dish adds image processing, storage, and serving work. Start with seven; upgrade only when the full menu earns its keep.</p>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="col-span-2 text-[11px] font-bold text-white/60">Your name<input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1.5 w-full rounded-xl bg-white/7 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)]" /></label>
              <label className="col-span-2 text-[11px] font-bold text-white/60">Business email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl bg-white/7 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)]" /></label>
              <label className="text-[11px] font-bold text-white/60">Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 w-full rounded-xl bg-white/7 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)]" /></label>
              <label className="text-[11px] font-bold text-white/60">Your role<input required value={businessRole} onChange={(e) => setBusinessRole(e.target.value)} placeholder="Owner, GM…" className="mt-1.5 w-full rounded-xl bg-white/7 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)] placeholder:text-white/25" /></label>
            </div>

            <label className="flex gap-2.5 mt-5 text-[11px] leading-relaxed text-white/55"><input required type="checkbox" checked={authorityAttested} onChange={(e) => setAuthorityAttested(e.target.checked)} className="mt-0.5 accent-[#ff6b35]" /><span>I attest that I own this restaurant or am authorized to manage its SeeFood presence.</span></label>
            <label className="flex gap-2.5 mt-3 text-[11px] leading-relaxed text-white/55"><input required type="checkbox" checked={paymentAttested} onChange={(e) => setPaymentAttested(e.target.checked)} className="mt-0.5 accent-[#ff6b35]" /><span>I agree to pay ${PLANS[plan].price} per month for the {PLANS[plan].name} plan after approval and activation.</span></label>
            {error && <p className="mt-3 text-rose-400 text-xs">{error}</p>}
            <button disabled={submitting || !authorityAttested || !paymentAttested} className="mt-5 w-full min-h-12 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-35">{submitting ? "Submitting…" : `Request ${PLANS[plan].name} access`}</button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
