"use client";

import { useEffect, useMemo, useState } from "react";
import { getVisitorId } from "@/lib/analytics";
import type { MemberPhoto, MemberProfile, MemberRestaurant } from "@/lib/db";

function PhotoStrip({ photos, empty }: { photos: MemberPhoto[]; empty: string }) {
  if (!photos.length) return <p className="text-white/32 text-[12px] py-6">{empty}</p>;
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

export default function MemberDashboard() {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [hiddenVisits, setHiddenVisits] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    try { setHiddenVisits(JSON.parse(localStorage.getItem("seefood-hidden-visits") || "[]")); } catch {}
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
  const hideVisit = (placeId: string) => {
    const next = [...new Set([...hiddenVisits, placeId])];
    setHiddenVisits(next);
    localStorage.setItem("seefood-hidden-visits", JSON.stringify(next));
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto bg-[var(--surface-0)] pb-14">
      <header className="sticky top-0 z-20 bg-black/94 backdrop-blur border-b border-white/7 px-4 py-4 flex items-center gap-3">
        <a href="/" className="w-10 h-10 flex items-center justify-center rounded-full bg-white/6 text-white/65" aria-label="Back">←</a>
        <div><p className="text-[9px] text-[var(--accent)] font-bold uppercase">Member</p><h1 className="text-white text-[21px] font-bold">My SeeFood</h1></div>
      </header>
      {!profile ? <div className="py-24 text-center text-white/35 text-sm">Gathering your dishes...</div> : (
        <div className="px-4 fade-up">
          <section className="pt-6 pb-5 border-b border-white/7">
            <div className="flex justify-between items-end"><div><p className="text-white/35 text-[9px] font-bold uppercase">Automatic</p><h2 className="text-white font-bold text-[17px]">I was here</h2></div><span className="text-white/25 text-[10px]">This browser</span></div>
            <div className="mt-3 space-y-1">
              {visits.length ? visits.slice(0, 10).map((visit) => (
                <div key={visit.placeId} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                  <a href={visit.slug ? `/r/${visit.slug}` : "/"} className="min-w-0 flex-1"><p className="text-white text-[13px] font-bold truncate">{visit.name}</p><p className="text-white/32 text-[10px] mt-0.5">{new Date(visit.lastVisitedAt).toLocaleDateString()} · {visit.visitCount} {visit.visitCount === 1 ? "visit" : "visits"}</p></a>
                  <button onClick={() => hideVisit(visit.placeId)} className="w-9 h-9 text-white/28 text-lg" aria-label={`Remove ${visit.name}`}>×</button>
                </div>
              )) : <p className="text-white/32 text-[12px] py-6">Restaurants you open will appear here automatically.</p>}
            </div>
          </section>

          <section className="py-6 border-b border-white/7"><h2 className="text-white font-bold text-[17px] mb-3">I loved these dishes</h2><PhotoStrip photos={profile.lovedDishes} empty="Tap “I loved this” on a dish to start this collection." /></section>
          <section className="py-6 border-b border-white/7"><h2 className="text-white font-bold text-[17px] mb-3">My pics</h2><PhotoStrip photos={profile.photos} empty="The food photos you add will live here." /></section>
          <section className="py-6">
            <div><p className="text-white/35 text-[9px] font-bold uppercase">Closest now</p><h2 className="text-white font-bold text-[17px]">My favorite restaurants</h2></div>
            <div className="mt-3">
              {favorites.length ? favorites.map((item, index) => {
                const miles = distanceMiles(item, location);
                return <a key={item.placeId} href={item.slug ? `/r/${item.slug}` : "/"} className="flex items-center gap-3 py-3 border-b border-white/6"><span className="text-[var(--accent)] font-bold text-[12px] w-5">{index + 1}</span><span className="text-white text-[13px] font-bold flex-1 truncate">{item.name}</span><span className="text-white/30 text-[10px]">{miles === null ? "" : `${miles.toFixed(1)} mi`}</span></a>;
              }) : <p className="text-white/32 text-[12px] py-6">Favorites form from the places you revisit and dishes you love.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
