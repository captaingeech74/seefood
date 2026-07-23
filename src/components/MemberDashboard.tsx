"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { getVisitorId } from "@/lib/analytics";
import type { MemberPhoto, MemberPoints, MemberProfile, MemberRestaurant } from "@/lib/db";

interface LocalMemberIdentity {
  name: string;
  email: string;
  phone: string;
}

type SectionKey = "visits" | "loved" | "photos" | "favorites";

const IDENTITY_KEY = "seefood-member-identity";

function PhotoStrip({ photos, empty }: { photos: MemberPhoto[]; empty: string }) {
  if (!photos.length) return <p className="text-white/32 text-[12px] py-4">{empty}</p>;
  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
      {photos.map((photo) => (
        <a key={photo.id} href={photo.restaurantSlug ? `/r/${photo.restaurantSlug}` : "/"} className="relative shrink-0 w-32 aspect-[4/5] overflow-hidden rounded-lg bg-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={photo.dishName} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 p-2 pt-8 bg-gradient-to-t from-black/95 to-transparent">
            {photo.loved && <span className="text-[9px] text-[var(--accent)] font-bold">LOVED</span>}
            <p className="text-white text-[11px] font-bold leading-tight line-clamp-2">{photo.dishName}</p>
            <p className="text-white/50 text-[9px] truncate mt-1">{photo.restaurantName}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function distanceMiles(item: MemberRestaurant, location: { lat: number; lng: number } | null) {
  if (!location || item.lat === null || item.lng === null) return null;
  const rad = Math.PI / 180;
  const dLat = (item.lat - location.lat) * rad;
  const dLng = (item.lng - location.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(location.lat * rad) * Math.cos(item.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function MemberSection({
  title,
  note,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  note?: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/7">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-[68px] flex items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="text-white text-[16px] font-bold leading-tight">{title}</span>
          {note && <span className="text-white/30 text-[10px] ml-1.5">{note}</span>}
        </span>
        <span className="text-white/35 text-[10px] font-bold tabular-nums">{count}</span>
        <span className="w-7 h-7 rounded-full bg-white/6 flex items-center justify-center text-white/45" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 180ms ease" }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="pb-5 fade-in">{children}</div>}
    </section>
  );
}

function PointsPanel({ points, onExplain }: { points: MemberPoints; onExplain: () => void }) {
  const denominator = points.nextLevelAt === null ? 1 : points.nextLevelAt - points.currentLevelFloor;
  const progress = points.nextLevelAt === null ? 100 : Math.max(2, Math.min(100, (points.total - points.currentLevelFloor) / denominator * 100));
  return (
    <button type="button" onClick={onExplain} className="w-full text-left px-4 py-3.5 border border-white/10 bg-white/[0.045] rounded-lg active:bg-white/[0.07] transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-[14px]" style={{ background: "var(--accent)" }}>{points.level}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-white text-[13px] font-bold">Level {points.level} · {points.title}</p>
            <p className="text-white/45 text-[10px] font-bold tabular-nums">{points.total.toLocaleString()} pts</p>
          </div>
          <div className="h-1.5 mt-2 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div>
          <p className="text-white/28 text-[9.5px] mt-1.5">{points.nextLevelAt === null ? "Top level reached" : `${points.nextLevelAt - points.total} points to Level ${points.level + 1}`} · Tap to see how</p>
        </div>
      </div>
    </button>
  );
}

function PointsSheet({ points, onClose }: { points: MemberPoints; onClose: () => void }) {
  const ways = [
    ["Share a food photo", "10 pts"],
    ["Fill a missing menu item", "+10 bonus"],
    ["Unlock a comparison", "+15 bonus"],
    ["Someone loves your photo", "3 pts"],
    ["Photo voted most representative", "5 pts"],
    ["Your photo reaches 10 / 50 loves", "25 / 100 bonus"],
    ["Love or share a dish", "1 / 2 pts"],
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="SeeFood points" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-t-2xl bg-[#141414] border-t border-white/12 px-5 pt-4 slide-up" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }} onClick={(event) => event.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[9px] uppercase text-[var(--accent)] font-bold">SeeFood status</p><h2 className="text-white text-[19px] font-bold mt-0.5">Level {points.level} · {points.title}</h2><p className="text-white/42 text-[11px] mt-1">{points.total.toLocaleString()} points earned{points.nextLevelAt ? ` · ${points.nextLevelAt.toLocaleString()} needed for Level ${points.level + 1}` : ""}</p></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button>
        </div>
        <p className="text-white/55 text-[12px] leading-relaxed mt-4">The fastest way up is to make the menu more useful. Contributions earn points immediately; contributions that help other diners earn much more over time.</p>
        <div className="mt-4 border-y border-white/8">
          {ways.map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-white/6 last:border-0"><span className="text-white/60 text-[11.5px]">{label}</span><span className="text-white text-[11px] font-bold whitespace-nowrap">{value}</span></div>)}
        </div>
        {points.breakdown.length > 0 && (
          <div className="mt-4">
            <p className="text-white/32 text-[9px] uppercase font-bold mb-2">Your points</p>
            {points.breakdown.map((item) => <div key={item.label} className="flex justify-between py-1.5 text-[11px]"><span className="text-white/50">{item.label} <small className="text-white/25">· {item.detail}</small></span><span className="text-[var(--accent)] font-bold">+{item.points}</span></div>)}
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
  const [hiddenVisits, setHiddenVisits] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ visits: true, loved: false, photos: false, favorites: false });

  useEffect(() => {
    try {
      setHiddenVisits(JSON.parse(localStorage.getItem("seefood-hidden-visits") || "[]"));
      const storedIdentity = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "{}");
      const nextIdentity = { name: storedIdentity.name || "", email: storedIdentity.email || "", phone: storedIdentity.phone || "" };
      setIdentity(nextIdentity);
      setIdentityDraft(nextIdentity);
    } catch {}
    void fetch(`/api/member?visitorId=${encodeURIComponent(getVisitorId())}`, { cache: "no-store" })
      .then((response) => response.json())
      .then(setProfile);
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

  const hideVisit = (placeId: string) => {
    const next = [...new Set([...hiddenVisits, placeId])];
    setHiddenVisits(next);
    localStorage.setItem("seefood-hidden-visits", JSON.stringify(next));
  };
  const saveIdentity = () => {
    const next = {
      name: identityDraft.name.trim().slice(0, 80),
      email: identityDraft.email.trim().slice(0, 160),
      phone: identityDraft.phone.trim().slice(0, 40),
    };
    setIdentity(next);
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    setEditingIdentity(false);
  };
  const toggleSection = (key: SectionKey) => setSections((current) => ({ ...current, [key]: !current[key] }));

  return (
    <main className="min-h-screen max-w-3xl mx-auto bg-[var(--surface-0)] pb-14">
      <header className="sticky top-0 z-20 bg-black/94 backdrop-blur border-b border-white/7 px-4 py-3.5 flex items-center gap-3">
        <a href="/" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/6 text-white/65" aria-label="Back">←</a>
        <div><p className="text-[9px] text-[var(--accent)] font-bold uppercase">Member</p><h1 className="text-white text-[21px] font-bold">My SeeFood</h1></div>
      </header>

      <div className="px-4 fade-up">
        <section className="py-4 border-b border-white/7">
          {!editingIdentity ? (
            <button type="button" onClick={() => setEditingIdentity(true)} className="w-full flex items-center gap-3 text-left">
              <div className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-[13px] font-bold text-white">{initials}</div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-[14px] font-bold truncate">{identity.name || "Add your name"}</p>
                <p className="text-white/32 text-[10.5px] truncate mt-0.5">{contactLine || "Add email and phone"}</p>
              </div>
              <span className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40" aria-label="Edit profile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
              </span>
            </button>
          ) : (
            <div className="fade-in">
              <div className="grid grid-cols-2 gap-2">
                <input value={identityDraft.name} onChange={(event) => setIdentityDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" className="col-span-2 rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none focus:border-[var(--accent)]" />
                <input type="email" value={identityDraft.email} onChange={(event) => setIdentityDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none focus:border-[var(--accent)] min-w-0" />
                <input type="tel" value={identityDraft.phone} onChange={(event) => setIdentityDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="rounded-lg bg-white/7 border border-white/10 px-3 py-2.5 text-[12px] text-white outline-none focus:border-[var(--accent)] min-w-0" />
              </div>
              <div className="flex justify-end gap-2 mt-2"><button onClick={() => { setIdentityDraft(identity); setEditingIdentity(false); }} className="px-3 py-2 text-[11px] font-bold text-white/40">Cancel</button><button onClick={saveIdentity} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[11px] font-bold text-white">Save</button></div>
            </div>
          )}
        </section>

        {profile ? <div className="py-4 border-b border-white/7"><PointsPanel points={profile.points} onExplain={() => setPointsOpen(true)} /></div> : <div className="h-20 my-4 rounded-lg shimmer" />}

        {profile && (
          <>
            <MemberSection title="I Was Here" note="(auto generated)" count={visits.length} open={sections.visits} onToggle={() => toggleSection("visits")}>
              <div className="space-y-1">
                {visits.length ? visits.slice(0, 10).map((visit) => (
                  <div key={visit.placeId} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                    <a href={visit.slug ? `/r/${visit.slug}` : "/"} className="min-w-0 flex-1"><p className="text-white text-[13px] font-bold truncate">{visit.name}</p><p className="text-white/32 text-[10px] mt-0.5">{new Date(visit.lastVisitedAt).toLocaleDateString()} · {visit.visitCount} {visit.visitCount === 1 ? "visit" : "visits"}</p></a>
                    <button onClick={() => hideVisit(visit.placeId)} className="w-9 h-9 text-white/28 text-lg" aria-label={`Remove ${visit.name}`}>×</button>
                  </div>
                )) : <p className="text-white/32 text-[12px] py-4">Restaurants you open will appear here automatically.</p>}
              </div>
            </MemberSection>

            <MemberSection title="I Loved These Dishes" count={profile.lovedDishes.length} open={sections.loved} onToggle={() => toggleSection("loved")}>
              <PhotoStrip photos={profile.lovedDishes} empty="Tap “I loved this” on a dish to start this collection." />
            </MemberSection>

            <MemberSection title="My Pics" count={profile.photos.length} open={sections.photos} onToggle={() => toggleSection("photos")}>
              <PhotoStrip photos={profile.photos} empty="The food photos you add will live here." />
            </MemberSection>

            <MemberSection title="My Favorite Restaurants Nearby" count={favorites.length} open={sections.favorites} onToggle={() => toggleSection("favorites")}>
              <div>
                {favorites.length ? favorites.map((item, index) => {
                  const miles = distanceMiles(item, location);
                  return <a key={item.placeId} href={item.slug ? `/r/${item.slug}` : "/"} className="flex items-center gap-3 py-3 border-b border-white/6"><span className="text-[var(--accent)] font-bold text-[12px] w-5">{index + 1}</span><span className="text-white text-[13px] font-bold flex-1 truncate">{item.name}</span><span className="text-white/30 text-[10px]">{miles === null ? "" : `${miles.toFixed(1)} mi`}</span></a>;
                }) : <p className="text-white/32 text-[12px] py-4">Favorites form from the places you revisit and dishes you love.</p>}
              </div>
            </MemberSection>
          </>
        )}
      </div>
      {pointsOpen && profile && <PointsSheet points={profile.points} onClose={() => setPointsOpen(false)} />}
    </main>
  );
}
