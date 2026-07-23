"use client";

import { FormEvent, useMemo, useState } from "react";

type Signal = "rising" | "watch" | "new" | "steady";
type View = "brief" | "items" | "opportunities" | "changes";
type Audience = "all" | "new" | "regulars";

interface CustomerPulse {
  item: string;
  question: string;
  audience: string;
}

interface MenuSignal {
  id: string;
  name: string;
  image: string;
  signal: Signal;
  movement: number;
  loveRate: number;
  opens: number;
  customerLift: number;
  repeatShare: number;
  summary: string;
  why: string;
  action: string;
}

const ITEMS: MenuSignal[] = [
  {
    id: "rotisserie",
    name: "Rotisserie Chicken & Veggies",
    image: "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10197-0.webp",
    signal: "rising",
    movement: 34,
    loveRate: 28,
    opens: 612,
    customerLift: 42,
    repeatShare: 61,
    summary: "Your strongest momentum this week",
    why: "Returning customers are opening and loving it more often, while customer photos outperform management photos.",
    action: "Keep it featured and send a thank-you Hookup to its top supporters.",
  },
  {
    id: "tacos",
    name: "Spicy Korean Beef Tacos",
    image: "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10191-0.webp",
    signal: "watch",
    movement: -18,
    loveRate: 11,
    opens: 284,
    customerLift: 67,
    repeatShare: 29,
    summary: "Customer interest is slipping",
    why: "Opens fell after the management lead photo changed. Customer photos are still drawing attention.",
    action: "Restore a more appetizing lead photo and watch the next seven days.",
  },
  {
    id: "burrata",
    name: "Salmon Rainbow Salad",
    image: "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10199-0.webp",
    signal: "new",
    movement: 21,
    loveRate: 22,
    opens: 198,
    customerLift: 18,
    repeatShare: 17,
    summary: "Promising first two weeks",
    why: "Strong love rate, especially among first-time visitors. It needs more customer photography before the signal is reliable.",
    action: "Ask early fans for photos and keep the item in its learning window.",
  },
  {
    id: "sandwich",
    name: "Spare Ribs & Coleslaw",
    image: "/api/r2-photo?key=fixture-photos/lrays-kitchen/notion-10201-0.webp",
    signal: "steady",
    movement: 3,
    loveRate: 19,
    opens: 431,
    customerLift: 7,
    repeatShare: 48,
    summary: "Reliable with regulars",
    why: "Interest and love rate are stable. Repeat customers drive almost half of engagement.",
    action: "No change needed. Use it as a benchmark for other core items.",
  },
];

const SIGNAL_META: Record<Signal, { label: string; color: string }> = {
  rising: { label: "Rising", color: "#54dfa0" },
  watch: { label: "Needs attention", color: "#ff7b78" },
  new: { label: "New item", color: "#d9b8ff" },
  steady: { label: "Steady", color: "#79b9ff" },
};

function audienceMetrics(item: MenuSignal, audience: Audience) {
  if (audience === "regulars") {
    return {
      movement: item.movement + (item.repeatShare >= 40 ? 8 : -5),
      loveRate: Math.max(1, item.loveRate + (item.repeatShare >= 40 ? 5 : -2)),
      opens: Math.round(item.opens * item.repeatShare / 100),
    };
  }
  if (audience === "new") {
    return {
      movement: item.movement + (item.repeatShare < 35 ? 7 : -6),
      loveRate: Math.max(1, item.loveRate + (item.repeatShare < 35 ? 3 : -3)),
      opens: Math.round(item.opens * (100 - item.repeatShare) / 100),
    };
  }
  return { movement: item.movement, loveRate: item.loveRate, opens: item.opens };
}

function SignalRow({ item, audience, onOpen }: { item: MenuSignal; audience: Audience; onOpen: () => void }) {
  const meta = SIGNAL_META[item.signal];
  const metrics = audienceMetrics(item, audience);
  return (
    <button onClick={onOpen} className="w-full py-3.5 border-b border-white/7 flex items-center gap-3 text-left">
      <div className="w-14 h-14 shrink-0 rounded-md overflow-hidden bg-white/5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image} alt={item.name} className="w-full h-full object-cover" /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-white text-[12.5px] font-bold truncate">{item.name}</p><span className="text-[8px] uppercase font-bold whitespace-nowrap" style={{ color: meta.color }}>{meta.label}</span></div><p className="text-white/38 text-[10px] mt-1 line-clamp-2">{item.summary}</p><p className="text-white/25 text-[9px] mt-1.5">Love rate {metrics.loveRate}% · {metrics.opens} opens</p></div>
      <span className="text-[12px] font-bold tabular-nums" style={{ color: metrics.movement >= 0 ? "#54dfa0" : "#ff7b78" }}>{metrics.movement >= 0 ? "+" : ""}{metrics.movement}%</span><span className="text-white/20">›</span>
    </button>
  );
}

