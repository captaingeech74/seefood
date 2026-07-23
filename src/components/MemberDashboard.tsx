"use client";

import QRCode from "qrcode";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { getVisitorId } from "@/lib/analytics";
import { getMemberHookups, MemberHookup } from "@/lib/demoHookups";
import type { MemberPhoto, MemberPoints, MemberProfile, MemberRestaurant } from "@/lib/db";

interface LocalMemberIdentity {
  name: string;
  email: string;
  phone: string;
}

type PreviewSectionKey = "visits" | "favorites";
type CollectionKind = "photos" | "loved";
type Award = { name: string; color: string; glow: string } | null;

const IDENTITY_KEY = "seefood-member-identity";

function distanceMiles(item: MemberRestaurant, location: { lat: number; lng: number } | null) {
  if (!location || item.lat === null || item.lng === null) return null;
  const rad = Math.PI / 180;
  const dLat = (item.lat - location.lat) * rad;
  const dLng = (item.lng - location.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(location.lat * rad) * Math.cos(item.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function awardFor(photo: MemberPhoto): Award {
  const helpful = photo.loveCount + photo.primaryVotes * 2;
  if (photo.viewCount >= 50_000 || helpful >= 250) return { name: "Diamond", color: "#b9f4ff", glow: "rgba(185,244,255,.32)" };
  if (photo.viewCount >= 10_000 || helpful >= 100) return { name: "Platinum", color: "#d7e7ed", glow: "rgba(215,231,237,.25)" };
  if (photo.viewCount >= 2_000 || helpful >= 50) return { name: "Gold", color: "#ffc84a", glow: "rgba(255,200,74,.28)" };
  if (photo.viewCount >= 500 || helpful >= 25) return { name: "Silver", color: "#b9c3cb", glow: "rgba(185,195,203,.24)" };
  if (photo.viewCount >= 100 || helpful >= 10) return { name: "Bronze", color: "#d98a57", glow: "rgba(217,138,87,.24)" };
  return null;
}

function PointsPanel({ points, hookups, onExplain, onOpenHookups }: { points: MemberPoints; hookups: MemberHookup[]; onExplain: () => void; onOpenHookups: () => void }) {
  const denominator = points.nextLevelAt === null ? 1 : points.nextLevelAt - points.currentLevelFloor;
  const progress = points.nextLevelAt === null ? 100 : Math.max(2, Math.min(100, (points.total - points.currentLevelFloor) / denominator * 100));
  const ready = hookups.filter((item) => item.status === "ready").length;
  return (
    <div className="w-full border border-white/10 bg-white/[0.045] rounded-lg overflow-hidden">
      <button type="button" onClick={onExplain} className="w-full text-left px-4 py-3.5 active:bg-white/[0.07] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-[14px] bg-[var(--accent)]">{points.level}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3"><p className="text-white text-[13px] font-bold">Level {points.level} · {points.title}</p><p className="text-white/45 text-[10px] font-bold tabular-nums">{points.total.toLocaleString()} pts</p></div>
            <div className="h-1.5 mt-2 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div>
            <p className="text-white/30 text-[9.5px] mt-1.5">{points.nextLevelAt === null ? "Top level reached" : `${points.nextLevelAt - points.total} points to Level ${points.level + 1}`} · Tap to see how</p>
          </div>
        </div>
      </button>
      <button type="button" onClick={onOpenHookups} className="w-full min-h-11 px-4 border-t border-white/8 flex items-center gap-3 text-left bg-violet-300/[0.035] active:bg-violet-300/[0.08]">
        <span className="w-7 h-7 rounded-full bg-violet-300/12 text-violet-200 flex items-center justify-center text-[11px] font-bold">%</span>
        <span className="min-w-0 flex-1"><span className="block text-white text-[11.5px] font-bold">My Hookups</span><span className="block text-white/32 text-[9px]">{ready ? `${ready} ready to use` : "Offers sent directly by management"}</span></span>
        <span className="text-violet-200 text-[11px] font-bold">{hookups.length} ›</span>
      </button>
    </div>
  );
}

function PointsSheet({ points, onClose }: { points: MemberPoints; onClose: () => void }) {
  const titles = ["Taster", "Regular", "Scout", "Contributor", "Tastemaker", "Guide", "Curator", "Insider", "Icon", "Legend"];
  const nextTitle = titles[points.level] ?? null;
  const ways = [
    ["Share a food photo", "10 pts"],
    ["Fill a missing menu item", "+10 bonus"],
    ["Unlock a comparison", "+15 bonus"],
    ["Someone loves your photo", "3 pts"],
    ["Photo voted most representative", "5 pts"],
    ["Your photo reaches 10 / 50 loves", "25 / 100 bonus"],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="SeeFood points" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-t-2xl bg-[#141414] border-t border-white/12 px-5 pt-4 slide-up" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }} onClick={(event) => event.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[9px] uppercase text-[var(--accent)] font-bold">SeeFood status</p><h2 className="text-white text-[19px] font-bold mt-0.5">Level {points.level} · {points.title}</h2><p className="text-white/42 text-[11px] mt-1">{points.total.toLocaleString()} points earned{points.nextLevelAt && nextTitle ? ` · ${points.nextLevelAt.toLocaleString()} needed for Level ${points.level + 1}, ${nextTitle}` : ""}</p></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button>
        </div>
        <p className="text-white/55 text-[12px] leading-relaxed mt-4">The fastest way up is to make the menu more useful. Contributions earn points immediately; contributions that help other diners earn much more over time.</p>
        <div className="mt-4 border-y border-white/8">{ways.map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-white/6 last:border-0"><span className="text-white/60 text-[11.5px]">{label}</span><span className="text-white text-[11px] font-bold whitespace-nowrap">{value}</span></div>)}</div>
        {points.breakdown.length > 0 && <div className="mt-4"><p className="text-white/32 text-[9px] uppercase font-bold mb-2">Your points</p>{points.breakdown.map((item) => <div key={item.label} className="flex justify-between py-1.5 text-[11px]"><span className="text-white/50">{item.label} <small className="text-white/25">· {item.detail}</small></span><span className="text-[var(--accent)] font-bold">+{item.points}</span></div>)}</div>}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, count, tone, action }: { eyebrow: string; title: string; count: number; tone: string; action?: ReactNode }) {
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold" style={{ color: tone }}>{eyebrow}</p><h2 className="text-white text-[18px] font-bold mt-0.5">{title}</h2></div>
      {action ?? <span className="text-white/30 text-[10px] font-bold">{count}</span>}
    </div>
  );
}

function CollectionShelf({ kind, photos, onOpen }: { kind: CollectionKind; photos: MemberPhoto[]; onOpen: () => void }) {
  const isMine = kind === "photos";
  return (
    <section className="py-5 border-b border-white/8">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <SectionHeading eyebrow={isMine ? "Your impact" : "Worth ordering again"} title={isMine ? "My Food Photos" : "Dishes I’ve Loved"} count={photos.length} tone={isMine ? "#38d996" : "#ff8d65"} action={<span className="text-white/42 text-[10px] font-bold">See all →</span>} />
        {photos.length ? (
          <div className="flex gap-2 mt-3 overflow-hidden">
            {photos.slice(0, 4).map((photo) => {
              const award = isMine ? awardFor(photo) : null;
              return <div key={photo.id} className="relative shrink-0 w-[29%] aspect-square rounded-lg overflow-hidden bg-white/5 border-2" style={{ borderColor: award?.color ?? "transparent", boxShadow: award ? `0 0 16px ${award.glow}` : undefined }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.dishName} className="w-full h-full object-cover" />{award && <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[8px] font-bold" style={{ color: award.color }}>{award.name}</span>}</div>;
            })}
          </div>
        ) : <div className="mt-3 h-16 rounded-lg border border-dashed border-white/10 flex items-center px-3 text-white/30 text-[11px]">{isMine ? "Your food photos and their impact will appear here." : "Love a dish to build your craving collection."}</div>}
      </button>
    </section>
  );
}

function PreviewSection({ title, eyebrow, count, open, tone, onToggle, children }: { title: string; eyebrow: string; count: number; open: boolean; tone: string; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="py-5 border-b border-white/8">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[15px] font-bold" style={{ background: `${tone}1f`, color: tone }}>{title.charAt(0)}</div>
        <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold" style={{ color: tone }}>{eyebrow}</p><h2 className="text-white text-[18px] font-bold mt-0.5">{title}</h2></div>
        <span className="text-white/30 text-[10px] font-bold">{count}</span>
        <span className="w-7 h-7 rounded-full bg-white/7 flex items-center justify-center text-white/45" style={{ transform: open ? "rotate(180deg)" : undefined }}>⌄</span>
      </button>
      <div className={`relative overflow-hidden transition-[max-height] duration-300 ${open ? "max-h-[480px]" : "max-h-[62px]"}`} style={!open ? { maskImage: "linear-gradient(to bottom, black 45%, transparent 100%)" } : undefined}>
        {children}
      </div>
    </section>
  );
}

function CollectionDrawer({ kind, photos, onClose }: { kind: CollectionKind; photos: MemberPhoto[]; onClose: () => void }) {
  const [visible, setVisible] = useState(12);
  const [sort, setSort] = useState<"helpful" | "views" | "loves">("helpful");
  const [selected, setSelected] = useState<MemberPhoto | null>(null);
  const isMine = kind === "photos";
  const sorted = useMemo(() => [...photos].sort((a, b) => sort === "views" ? b.viewCount - a.viewCount : sort === "loves" ? b.loveCount - a.loveCount : (b.loveCount + b.primaryVotes * 2) - (a.loveCount + a.primaryVotes * 2)), [photos, sort]);
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={isMine ? "My Food Photos" : "Dishes I’ve Loved"} onClick={onClose}>
      <div className="w-full max-w-3xl h-[92vh] rounded-t-2xl bg-[#101010] border-t border-white/12 overflow-hidden slide-up flex flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="px-4 pt-3 pb-3 border-b border-white/8 bg-black/80"><div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-3" /><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-[var(--accent)]">{isMine ? "Performance & milestones" : "Your craving archive"}</p><h2 className="text-white text-[20px] font-bold">{isMine ? "My Food Photos" : "Dishes I’ve Loved"}</h2></div><button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div>
          {isMine && <div className="flex gap-1 mt-3">{([["helpful", "Most helpful"], ["views", "Most viewed"], ["loves", "Most loved"]] as const).map(([value, label]) => <button key={value} onClick={() => setSort(value)} className="px-2.5 py-1.5 rounded-md text-[9.5px] font-bold" style={{ background: sort === value ? "white" : "rgba(255,255,255,.06)", color: sort === value ? "black" : "rgba(255,255,255,.45)" }}>{label}</button>)}</div>}
        </div>
        <div className="flex-1 overflow-y-auto p-3" onScroll={(event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 180) setVisible((value) => Math.min(sorted.length, value + 12)); }}>
          {photos.length ? <div className="grid grid-cols-2 gap-3">{sorted.slice(0, visible).map((photo) => {
            const award = isMine ? awardFor(photo) : null;
            return <button key={photo.id} onClick={() => setSelected(photo)} className="relative text-left overflow-hidden rounded-lg bg-[#191919] border-2" style={{ borderColor: award?.color ?? "rgba(255,255,255,.06)", boxShadow: award ? `0 0 18px ${award.glow}` : undefined }}>
              <div className="aspect-square">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.url} alt={photo.dishName} className="w-full h-full object-cover" /></div>
              <div className="p-2.5">{award && <p className="text-[9px] font-bold uppercase mb-1" style={{ color: award.color }}>{award.name} photo</p>}<p className="text-white text-[12px] font-bold line-clamp-2">{photo.dishName}</p><p className="text-white/35 text-[9.5px] truncate mt-1">{photo.restaurantName}</p>{isMine ? <div className="flex gap-3 mt-2 text-[9px] font-bold"><span className="text-sky-300">{photo.viewCount.toLocaleString()} views</span><span className="text-[var(--accent)]">{photo.loveCount} loves</span></div> : <p className="text-white/28 text-[9px] mt-2">{photo.lovedAt ? `Loved ${new Date(photo.lovedAt).toLocaleDateString()}` : "Saved to your favorites"}</p>}</div>
            </button>;
          })}</div> : <div className="h-full flex items-center justify-center text-white/30 text-[12px] text-center px-8">{isMine ? "Add your first food photo to start earning views, loves, and photo awards." : "The dishes you love will collect here, ready for your next craving."}</div>}
        </div>
      </div>
      {selected && <div className="absolute inset-0 z-10 bg-black flex flex-col" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-3 p-4"><button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-white/8">←</button><div className="min-w-0"><p className="text-white font-bold truncate">{selected.dishName}</p><p className="text-white/40 text-[10px]">{selected.restaurantName}</p></div></div><div className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar">{(selected.relatedPhotos.length ? selected.relatedPhotos : [selected.url]).map((url) => <div key={url} className="w-full h-full shrink-0 snap-center flex items-center bg-black">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={selected.dishName} className="w-full max-h-full object-contain" /></div>)}</div><div className="p-4 pb-7 bg-[#111]"><p className="text-white/45 text-[11px]">{isMine ? `${selected.viewCount.toLocaleString()} views · ${selected.loveCount} loves · ${selected.primaryVotes} representative votes` : `${selected.relatedPhotos.length || 1} photos of this dish · swipe to crave`}</p><a href={selected.restaurantSlug ? `/r/${selected.restaurantSlug}` : "/"} className="mt-3 min-h-11 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-bold">Open at {selected.restaurantName}</a></div></div>}
    </div>
  );
}

function HookupsDrawer({ hookups, onClose }: { hookups: MemberHookup[]; onClose: () => void }) {
  const [hookup, setHookup] = useState<MemberHookup | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    setQr("");
    if (hookup) void QRCode.toDataURL(hookup.code, { width: 220, margin: 1 }).then(setQr);
  }, [hookup]);
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="My Hookups" onClick={onClose}>
      <div className="w-full max-w-3xl h-[86vh] overflow-y-auto rounded-t-2xl bg-[#17131d] px-4 pt-4 pb-8 slide-up" onClick={(event) => event.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />
        <div className="flex items-center gap-3"><button onClick={hookup ? () => setHookup(null) : onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60" aria-label={hookup ? "Back to Hookups" : "Close"}>{hookup ? "←" : "×"}</button><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-violet-300">From restaurants that value you</p><h2 className="text-white text-[20px] font-bold">My Hookups</h2></div></div>
        {!hookup ? (
          <div className="mt-5 space-y-2.5">
            {hookups.map((item) => <button key={item.id} onClick={() => setHookup(item)} className="w-full text-left rounded-lg p-3.5 border border-violet-300/20 bg-violet-300/[0.07]" style={{ opacity: item.status === "used" ? 0.55 : 1 }}><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-violet-300/15 text-violet-200 flex items-center justify-center font-bold">{item.status === "used" ? "✓" : "%"}</div><div className="min-w-0 flex-1"><p className="text-white text-[13px] font-bold">{item.title}</p><p className="text-violet-200 text-[10.5px] mt-1">{item.offer}</p></div><span className="text-white/25">›</span></div><p className="text-white/35 text-[9px] mt-3">{item.demo ? "SAMPLE ONLY · " : ""}{item.restaurantName} · expires {new Date(item.expiresAt).toLocaleDateString()}</p></button>)}
          </div>
        ) : (
          <div className="text-center mt-5 fade-in">
            {hookup.demo && <span className="inline-block px-2 py-1 rounded bg-amber-300/12 text-amber-200 text-[8px] font-bold mb-2">SAMPLE · NOT A LIVE RESTAURANT OFFER</span>}
            <p className="text-violet-300 text-[9px] uppercase font-bold">From {hookup.restaurantName}</p><h3 className="text-white text-[21px] font-bold mt-1">{hookup.title}</h3><p className="text-white/65 text-[13px] mt-2">{hookup.offer}</p>
            {hookup.message && <div className="mt-4 px-4 py-3 text-left border-l-2 border-violet-300 bg-violet-300/[0.06]"><p className="text-white/32 text-[8px] uppercase font-bold">A note from management</p><p className="text-white/70 text-[11.5px] leading-relaxed mt-1">“{hookup.message}”</p></div>}
            {qr && <div className="inline-block p-2 bg-white rounded-lg mt-5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt="Hookup QR code" className="w-48 h-48" /></div>}
            <p className="text-white/42 text-[11px] mt-4">{hookup.forFriends ? "This one is meant for you and friends." : "Show this code to management."}</p><p className="text-white/25 text-[9px] mt-2">Management scans this code in SeeFood to mark it used.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MemberDashboard() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [identity, setIdentity] = useState<LocalMemberIdentity>({ name: "", email: "", phone: "" });
  const [identityDraft, setIdentityDraft] = useState<LocalMemberIdentity>({ name: "", email: "", phone: "" });
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState<CollectionKind | null>(null);
  const [hookupsOpen, setHookupsOpen] = useState(false);
  const [hookups, setHookups] = useState<MemberHookup[]>([]);
  const [hiddenVisits, setHiddenVisits] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sections, setSections] = useState<Record<PreviewSectionKey, boolean>>({ visits: false, favorites: false });

  useEffect(() => {
    try {
      setHiddenVisits(JSON.parse(localStorage.getItem("seefood-hidden-visits") || "[]"));
      const storedIdentity = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "{}");
      const nextIdentity = { name: storedIdentity.name || "", email: storedIdentity.email || "", phone: storedIdentity.phone || "" };
      setIdentity(nextIdentity);
      setIdentityDraft(nextIdentity);
      setHookups(getMemberHookups());
    } catch {}
    void fetch(`/api/member?visitorId=${encodeURIComponent(getVisitorId())}`, { cache: "no-store" }).then((response) => response.json()).then(setProfile);
    navigator.geolocation?.getCurrentPosition((position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }), () => {});
  }, []);

  const favorites = useMemo(() => [...(profile?.favoriteRestaurants ?? [])].sort((a, b) => {
    const aDistance = distanceMiles(a, location);
    const bDistance = distanceMiles(b, location);
    if (aDistance === null || bDistance === null) return 0;
    return aDistance - bDistance;
  }), [location, profile]);
  const visits = (profile?.visits ?? []).filter((visit) => !hiddenVisits.includes(visit.placeId));
  const initials = identity.name.trim() ? identity.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "SF";
  const contactLine = [identity.email, identity.phone].filter(Boolean).join(" · ");
  const hideVisit = (placeId: string) => { const next = [...new Set([...hiddenVisits, placeId])]; setHiddenVisits(next); localStorage.setItem("seefood-hidden-visits", JSON.stringify(next)); };
  const saveIdentity = () => { const next = { name: identityDraft.name.trim().slice(0, 80), email: identityDraft.email.trim().slice(0, 160), phone: identityDraft.phone.trim().slice(0, 40) }; setIdentity(next); localStorage.setItem(IDENTITY_KEY, JSON.stringify(next)); setEditingIdentity(false); };

  return (
    <main className="min-h-screen max-w-3xl mx-auto bg-[var(--surface-0)] pb-14">
      <header className="sticky top-0 z-20 bg-black/94 backdrop-blur border-b border-white/7 px-4 py-3 flex items-center gap-3">
        <a href="/" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/6 text-white/65" aria-label="Back">←</a>
        <div className="min-w-0 flex-1"><p className="text-[9px] text-[var(--accent)] font-bold uppercase">Member</p><h1 className="text-white text-[20px] font-bold">My SeeFood</h1></div>
        <a href="/manage" className="min-h-10 px-3 rounded-md bg-[var(--accent)] text-white text-[10.5px] font-bold flex items-center gap-1.5">Management →</a>
      </header>

      <div className="px-4 fade-up">
        <section className="py-4 border-b border-white/7">
          {!editingIdentity ? <button type="button" onClick={() => setEditingIdentity(true)} className="w-full flex items-center gap-3 text-left"><div className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-[13px] font-bold text-white">{initials}</div><div className="min-w-0 flex-1"><p className="text-white text-[14px] font-bold truncate">{identity.name || "Add your name"}</p><p className="text-white/32 text-[10.5px] truncate mt-0.5">{contactLine || "Add email and phone"}</p></div><span className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40" aria-label="Edit profile">✎</span></button> : <div className="fade-in"><div className="grid grid-cols-2 gap-2"><input value={identityDraft.name} onChange={(event) => setIdentityDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" className="col-span-2 rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none focus:border-[var(--accent)]" /><input type="email" value={identityDraft.email} onChange={(event) => setIdentityDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none min-w-0" /><input type="tel" value={identityDraft.phone} onChange={(event) => setIdentityDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none min-w-0" /></div><div className="flex justify-end gap-2 mt-2"><button onClick={() => { setIdentityDraft(identity); setEditingIdentity(false); }} className="px-3 py-2 text-[11px] font-bold text-white/40">Cancel</button><button onClick={saveIdentity} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[11px] font-bold text-white">Save</button></div></div>}
        </section>

        {profile ? <div className="py-4 border-b border-white/7"><PointsPanel points={profile.points} hookups={hookups} onExplain={() => setPointsOpen(true)} onOpenHookups={() => setHookupsOpen(true)} /></div> : <div className="h-20 my-4 rounded-lg shimmer" />}

        {profile && <>
          <CollectionShelf kind="photos" photos={profile.photos} onOpen={() => setCollectionOpen("photos")} />
          <CollectionShelf kind="loved" photos={profile.lovedDishes} onOpen={() => setCollectionOpen("loved")} />
          <PreviewSection title="My Favorite Restaurants Nearby" eyebrow="Your regular rotation" count={favorites.length} open={sections.favorites} tone="#79b9ff" onToggle={() => setSections((current) => ({ ...current, favorites: !current.favorites }))}>
            <div className="pt-3">{favorites.length ? favorites.map((item, index) => { const miles = distanceMiles(item, location); return <a key={item.placeId} href={item.slug ? `/r/${item.slug}` : "/"} className="flex items-center gap-3 py-3 border-b border-white/6"><span className="w-6 h-6 rounded-full bg-sky-300/10 text-sky-300 flex items-center justify-center text-[10px] font-bold">{index + 1}</span><span className="text-white text-[13px] font-bold flex-1 truncate">{item.name}</span><span className="text-white/30 text-[10px]">{miles === null ? "" : `${miles.toFixed(1)} mi`}</span></a>; }) : <p className="text-white/32 text-[12px] py-4">Favorites form from the places you revisit and dishes you love.</p>}</div>
          </PreviewSection>
          <PreviewSection title="I Was Here" eyebrow="Auto generated" count={visits.length} open={sections.visits} tone="#62dda0" onToggle={() => setSections((current) => ({ ...current, visits: !current.visits }))}>
            <div className="pt-3">{visits.length ? visits.slice(0, 10).map((visit) => <div key={visit.placeId} className="flex items-center gap-3 py-3 border-b border-white/6"><a href={visit.slug ? `/r/${visit.slug}` : "/"} className="min-w-0 flex-1"><p className="text-white text-[13px] font-bold truncate">{visit.name}</p><p className="text-emerald-300/55 text-[10px] mt-0.5">{new Date(visit.lastVisitedAt).toLocaleDateString()} · {visit.visitCount} {visit.visitCount === 1 ? "visit" : "visits"}</p></a><button onClick={() => hideVisit(visit.placeId)} className="w-9 h-9 text-white/28 text-lg" aria-label={`Remove ${visit.name}`}>×</button></div>) : <p className="text-white/32 text-[12px] py-4">Restaurants you open will appear here automatically.</p>}</div>
          </PreviewSection>
        </>}
      </div>

      {pointsOpen && profile && <PointsSheet points={profile.points} onClose={() => setPointsOpen(false)} />}
      {collectionOpen && profile && <CollectionDrawer kind={collectionOpen} photos={collectionOpen === "photos" ? profile.photos : profile.lovedDishes} onClose={() => setCollectionOpen(null)} />}
      {hookupsOpen && <HookupsDrawer hookups={hookups} onClose={() => setHookupsOpen(false)} />}
    </main>
  );
}
