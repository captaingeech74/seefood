"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createPromotion,
  getMemberHookups,
  getPromotions,
  HookupPromotion,
  redeemHookup,
} from "@/lib/demoHookups";

const USER_PHOTOS = [
  "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10187-0.webp",
  "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10191-0.webp",
  "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10199-0.webp",
  "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10201-0.webp",
];

const SUPPORTERS = [
  { id: "maya-r", name: "Maya R.", signal: "14 loves · 3 photos" },
  { id: "chris-t", name: "Chris T.", signal: "11 loves · 5 visits" },
  { id: "jordan-k", name: "Jordan K.", signal: "9 loves · 2 photos" },
  { id: "alexa-p", name: "Alexa P.", signal: "8 loves · 4 visits" },
];

interface Manager {
  id: string;
  name: string;
  role: string;
  phone: string;
}

function Metric({ value, label, tone = "white" }: { value: string; label: string; tone?: "white" | "orange" | "green" }) {
  const color = tone === "orange" ? "var(--accent)" : tone === "green" ? "#38d996" : "white";
  return <div className="min-w-0"><p className="text-[23px] font-bold tabular-nums" style={{ color }}>{value}</p><p className="text-white/38 text-[9.5px] font-bold uppercase leading-tight mt-1">{label}</p></div>;
}

function RedeemPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => controlsRef.current?.stop(), []);

  const finish = (code: string) => {
    const redeemed = redeemHookup(code);
    setMessage(redeemed ? `${redeemed.title} marked used.` : "That code is not an active SeeFood Hookup.");
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  const start = async () => {
    setMessage("");
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) return;
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) finish(result.getText());
      });
    } catch {
      setScanning(false);
      setMessage("Camera scanning is unavailable here. The sample redemption button still exercises the full flow.");
    }
  };

  return (
    <section className="pt-5">
      <p className="text-[9px] uppercase font-bold text-emerald-400">At the restaurant</p>
      <h2 className="text-white text-[18px] font-bold mt-1">Redeem a Hookup</h2>
      <p className="text-white/42 text-[11px] leading-relaxed mt-1">Scan the member’s code. SeeFood marks it used; no payment information changes hands.</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-[#151515]">
        {scanning && <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" muted playsInline />}
        <div className="flex gap-2 p-3">
          <button type="button" onClick={scanning ? () => { controlsRef.current?.stop(); setScanning(false); } : start} className="flex-1 min-h-11 rounded-md bg-white text-black text-[12px] font-bold">{scanning ? "Stop Camera" : "Scan QR Code"}</button>
          <button type="button" onClick={() => finish(getMemberHookups()[0]?.code || "")} className="px-3 min-h-11 rounded-md border border-white/12 text-white/60 text-[11px] font-bold">Try Sample</button>
        </div>
      </div>
      {message && <p className="mt-2 text-[11px] text-emerald-300">{message}</p>}
    </section>
  );
}

function MenuHealthDrawer({ onClose }: { onClose: () => void }) {
  const [queued, setQueued] = useState<string[]>([]);
  const actions = [
    { value: "7", title: "Menu items have no photo", detail: "Add one management photo to make each item visible.", action: "Add photos", tone: "#ff8d65" },
    { value: "4", title: "Items only show management photos", detail: "Invite customer photos to unlock trusted comparisons.", action: "Request photos", tone: "#d9b8ff" },
    { value: "3", title: "Lead photos need attention", detail: "Low opens suggest these photos are not selling the item.", action: "Review leads", tone: "#79b9ff" },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Menu Photo Health" onClick={onClose}>
      <div className="w-full max-w-3xl h-[88vh] overflow-y-auto rounded-t-2xl bg-[#141414] border-t border-white/12 px-4 pt-4 pb-8 slide-up" onClick={(event) => event.stopPropagation()}>
        <div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-sky-300">Make every menu item visible</p><h2 className="text-white text-[20px] font-bold">Menu Photo Health</h2></div><button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div>
        <div className="mt-5 flex items-center gap-4 pb-5 border-b border-white/8"><div className="w-16 h-16 rounded-full border-[5px] border-[var(--accent)] flex items-center justify-center text-white text-[15px] font-bold">81%</div><div><p className="text-white text-[14px] font-bold">29 of 36 items can be seen</p><p className="text-white/38 text-[10.5px] mt-1">53 photos · 1.8 per photographed item</p></div></div>
        <div className="grid grid-cols-3 gap-3 py-5 border-b border-white/8"><Metric value="31" label="Customer" tone="green" /><Metric value="22" label="Management" tone="orange" /><Metric value="6" label="Comparisons" /></div>
        <p className="text-white/35 text-[9px] uppercase font-bold mt-5">Best next improvements</p>
        <div className="mt-2 border-y border-white/8">
          {actions.map((item) => {
            const isQueued = queued.includes(item.title);
            return <div key={item.title} className="py-4 border-b border-white/7 last:border-0"><div className="flex gap-3"><span className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-[13px] font-bold" style={{ background: `${item.tone}18`, color: item.tone }}>{item.value}</span><div className="min-w-0 flex-1"><p className="text-white text-[12.5px] font-bold">{item.title}</p><p className="text-white/38 text-[10px] leading-relaxed mt-1">{item.detail}</p></div></div><button onClick={() => setQueued((current) => isQueued ? current.filter((value) => value !== item.title) : [...current, item.title])} className="ml-12 mt-2 min-h-9 px-3 rounded-md border text-[10px] font-bold" style={{ borderColor: isQueued ? item.tone : "rgba(255,255,255,.12)", color: isQueued ? item.tone : "rgba(255,255,255,.65)" }}>{isQueued ? "Added to improvement list ✓" : item.action}</button></div>;
          })}
        </div>
        <a href="/manage/insights" className="mt-5 min-h-11 rounded-md bg-white text-black flex items-center justify-center text-[11px] font-bold">See what customers think →</a>
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [tab, setTab] = useState<"home" | "hookups" | "redeem">("home");
  const [healthOpen, setHealthOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [expandedPromotion, setExpandedPromotion] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<HookupPromotion[]>([]);
  const [recipientMode, setRecipientMode] = useState<"single" | "group">("group");
  const [managers, setManagers] = useState<Manager[]>([
    { id: "kyle", name: "Kyle", role: "Owner", phone: "(951) 555-0148" },
    { id: "maya", name: "Maya", role: "General Manager", phone: "(951) 555-0182" },
    { id: "chris", name: "Chris", role: "Shift Manager", phone: "(951) 555-0197" },
  ]);
  const [managerDraft, setManagerDraft] = useState({ name: "", role: "", phone: "" });
  const [managerToRemove, setManagerToRemove] = useState<Manager | null>(null);

  useEffect(() => {
    setPromotions(getPromotions());
    const params = new URLSearchParams(window.location.search);
    if (params.get("hookup") === "1") {
      setTab("hookups");
      setCreateOpen(true);
    }
    if (params.get("health") === "1") setHealthOpen(true);
  }, []);

  const submitPromotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supporterId = String(form.get("supporter") || SUPPORTERS[0].id);
    const supporter = SUPPORTERS.find((item) => item.id === supporterId) ?? SUPPORTERS[0];
    const audienceSize = recipientMode === "single" ? 1 : Number(form.get("audienceSize") || 25);
    const promotion = createPromotion({
      title: String(form.get("title") || "A Hookup for Your Table"),
      offer: String(form.get("offer") || "20% off for you and friends"),
      audienceSize,
      recipientMode,
      recipientLabel: recipientMode === "single" ? supporter.name : `Top ${audienceSize} supporters`,
      message: String(form.get("message") || ""),
      expiresAt: new Date(`${String(form.get("expiresAt"))}T23:59:59Z`).toISOString(),
    });
    setPromotions((current) => [promotion, ...current]);
    setCreateOpen(false);
    setTab("hookups");
  };

  const addManager = () => {
    if (!managerDraft.name.trim() || !managerDraft.phone.trim()) return;
    setManagers((current) => [...current, { id: crypto.randomUUID(), name: managerDraft.name.trim(), role: managerDraft.role.trim() || "Manager", phone: managerDraft.phone.trim() }]);
    setManagerDraft({ name: "", role: "", phone: "" });
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto bg-[var(--surface-0)] pb-24">
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <a href="/me" className="w-9 h-9 rounded-full bg-white/7 flex items-center justify-center text-white/65" aria-label="Back to My SeeFood">←</a>
        <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-[var(--accent)]">Management sample</p><h1 className="text-[19px] font-bold truncate">LRay’s Kitchen</h1></div>
        <span className="px-2 py-1 rounded-md bg-emerald-400/12 text-emerald-300 text-[9px] font-bold">STANDARD</span>
      </header>

      <div className="px-4">
        {tab === "home" && (
          <div className="fade-up">
            <section className="py-5 border-b border-white/8">
              <div className="flex items-start justify-between gap-4"><div><p className="text-white text-[17px] font-bold">Good morning, Kyle</p><p className="text-white/38 text-[11px] mt-1">Your menu is getting more useful.</p></div><button onClick={() => { setTab("hookups"); setCreateOpen(true); }} className="px-3.5 min-h-10 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold">Send a Hookup</button></div>
              <div className="grid grid-cols-3 gap-4 mt-5"><Metric value="36" label="Menu items" /><Metric value="29" label="With photos" tone="orange" /><Metric value="487" label="Menu item loves" tone="green" /></div>
            </section>

            <a href="/manage/insights" className="py-5 border-b border-white/8 flex items-center gap-3">
              <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-amber-300">Customer-side truth</p><h2 className="text-white text-[18px] font-bold mt-1">Menu Intelligence</h2><p className="text-white/38 text-[11px] mt-1">See what is rising, slipping, and changing, then act.</p></div>
              <div className="text-right"><p className="text-emerald-300 text-[12px] font-bold">3 rising</p><p className="text-rose-300 text-[9px] mt-1">2 need attention</p></div><span className="text-white/25">›</span>
            </a>

            <section className="py-5 border-b border-white/8">
              <button onClick={() => setHealthOpen(true)} className="w-full flex items-center gap-3 text-left">
                <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-sky-300">Make the menu visible</p><h2 className="text-white text-[18px] font-bold mt-1">Menu Photo Health</h2><p className="text-white/38 text-[11px] mt-1">81% of your menu can be seen · 3 actions ready.</p></div>
                <div className="w-12 h-12 rounded-full border-4 border-[var(--accent)] flex items-center justify-center text-[11px] font-bold">81%</div><span className="text-white/25">›</span>
              </button>
            </section>

            <section className="py-5 border-b border-white/8">
              <div className="flex items-end justify-between"><div><p className="text-[9px] uppercase font-bold text-emerald-400">What diners show</p><h2 className="text-white text-[18px] font-bold mt-1">Customer photos</h2></div><span className="text-white/30 text-[10px]">31 total</span></div>
              <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">{USER_PHOTOS.map((photo, index) => <div key={photo} className="relative w-32 aspect-[4/5] shrink-0 overflow-hidden rounded-lg bg-white/5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo} alt={`Customer food photo ${index + 1}`} className="w-full h-full object-cover" /><span className="absolute left-2 bottom-2 px-1.5 py-1 rounded bg-black/75 text-white text-[9px] font-bold">{[82, 61, 49, 37][index]} loves</span></div>)}</div>
            </section>

            <section className="py-5 border-b border-white/8">
              <p className="text-[9px] uppercase font-bold text-violet-300">Profiles</p>
              <div className="mt-3 space-y-3"><div className="flex justify-between gap-4"><span className="text-white/42 text-[11px]">Restaurant</span><span className="text-white text-[11px] font-bold text-right">LRay’s Kitchen · Temecula</span></div><div className="flex justify-between gap-4"><span className="text-white/42 text-[11px]">Owner</span><span className="text-white text-[11px] font-bold text-right">Kyle · Owner</span></div><div className="flex justify-between gap-4"><span className="text-white/42 text-[11px]">Management team</span><span className="text-white text-[11px] font-bold text-right">{managers.length} people</span></div></div>
              <button onClick={() => setProfileOpen(true)} className="mt-4 min-h-10 px-3 rounded-md border border-white/12 text-white/60 text-[11px] font-bold">Manage Profiles & Team</button>
            </section>
          </div>
        )}

        {tab === "hookups" && (
          <div className="fade-up pt-5">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] uppercase font-bold text-[var(--accent)]">Recognition that brings a table</p><h2 className="text-white text-[21px] font-bold mt-1">Hookups</h2><p className="text-white/42 text-[11px] leading-relaxed mt-1 max-w-sm">Message one supporter personally or recognize your strongest group. Offers for friends stay the default.</p></div><button onClick={() => setCreateOpen(true)} className="shrink-0 px-3 min-h-10 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold">New</button></div>
            <div className="mt-5 border-y border-white/8">
              {promotions.map((promotion) => <div key={promotion.id} className="border-b border-white/7 last:border-0"><button onClick={() => setExpandedPromotion(expandedPromotion === promotion.id ? null : promotion.id)} className="w-full py-4 text-left"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-white text-[13px] font-bold truncate">{promotion.title}</p><p className="text-white/38 text-[10.5px] truncate mt-1">{promotion.offer}</p></div><span className="text-white/30 text-[10px] whitespace-nowrap">{new Date(promotion.expiresAt).toLocaleDateString()}</span></div><div className="flex gap-4 mt-2 text-[9.5px] font-bold"><span className="text-[var(--accent)]">{promotion.recipientLabel}</span><span className="text-emerald-300">{promotion.redeemedBy.length} used</span></div></button>{expandedPromotion === promotion.id && <div className="pb-4 fade-in"><p className="text-white/32 text-[9px] uppercase font-bold">Message</p><p className="text-white/60 text-[11px] mt-2">{promotion.message || "No message added."}</p><p className="text-white/32 text-[9px] uppercase font-bold mt-3">Redeemed by</p><p className="text-white/60 text-[11px] mt-2">{promotion.redeemedBy.length ? promotion.redeemedBy.join(" · ") : "No redemptions yet"}</p></div>}</div>)}
            </div>
          </div>
        )}
        {tab === "redeem" && <div className="fade-up"><RedeemPanel /></div>}
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-30 max-w-3xl mx-auto bg-black/95 backdrop-blur border-t border-white/8 grid grid-cols-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {([["home", "Overview"], ["hookups", "Hookups"], ["redeem", "Redeem"]] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className="min-h-14 text-[10px] font-bold" style={{ color: tab === value ? "var(--accent)" : "rgba(255,255,255,.35)" }}>{label}</button>)}
        <a href="/manage/insights" className="min-h-14 flex items-center justify-center text-amber-300 text-[10px] font-bold">Insights</a>
      </nav>

      {healthOpen && <MenuHealthDrawer onClose={() => setHealthOpen(false)} />}

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Create a Hookup" onClick={() => setCreateOpen(false)}>
          <form onSubmit={submitPromotion} onClick={(event) => event.stopPropagation()} className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#151515] rounded-t-2xl border-t border-white/12 px-4 pt-4 pb-7 slide-up">
            <div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-4" /><h2 className="text-white text-[19px] font-bold">Send a Hookup</h2><p className="text-white/42 text-[11px] mt-1">Recognition first, offer second. Make it personal and make it worth bringing friends.</p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/6 rounded-md mt-4">{(["single", "group"] as const).map((value) => <button key={value} type="button" onClick={() => setRecipientMode(value)} className="min-h-9 rounded text-[10.5px] font-bold capitalize" style={{ background: recipientMode === value ? "white" : "transparent", color: recipientMode === value ? "black" : "rgba(255,255,255,.45)" }}>{value === "single" ? "One supporter" : "Top supporters"}</button>)}</div>
            <div className="space-y-3 mt-4">
              {recipientMode === "single" ? <label className="block text-white/45 text-[10px] font-bold">Supporter<select name="supporter" className="mt-1.5 w-full bg-[#242424] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]">{SUPPORTERS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.signal}</option>)}</select></label> : <label className="block text-white/45 text-[10px] font-bold">Audience<select name="audienceSize" defaultValue="25" className="mt-1.5 w-full bg-[#242424] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]"><option value="10">Top 10 supporters</option><option value="25">Top 25 supporters</option><option value="50">Top 50 supporters</option><option value="100">Top 100 supporters</option></select></label>}
              <label className="block text-white/45 text-[10px] font-bold">Promotion<input name="title" required defaultValue="A Hookup for Your Table" className="mt-1.5 w-full bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] outline-none" /></label>
              <label className="block text-white/45 text-[10px] font-bold">Offer<input name="offer" required defaultValue="20% off for you and up to 3 friends" className="mt-1.5 w-full bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] outline-none" /></label>
              <label className="block text-white/45 text-[10px] font-bold">Message<textarea name="message" required defaultValue="You have shown our kitchen a lot of love. Bring some friends and let us return the favor." rows={3} className="mt-1.5 w-full resize-none bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] leading-relaxed outline-none" /></label>
              <label className="block text-white/45 text-[10px] font-bold">Expires<input name="expiresAt" type="date" required defaultValue={new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)} className="mt-1.5 w-full bg-[#242424] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /></label>
            </div>
            <div className="flex gap-2 mt-5"><button type="button" onClick={() => setCreateOpen(false)} className="flex-1 min-h-11 border border-white/10 rounded-md text-white/45 text-[12px] font-bold">Cancel</button><button className="flex-[2] min-h-11 bg-[var(--accent)] rounded-md text-white text-[12px] font-bold">Send Hookup + Message</button></div>
          </form>
        </div>
      )}

      {profileOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Manage profiles and team" onClick={() => setProfileOpen(false)}>
          <div className="w-full max-w-3xl h-[90vh] overflow-y-auto bg-[#151515] rounded-t-2xl border-t border-white/12 px-4 pt-4 pb-8 slide-up" onClick={(event) => event.stopPropagation()}>
            <div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-4" /><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-violet-300">Management identity</p><h2 className="text-white text-[19px] font-bold mt-1">Profiles & Team</h2></div><button onClick={() => setProfileOpen(false)} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div>
            <section className="mt-5 pb-5 border-b border-white/8"><p className="text-white text-[13px] font-bold">Restaurant profile</p><div className="grid grid-cols-2 gap-2 mt-3"><input defaultValue="LRay’s Kitchen" aria-label="Restaurant name" className="col-span-2 bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /><input defaultValue="Temecula, CA 92591" aria-label="Restaurant location" className="col-span-2 bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /><input defaultValue="(951) 555-0148" aria-label="Restaurant phone" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /><input defaultValue="lrayskitchen.com" aria-label="Restaurant website" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /></div></section>
            <section className="py-5 border-b border-white/8"><p className="text-white text-[13px] font-bold">Owner profile</p><div className="grid grid-cols-2 gap-2 mt-3"><input defaultValue="Kyle" aria-label="Owner name" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /><input defaultValue="Owner" aria-label="Owner role" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /><input defaultValue="kyle@lrayskitchen.com" aria-label="Owner email" className="col-span-2 bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /></div></section>
            <section className="py-5"><p className="text-white text-[13px] font-bold">Owners & managers</p><p className="text-white/35 text-[10px] mt-1">Standard includes multiple owners and managers. Phone numbers will power secure invitations.</p>
              <div className="mt-3 border-y border-white/8">{managers.map((manager, index) => <div key={manager.id} className="flex items-center gap-3 py-3 border-b border-white/7 last:border-0"><span className="w-7 h-7 rounded-full bg-violet-300/10 text-violet-200 flex items-center justify-center text-[9px] font-bold">{manager.name.charAt(0)}</span><span className="min-w-0 flex-1"><span className="block text-white/70 text-[11px]">{manager.name} · {manager.role}</span><span className="block text-white/30 text-[9px] mt-0.5">{manager.phone}</span></span>{index > 0 && <button onClick={() => setManagerToRemove(manager)} className="w-9 h-9 text-white/25 text-lg" aria-label={`Remove ${manager.name}`}>×</button>}</div>)}</div>
              <div className="grid grid-cols-2 gap-2 mt-3"><input value={managerDraft.name} onChange={(event) => setManagerDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /><input value={managerDraft.role} onChange={(event) => setManagerDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Role" className="bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px] min-w-0" /><input type="tel" value={managerDraft.phone} onChange={(event) => setManagerDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Mobile phone" className="col-span-2 bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /><button onClick={addManager} disabled={!managerDraft.name.trim() || !managerDraft.phone.trim()} className="col-span-2 min-h-10 rounded-md bg-violet-300 text-black text-[11px] font-bold disabled:opacity-35">Add & Prepare Invite</button></div>
            </section>
            <button onClick={() => setProfileOpen(false)} className="w-full min-h-11 rounded-md bg-white text-black text-[12px] font-bold">Save Profiles</button>
          </div>
        </div>
      )}

      {managerToRemove && <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center px-5" role="alertdialog" aria-modal="true" aria-label={`Remove ${managerToRemove.name}`}><div className="w-full max-w-sm rounded-lg bg-[#1b1b1b] border border-white/12 p-5"><h2 className="text-white text-[17px] font-bold">Remove {managerToRemove.name}?</h2><p className="text-white/48 text-[11.5px] leading-relaxed mt-2">Are you sure? They will lose management access and will no longer be able to redeem Hookups.</p><div className="flex gap-2 mt-5"><button onClick={() => setManagerToRemove(null)} className="flex-1 min-h-11 rounded-md border border-white/12 text-white/60 text-[11px] font-bold">Cancel</button><button onClick={() => { setManagers((current) => current.filter((item) => item.id !== managerToRemove.id)); setManagerToRemove(null); }} className="flex-1 min-h-11 rounded-md bg-rose-500 text-white text-[11px] font-bold">Yes, remove</button></div></div></div>}
    </main>
  );
}