function AudienceControl({ value, onChange }: { value: Audience; onChange: (value: Audience) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md bg-white/6 p-1" role="group" aria-label="Customer audience">
      {([["all", "All customers"], ["new", "New"], ["regulars", "Regulars"]] as const).map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} className="min-h-8 rounded text-[9px] font-bold" style={{ background: value === key ? "white" : "transparent", color: value === key ? "black" : "rgba(255,255,255,.38)" }}>{label}</button>
      ))}
    </div>
  );
}

function OpportunityCard({ label, title, detail, value, tone, item, onOpen }: { label: string; title: string; detail: string; value: string; tone: string; item: MenuSignal; onOpen: (item: MenuSignal) => void }) {
  return (
    <button onClick={() => onOpen(item)} className="w-full py-4 border-b border-white/7 text-left">
      <div className="flex gap-3">
        <div className="w-14 h-14 shrink-0 overflow-hidden rounded-md bg-white/5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image} alt="" className="w-full h-full object-cover" /></div>
        <div className="min-w-0 flex-1"><p className="text-[8.5px] uppercase font-bold" style={{ color: tone }}>{label}</p><p className="text-white text-[13px] font-bold mt-1">{title}</p><p className="text-white/38 text-[10px] leading-relaxed mt-1">{detail}</p></div>
        <span className="shrink-0 text-[13px] font-bold" style={{ color: tone }}>{value}</span>
      </div>
      <p className="ml-[68px] text-white/55 text-[9.5px] font-bold mt-2">Inspect and act →</p>
    </button>
  );
}

