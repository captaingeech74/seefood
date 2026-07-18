"use client";

import { useState } from "react";

const managementPhotos = [
  "/api/r2-photo?key=fixture-photos%2Flrays-kitchen%2Fnotion-10197-0.jpg",
  "/api/r2-photo?key=fixture-photos%2Flrays-kitchen%2Fnotion-10197-1.jpg",
];
const customerPhotos = [
  "/api/r2-photo?key=fixture-photos%2Flrays-kitchen%2Fmgmt-rotisserie-chicken4.png",
  "/api/r2-photo?key=fixture-photos%2Flrays-kitchen%2Fmgmt-rotisserie-chicken1.png",
];

export default function RealityCheckMockup() {
  const [position, setPosition] = useState(50);
  const [pair, setPair] = useState(0);

  return (
    <main className="min-h-screen bg-[#090909] text-white max-w-md mx-auto flex flex-col">
      <header className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-[var(--accent)]" style={{ letterSpacing: "0.12em" }}>Reality Check</p>
          <h1 className="text-[21px] font-bold mt-0.5">Rotisserie Chicken &amp; Veggies</h1>
          <p className="text-white/40 text-[12px] mt-0.5">LRay&apos;s Kitchen</p>
        </div>
        <a href="/r/lrays-kitchen-temecula" className="hit-target w-10 h-10 rounded-full bg-white/8 flex items-center justify-center" aria-label="Close concept">
          <span className="text-white/65 text-xl">×</span>
        </a>
      </header>

      <section className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: "4 / 5" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={managementPhotos[pair]} alt="Management version" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={customerPhotos[pair]} alt="Customer version" className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/65 to-transparent pointer-events-none" />
        <div className="absolute top-4 left-4 px-2.5 py-1.5 rounded-full bg-black/65 text-[11px] font-bold">MGMT</div>
        <div className="absolute top-4 right-4 px-2.5 py-1.5 rounded-full bg-black/65 text-[11px] font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)]" /> CUSTOMER
        </div>

        <div className="absolute top-0 bottom-0 w-px bg-white/90 pointer-events-none" style={{ left: `${position}%` }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white text-black shadow-xl flex items-center justify-center font-bold text-[16px]">↔</div>
        </div>
        <input
          type="range"
          min="5"
          max="95"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
          aria-label="Compare management and customer photos"
        />
      </section>

      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <div className="flex gap-1.5" role="tablist" aria-label="Photo pair">
          {[0, 1].map((index) => (
            <button
              key={index}
              onClick={() => setPair(index)}
              className={`h-1.5 rounded-full transition-all ${pair === index ? "w-7 bg-[var(--accent)]" : "w-2 bg-white/20"}`}
              aria-label={`Photo pair ${index + 1}`}
            />
          ))}
        </div>
        <span className="text-white/35 text-[11px] font-semibold">Pair {pair + 1} of 2</span>
      </div>

      <section className="px-5 pt-5 pb-7">
        <p className="text-white/60 text-[14px] leading-relaxed">
          Roasted chicken served with colorful seasonal vegetables, browned potatoes, and a savory pan sauce.
        </p>

        <div className="grid grid-cols-3 gap-2 mt-6">
          <button className="h-12 rounded-xl bg-white/8 text-[12px] font-bold">Love</button>
          <button className="h-12 rounded-xl bg-white/8 text-[12px] font-bold">Share</button>
          <button className="h-12 rounded-xl bg-[var(--accent)] text-[12px] font-bold">Add Photo</button>
        </div>
      </section>
    </main>
  );
}
