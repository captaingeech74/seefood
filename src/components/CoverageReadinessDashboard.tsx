"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ABOVE_FOLD_PHOTO_TARGET,
  CoverageScope,
  MAJOR_METRO_RESTAURANT_TARGET,
  STATE_NAMES,
  US_RESTAURANT_PLANNING_TOTAL,
} from "@/lib/geography";

interface CoverageReadinessResponse {
  locationLabel: string;
  period: "week" | "month";
  identifiedRestaurants: number;
  menuCoverage: number;
  basicPhotoCoverage: number;
  basicMenuPhotoCoverage: number;
  twentyPercentMenuPhotoCoverage: number;
  fiftyPercentMenuPhotoCoverage: number;
  comparisonCoverage: number;
  visits: number;
  visitors: number;
  newVisitors: number;
  uploadSessions: number;
  loves: number;
}

const FUNNEL = [
  ["identifiedRestaurants", "Restaurants identified"],
  ["menuCoverage", "Menu coverage"],
  ["basicPhotoCoverage", `${ABOVE_FOLD_PHOTO_TARGET}+ food photos`],
  ["basicMenuPhotoCoverage", `${ABOVE_FOLD_PHOTO_TARGET}+ menu-matched photos`],
  ["twentyPercentMenuPhotoCoverage", "20% menu photo coverage"],
  ["fiftyPercentMenuPhotoCoverage", "50% menu photo coverage"],
  ["comparisonCoverage", "1+ comparison dish"],
] as const;

const SCOPES: Array<{ value: CoverageScope; label: string }> = [
  { value: "temecula", label: "Temecula" },
  { value: "zip", label: "ZIP" },
  { value: "metro", label: "Metro" },
  { value: "state", label: "State" },
  { value: "nationwide", label: "US" },
];

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="py-4 border-b border-white/7 min-w-0">
      <p className="text-white text-[25px] font-bold leading-none tabular-nums">
        {value}<span className="text-white/35 text-[12px] ml-1">{suffix}</span>
      </p>
      <p className="text-white/42 text-[10px] font-bold uppercase mt-2 leading-tight">{label}</p>
    </div>
  );
}