function PulseSheet({ initialItem, onClose, onLaunch }: { initialItem?: string; onClose: () => void; onLaunch: (pulse: CustomerPulse) => void }) {
  const [item, setItem] = useState(initialItem ?? ITEMS[0].name);
  const [question, setQuestion] = useState("Would you order this again?");
  const [audience, setAudience] = useState("People who opened or loved this item");
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Ask customers" onClick={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onLaunch({ item, question, audience }); }} className="w-full max-w-3xl rounded-t-2xl bg-[#171717] px-4 pt-4 pb-7 slide-up" onClick={(event) => event.stopPropagation()}>
        <div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-4" />
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-cyan-300">One-question customer pulse</p><h2 className="text-white text-[19px] font-bold mt-0.5">Ask the right people</h2><p className="text-white/38 text-[10.5px] leading-relaxed mt-1">SeeFood shows one quick question only to customers whose behavior makes their answer useful.</p></div><button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div>
        <div className="space-y-3 mt-5">
          <label className="block text-white/42 text-[10px] font-bold">Menu item<select value={item} onChange={(event) => setItem(event.target.value)} className="mt-1.5 w-full rounded-md bg-[#292929] border border-white/10 px-3 py-3 text-white text-[12px]">{ITEMS.map((candidate) => <option key={candidate.id}>{candidate.name}</option>)}</select></label>
          <label className="block text-white/42 text-[10px] font-bold">Question<select value={question} onChange={(event) => setQuestion(event.target.value)} className="mt-1.5 w-full rounded-md bg-[#292929] border border-white/10 px-3 py-3 text-white text-[12px]"><option>Would you order this again?</option><option>Is this better than you remember?</option><option>Does the photo match what arrived?</option><option>Should this stay on the menu?</option></select></label>
          <label className="block text-white/42 text-[10px] font-bold">Ask<select value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1.5 w-full rounded-md bg-[#292929] border border-white/10 px-3 py-3 text-white text-[12px]"><option>People who opened or loved this item</option><option>Returning customers who know this item</option><option>Customers who shared a photo of this item</option></select></label>
        </div>
        <div className="mt-4 border-l-2 border-cyan-300 bg-cyan-300/[0.05] px-3 py-3"><p className="text-cyan-200 text-[8px] uppercase font-bold">Customer preview</p><p className="text-white text-[12px] font-bold mt-1">{question}</p><p className="text-white/35 text-[9.5px] mt-1">Yes · Not sure · No</p></div>
        <button className="w-full min-h-11 mt-5 rounded-md bg-white text-black text-[11px] font-bold">Launch sample pulse</button>
      </form>
    </div>
  );
}

function ItemDrawer({ item, onClose, onHookup, onReviewPhotos, onAsk }: { item: MenuSignal; onClose: () => void; onHookup: () => void; onReviewPhotos: () => void; onAsk: () => void }) {
  const meta = SIGNAL_META[item.signal];
  const impressions = item.opens * 3;
  const loves = Math.round(item.opens * item.loveRate / 100);
  const returns = Math.max(2, Math.round(loves * item.repeatShare / 100));
  const managementPhotoRate = 12;
  const customerPhotoRate = Math.round(managementPhotoRate * (1 + item.customerLift / 100));
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`${item.name} insights`} onClick={onClose}>
      <div className="w-full max-w-3xl h-[90vh] overflow-y-auto rounded-t-2xl bg-[#141414] border-t border-white/12 slide-up" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 px-4 pt-3 pb-3 bg-[#141414]/95 backdrop-blur border-b border-white/8"><div className="w-9 h-1 bg-white/15 rounded-full mx-auto mb-3" /><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold" style={{ color: meta.color }}>{meta.label} · sample signal</p><h2 className="text-white text-[19px] font-bold">{item.name}</h2></div><button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div></div>
        <div className="aspect-[16/10] bg-black">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image} alt={item.name} className="w-full h-full object-cover" /></div>
        <div className="px-4 pb-8">
          <div className="grid grid-cols-4 gap-3 py-5 border-b border-white/8"><div><p className="text-white text-[18px] font-bold">{item.opens}</p><p className="text-white/32 text-[8px] uppercase font-bold">Opens</p></div><div><p className="text-white text-[18px] font-bold">{item.loveRate}%</p><p className="text-white/32 text-[8px] uppercase font-bold">Love rate</p></div><div><p className="text-emerald-300 text-[18px] font-bold">+{item.customerLift}%</p><p className="text-white/32 text-[8px] uppercase font-bold">Customer photo lift</p></div><div><p className="text-white text-[18px] font-bold">{item.repeatShare}%</p><p className="text-white/32 text-[8px] uppercase font-bold">From regulars</p></div></div>
          <section className="py-5 border-b border-white/8"><p className="text-white/30 text-[8px] uppercase font-bold">Customer journey</p><div className="grid grid-cols-4 gap-2 mt-3">{[[impressions, "Saw"], [item.opens, "Opened"], [loves, "Loved"], [returns, "Returned"]].map(([value, label], index) => <div key={label} className="relative"><p className="text-white text-[14px] font-bold">{value}</p><p className="text-white/30 text-[8px] uppercase font-bold mt-0.5">{label}</p>{index < 3 && <span className="absolute right-0 top-2 text-white/15">›</span>}</div>)}</div></section>
          <section className="py-5 border-b border-white/8"><div className="flex items-end justify-between"><div><p className="text-white/30 text-[8px] uppercase font-bold">Photo reality gap</p><p className="text-white text-[12px] font-bold mt-1">Which photos earn an open?</p></div><span className="text-emerald-300 text-[10px] font-bold">Customers +{item.customerLift}%</span></div><div className="mt-3 space-y-2"><div className="grid grid-cols-[82px_1fr_32px] gap-2 items-center"><span className="text-white/38 text-[9px]">Management</span><div className="h-2 rounded bg-white/7 overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${managementPhotoRate * 3}%` }} /></div><span className="text-white/45 text-[9px]">{managementPhotoRate}%</span></div><div className="grid grid-cols-[82px_1fr_32px] gap-2 items-center"><span className="text-white/38 text-[9px]">Customers</span><div className="h-2 rounded bg-white/7 overflow-hidden"><div className="h-full bg-emerald-300" style={{ width: `${Math.min(100, customerPhotoRate * 3)}%` }} /></div><span className="text-white/45 text-[9px]">{customerPhotoRate}%</span></div></div></section>
          <section className="py-5 border-b border-white/8"><p className="text-white/30 text-[8px] uppercase font-bold">What customers are signaling</p><p className="text-white/72 text-[13px] leading-relaxed mt-2">{item.why}</p><div className="grid grid-cols-2 gap-2 mt-4"><div className="border-l-2 border-sky-300 pl-3"><p className="text-sky-200 text-[16px] font-bold">{100 - item.repeatShare}%</p><p className="text-white/30 text-[8px] uppercase font-bold">New customers</p></div><div className="border-l-2 border-violet-300 pl-3"><p className="text-violet-200 text-[16px] font-bold">{item.repeatShare}%</p><p className="text-white/30 text-[8px] uppercase font-bold">Regulars</p></div></div></section>
          <section className="py-5"><p className="text-white/30 text-[8px] uppercase font-bold">Best next move</p><p className="text-white text-[13px] font-bold leading-relaxed mt-2">{item.action}</p><div className="grid grid-cols-2 gap-2 mt-4"><button onClick={onHookup} className="min-h-11 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold">Hook up its fans</button><button onClick={onAsk} className="min-h-11 rounded-md bg-white text-black text-[11px] font-bold">Ask customers</button><button onClick={onReviewPhotos} className="col-span-2 min-h-11 rounded-md border border-white/12 text-white/60 text-[11px] font-bold">Review its photos</button></div></section>
          <p className="text-white/22 text-[9px] leading-relaxed">Signals compare the selected period with the prior matching period. Early samples are labeled so movement is never presented as certainty.</p>
        </div>
      </div>
    </div>
  );
}