export default function CoverageReadinessDashboard() {
  const [scope, setScope] = useState<CoverageScope>("temecula");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CoverageReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextScope: CoverageScope, nextPeriod: "week" | "month", q?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope: nextScope, period: nextPeriod });
      if (q?.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/coverage-readiness?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Coverage could not be loaded.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Coverage could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const automaticQuery = scope === "state" ? (query || "California") : query;
    if ((scope === "zip" || scope === "metro") && !automaticQuery.trim()) {
      setLoading(false);
      setError("");
      setData(null);
      return;
    }
    void load(scope, period, automaticQuery);
  }, [load, period, scope]); // Freeform queries submit explicitly.

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void load(scope, period, query);
  };

  const conversion = (value: number) => data?.identifiedRestaurants
    ? `${(value / data.identifiedRestaurants * 100).toFixed(value ? 1 : 0)}%`
    : "0%";
  const newRate = data?.visitors ? Math.round(data.newVisitors / data.visitors * 100) : 0;
  const returningRate = data?.visitors ? 100 - newRate : 0;
  const uploadRate = data?.visits ? Math.round(data.uploadSessions / data.visits * 1000) / 10 : 0;
  const queryNeeded = scope === "zip" || scope === "metro";
  const placeholder = scope === "zip" ? "Enter ZIP code" : "Enter metro area";
  const nationalProgress = useMemo(
    () => data && scope === "nationwide" ? data.identifiedRestaurants / US_RESTAURANT_PLANNING_TOTAL * 100 : null,
    [data, scope]
  );

  return (
    <main className="min-h-screen bg-[var(--surface-0)] max-w-3xl mx-auto pb-14">
      <header className="sticky top-0 z-20 border-b border-white/7 px-4 pb-3 bg-black/95 backdrop-blur" style={{ paddingTop: "max(13px, env(safe-area-inset-top))" }}>
        <div className="pr-24">
          <p className="text-[9px] uppercase font-bold text-[var(--accent)]">V1 coverage system</p>
          <h1 className="text-white text-[21px] font-bold">Market readiness</h1>
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
          {SCOPES.map((item) => (
            <button key={item.value} onClick={() => setScope(item.value)} className="shrink-0 px-3 min-h-9 rounded-lg text-[11px] font-bold border" style={{ background: scope === item.value ? "var(--accent-soft)" : "transparent", borderColor: scope === item.value ? "var(--accent)" : "rgba(255,255,255,0.08)", color: scope === item.value ? "white" : "rgba(255,255,255,0.42)" }}>
              {item.label}
            </button>
          ))}
        </div>
        {scope === "state" && (
          <select value={query || "California"} onChange={(event) => { setQuery(event.target.value); void load("state", period, event.target.value); }} className="mt-2 w-full bg-[var(--surface-2)] text-white text-[13px] rounded-lg px-3 py-3 border border-white/10 outline-none">
            {STATE_NAMES.map((state) => <option key={state}>{state}</option>)}
          </select>
        )}
        {queryNeeded && (
          <form onSubmit={submit} className="flex gap-2 mt-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-[var(--surface-2)] text-white text-[13px] rounded-lg px-3 py-3 border border-white/10 outline-none focus:border-[var(--accent)]" />
            <button className="px-4 bg-[var(--accent)] rounded-lg text-white text-[12px] font-bold">View</button>
          </form>
        )}
      </header>

      <div className="px-4">
        {loading && <div className="py-24 text-center text-white/40 text-sm">Measuring this market...</div>}
        {!loading && error && <div className="py-20 text-center text-rose-300/80 text-sm">{error}</div>}
        {!loading && data && (
          <div className="fade-up">
            <div className="py-5 border-b border-white/8">
              <p className="text-white text-[17px] font-bold">{data.locationLabel}</p>
              <p className="text-white/35 text-[11px] mt-1">Seven useful food photos fills the first screen.</p>
            </div>

            {nationalProgress !== null && (
              <div className="py-5 border-b border-white/8">
                <div className="flex justify-between text-[11px] mb-2"><span className="text-white/50">US identity target</span><span className="text-white font-bold">{nationalProgress.toFixed(1)}%</span></div>
                <div className="h-2 bg-white/8 rounded-full overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, nationalProgress)}%` }} /></div>
                <p className="text-white/30 text-[10px] mt-2">{US_RESTAURANT_PLANNING_TOTAL.toLocaleString()} US planning baseline · {MAJOR_METRO_RESTAURANT_TARGET.toLocaleString()} in the top 50 MSAs</p>
              </div>
            )}

            <section className="pt-6">
              <div className="flex items-end justify-between mb-4">
                <div><p className="text-white/35 text-[9px] font-bold uppercase">Restaurant data</p><h2 className="text-white text-[17px] font-bold">Coverage funnel</h2></div>
                <span className="text-white/30 text-[10px]">Live corpus</span>
              </div>
              <div className="space-y-1">
                {FUNNEL.map(([key, label], index) => {
                  const value = data[key];
                  const width = data.identifiedRestaurants ? Math.max(value ? 3 : 0, value / data.identifiedRestaurants * 100) : 0;
                  return (
                    <div key={key} className="py-3 border-b border-white/6">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-white/65 text-[12px] font-semibold">{index + 1}. {label}</span>
                        <span className="text-white text-[15px] font-bold tabular-nums">{value.toLocaleString()} <small className="text-white/30 text-[10px]">{conversion(value)}</small></span>
                      </div>
                      <div className="h-1.5 mt-2 bg-white/7 rounded-full overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${width}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="pt-7">
              <div className="flex items-center justify-between">
                <div><p className="text-white/35 text-[9px] font-bold uppercase">Demand</p><h2 className="text-white text-[17px] font-bold">User activity</h2></div>
                <div className="flex bg-white/6 p-0.5 rounded-lg">
                  {(["week", "month"] as const).map((item) => <button key={item} onClick={() => setPeriod(item)} className="px-3 py-1.5 rounded-md text-[10px] font-bold capitalize" style={{ background: period === item ? "white" : "transparent", color: period === item ? "black" : "rgba(255,255,255,0.4)" }}>{item}</button>)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-5 mt-2">
                <Stat label="Visitors" value={data.visitors.toLocaleString()} />
                <Stat label="Visits" value={data.visits.toLocaleString()} />
                <Stat label="Returning visitors" value={`${returningRate}%`} />
                <Stat label="Visits with an upload" value={`${uploadRate}%`} />
                <Stat label="New visitors" value={`${newRate}%`} />
                <Stat label="I loved this" value={data.loves.toLocaleString()} />
              </div>
              <p className="text-white/28 text-[10px] leading-relaxed mt-3">Session conversion is measured precisely from this release forward; older uploads did not carry a session ID.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