export default function MenuIntelligenceDashboard() {
  const [view, setView] = useState<View>("brief");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [audience, setAudience] = useState<Audience>("all");
  const [selected, setSelected] = useState<MenuSignal | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [pulseItem, setPulseItem] = useState<string | undefined>();
  const [activePulse, setActivePulse] = useState<CustomerPulse | null>(null);
  const [savedChange, setSavedChange] = useState<string | null>(null);
  const ordered = useMemo(() => [...ITEMS].sort((a, b) => audienceMetrics(b, audience).movement - audienceMetrics(a, audience).movement), [audience]);

  const saveChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavedChange(`${form.get("item")} · ${form.get("changeType")} · watching from ${form.get("date")}`);
    setChangeOpen(false);
    setView("changes");
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto bg-[var(--surface-0)] pb-10">
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <a href="/manage" className="w-9 h-9 rounded-full bg-white/7 flex items-center justify-center text-white/65" aria-label="Back to management">←</a>
        <div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-amber-300">Management sample</p><h1 className="text-[18px] font-bold truncate">Customer Insights</h1></div>
        <div className="flex p-1 rounded-md bg-white/7">{(["week", "month"] as const).map((value) => <button key={value} onClick={() => setPeriod(value)} className="px-2.5 py-1.5 rounded text-[9px] font-bold capitalize" style={{ background: period === value ? "white" : "transparent", color: period === value ? "black" : "rgba(255,255,255,.35)" }}>{value}</button>)}</div>
      </header>

      <div className="px-4">
        <section className="pt-5 pb-4 border-b border-white/8">
          <div className="flex items-start justify-between gap-3"><div><p className="text-white text-[19px] font-bold">What changed this {period}?</p><p className="text-white/40 text-[11px] mt-1">What customer behavior suggests deserves your attention.</p></div><button onClick={() => { setPulseItem(undefined); setPulseOpen(true); }} className="shrink-0 min-h-9 px-3 rounded-md bg-cyan-300 text-black text-[9.5px] font-bold">Ask customers</button></div>
          <div className="grid grid-cols-3 gap-2 mt-4"><div className="p-3 rounded-md bg-emerald-300/[0.07] border border-emerald-300/15"><p className="text-emerald-300 text-[19px] font-bold">3</p><p className="text-white/35 text-[9px] mt-1">Rising</p></div><div className="p-3 rounded-md bg-rose-300/[0.07] border border-rose-300/15"><p className="text-rose-300 text-[19px] font-bold">2</p><p className="text-white/35 text-[9px] mt-1">Need attention</p></div><div className="p-3 rounded-md bg-violet-300/[0.07] border border-violet-300/15"><p className="text-violet-300 text-[19px] font-bold">1</p><p className="text-white/35 text-[9px] mt-1">Learning</p></div></div>
          <div className="mt-3"><AudienceControl value={audience} onChange={setAudience} /></div>
        </section>

        <div className="grid grid-cols-4 border-b border-white/8">{([["brief", "Brief"], ["items", "Items"], ["opportunities", "Moves"], ["changes", "Changes"]] as const).map(([value, label]) => <button key={value} onClick={() => setView(value)} className="min-h-11 text-[9.5px] font-bold border-b-2" style={{ color: view === value ? "white" : "rgba(255,255,255,.32)", borderColor: view === value ? "var(--accent)" : "transparent" }}>{label}</button>)}</div>

        {view === "brief" && <div className="fade-in">
          {activePulse && <section className="py-4 border-b border-white/8"><div className="border-l-2 border-cyan-300 bg-cyan-300/[0.045] px-3 py-3"><div className="flex justify-between gap-3"><div><p className="text-cyan-200 text-[8.5px] uppercase font-bold">Customer pulse collecting answers</p><p className="text-white text-[12px] font-bold mt-1">{activePulse.question}</p><p className="text-white/35 text-[9.5px] mt-1">{activePulse.item} · {activePulse.audience}</p></div><span className="shrink-0 text-cyan-200 text-[9px] font-bold">LIVE</span></div><div className="h-1.5 bg-white/8 rounded mt-3 overflow-hidden"><div className="h-full w-[18%] bg-cyan-300" /></div><p className="text-white/25 text-[8.5px] mt-1.5">9 of 50 useful responses</p></div></section>}
          <section className="py-5 border-b border-white/8"><p className="text-[9px] uppercase font-bold text-amber-300">Start here</p><button onClick={() => setSelected(ITEMS[1])} className="w-full text-left mt-2 p-4 rounded-lg bg-rose-300/[0.065] border border-rose-300/15"><div className="flex justify-between gap-3"><div><p className="text-white text-[15px] font-bold">Spicy Korean Beef Tacos need a look</p><p className="text-white/45 text-[10.5px] leading-relaxed mt-1.5">Interest fell after the lead photo changed. Customer photos still earn far more opens.</p></div><span className="text-rose-300 text-[18px] font-bold">−18%</span></div><p className="text-rose-200 text-[10px] font-bold mt-3">See the customer journey →</p></button></section>
          <section className="py-5"><div className="flex items-end justify-between"><div><p className="text-[9px] uppercase font-bold text-emerald-300">Menu momentum</p><h2 className="text-white text-[17px] font-bold mt-1">Strongest signals</h2></div><span className="text-white/25 text-[9px]">vs prior {period}</span></div><div className="mt-2">{ordered.slice(0, 3).map((item) => <SignalRow key={item.id} item={item} audience={audience} onOpen={() => setSelected(item)} />)}</div></section>
        </div>}

        {view === "items" && <div className="fade-in py-2">{ordered.map((item) => <SignalRow key={item.id} item={item} audience={audience} onOpen={() => setSelected(item)} />)}</div>}

        {view === "opportunities" && <div className="fade-in py-5"><div><p className="text-[9px] uppercase font-bold text-cyan-300">Ranked by likely upside</p><h2 className="text-white text-[17px] font-bold mt-1">Moves worth testing</h2><p className="text-white/38 text-[10.5px] leading-relaxed mt-1">These combine attention, love, photo performance, and regular-customer behavior.</p></div><div className="mt-3 border-y border-white/8"><OpportunityCard label="Fix the promise" title="Spicy Korean Beef Tacos’ customer photos win" detail="Customer photography earns 67% more engagement than the current management lead." value="+67%" tone="#ff8d65" item={ITEMS[1]} onOpen={setSelected} /><OpportunityCard label="Hidden favorite" title="Salmon Rainbow Salad deserves more visibility" detail="Its love rate is strong despite being seen far less than the menu leaders." value="22%" tone="#d9b8ff" item={ITEMS[2]} onOpen={setSelected} /><OpportunityCard label="Protect a regulars’ favorite" title="Rotisserie Chicken anchors repeat interest" detail="Regular customers drive most of its engagement and its momentum is accelerating." value="61%" tone="#54dfa0" item={ITEMS[0]} onOpen={setSelected} /><OpportunityCard label="Reliable benchmark" title="Spare Ribs & Coleslaw sets the baseline" detail="Stable attention and strong repeat behavior make it useful for judging new items." value="48%" tone="#79b9ff" item={ITEMS[3]} onOpen={setSelected} /></div><button onClick={() => { setPulseItem(undefined); setPulseOpen(true); }} className="w-full min-h-11 mt-5 rounded-md bg-cyan-300 text-black text-[11px] font-bold">Ask customers about an item</button></div>}

        {view === "changes" && <div className="fade-in py-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] uppercase font-bold text-violet-300">Before and after</p><h2 className="text-white text-[17px] font-bold mt-1">Track a menu change</h2><p className="text-white/40 text-[10.5px] leading-relaxed mt-1">Mark a recipe, plating, price, name, or photo change. SeeFood will compare customer signals before and after it.</p></div><button onClick={() => setChangeOpen(true)} className="shrink-0 min-h-10 px-3 rounded-md bg-white text-black text-[10px] font-bold">Mark change</button></div>{savedChange ? <div className="mt-5 p-4 rounded-md border border-violet-300/15 bg-violet-300/[0.06]"><p className="text-violet-200 text-[9px] uppercase font-bold">Learning window active</p><p className="text-white text-[12px] font-bold mt-1.5">{savedChange}</p><p className="text-white/35 text-[10px] mt-2">The first comparison will appear after enough post-change views and loves accumulate.</p></div> : <div className="mt-5 border-y border-white/8 py-4"><p className="text-white text-[12px] font-bold">Salmon Rainbow Salad · New item</p><p className="text-white/38 text-[10px] mt-1">Day 12 of 21 · 198 opens · 22% love rate</p><div className="h-1.5 bg-white/8 rounded-full mt-3 overflow-hidden"><div className="h-full w-[57%] bg-violet-300 rounded-full" /></div></div>}<div className="mt-6 p-4 border-l-2 border-amber-300 bg-amber-300/[0.04]"><p className="text-white text-[12px] font-bold">The question this answers</p><p className="text-white/45 text-[10.5px] leading-relaxed mt-1.5">Did customers respond better after we changed the recipe, presentation, name, or photo, especially the regulars who knew the item before?</p></div></div>}
      </div>

      {selected && <ItemDrawer item={selected} onClose={() => setSelected(null)} onHookup={() => { window.location.href = "/manage?hookup=1"; }} onReviewPhotos={() => { window.location.href = "/manage?health=1"; }} onAsk={() => { setPulseItem(selected.name); setSelected(null); setPulseOpen(true); }} />}
      {pulseOpen && <PulseSheet initialItem={pulseItem} onClose={() => setPulseOpen(false)} onLaunch={(pulse) => { setActivePulse(pulse); setPulseOpen(false); setView("brief"); }} />}
      {changeOpen && <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" onClick={() => setChangeOpen(false)}><form onSubmit={saveChange} onClick={(event) => event.stopPropagation()} className="w-full max-w-3xl rounded-t-2xl bg-[#171717] px-4 pt-4 pb-7 slide-up"><div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" /><h2 className="text-white text-[18px] font-bold">Mark a menu change</h2><p className="text-white/38 text-[10.5px] mt-1">This starts a clean before-and-after learning window.</p><div className="space-y-3 mt-4"><label className="block text-white/42 text-[10px] font-bold">Menu item<select name="item" className="mt-1.5 w-full bg-[#272727] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]">{ITEMS.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="block text-white/42 text-[10px] font-bold">What changed?<select name="changeType" className="mt-1.5 w-full bg-[#272727] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]"><option>Recipe</option><option>Plating</option><option>Price</option><option>Name or description</option><option>Lead photo</option><option>Portion</option></select></label><label className="block text-white/42 text-[10px] font-bold">Date<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full bg-[#272727] border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /></label><label className="block text-white/42 text-[10px] font-bold">Internal note<textarea name="note" rows={2} placeholder="What should the team remember?" className="mt-1.5 w-full resize-none bg-white/7 border border-white/10 rounded-md px-3 py-3 text-white text-[12px]" /></label></div><div className="flex gap-2 mt-5"><button type="button" onClick={() => setChangeOpen(false)} className="flex-1 min-h-11 rounded-md border border-white/10 text-white/45 text-[11px] font-bold">Cancel</button><button className="flex-[2] min-h-11 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold">Start watching</button></div></form></div>}
    </main>
  );
}
