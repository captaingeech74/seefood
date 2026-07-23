"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { SOURCE_LABELS } from "@/lib/labels";

interface ActivityMetrics {
  opens: number;
  uniqueVisitors: number;
  loves: number;
  shares: number;
  photoAdds: number;
}

interface CoverageResponse {
  locationLabel: string;
  lat: number;
  lng: number;
  radiusKm: number;
  restaurantCount: number;
  averageMenuItems: number;
  averagePhotos: number;
  matchedPhotoPercentage: number;
  seeFoodPhotoPercentage: number;
  sourceBreakdown: Array<{ source: string; count: number; percentage: number }>;
  activity: { week: ActivityMetrics; month: ActivityMetrics };
  trackingStartedAt: string | null;
  coverageLevels: Array<{ level: 0 | 1 | 2 | 3; count: number; label: string }>;
  acquisition: {
    websiteCount: number;
    queuedCrawls: number;
    identitySources: Array<{ source: string; count: number }>;
    platforms: Array<{ platform: string; count: number }>;
  };
}

function Metric({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="py-4 border-b border-[var(--border-subtle)] min-w-0">
      <p className="text-white/40 text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5">{label}</p>
      <p className="text-white text-[28px] leading-none font-bold tabular-nums">
        {value}{suffix && <span className="text-white/35 text-[13px] ml-1 font-semibold">{suffix}</span>}
      </p>
    </div>
  );
}

function ActivityRow({ label, week, month }: { label: string; week: number; month: number }) {
  return (
    <div className="grid grid-cols-[1fr_72px_72px] gap-2 items-center py-2.5 border-b border-[var(--border-subtle)] text-[13px]">
      <span className="text-white/65 font-semibold">{label}</span>
      <span className="text-white text-right tabular-nums font-bold">{week.toLocaleString()}</span>
      <span className="text-white/65 text-right tabular-nums font-semibold">{month.toLocaleString()}</span>
    </div>
  );
}

export default function CoverageLegacyDashboard() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: URLSearchParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coverage?${params}`, { cache: "no-store" });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Coverage could not be loaded.");
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coverage could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    if (lat && lng) {
      void load(new URLSearchParams({ lat, lng }));
      return;
    }
    if (!navigator.geolocation) {
      setLoading(false);
      setError("Enter a city or ZIP code to see coverage.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void load(new URLSearchParams({
        lat: String(position.coords.latitude),
        lng: String(position.coords.longitude),
      })),
      () => {
        setLoading(false);
        setError("Enter a city or ZIP code to see coverage.");
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }, [load]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    void load(new URLSearchParams({ q: trimmed }));
  };

  return (
    <main className="min-h-screen bg-[var(--surface-0)] max-w-3xl mx-auto pb-12">
      <header
        className="sticky top-0 z-20 glass border-b border-[var(--border-subtle)] px-4 pb-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))", background: "rgba(10,10,10,0.94)" }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => history.back()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/65 active:bg-white/10"
            aria-label="Back to seeFood"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-bold">Development analytics</p>
            <h1 className="text-white text-[21px] font-bold tracking-tight">Coverage pulse</h1>
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="City or ZIP code"
              aria-label="City or ZIP code"
              className="w-full rounded-xl bg-[var(--surface-2)] text-white pl-9 pr-3 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--accent-ring)] placeholder:text-white/30"
            />
          </div>
          <button type="submit" disabled={!query.trim() || loading} className="px-4 rounded-xl bg-[var(--accent)] text-white text-[13px] font-bold disabled:opacity-40">View</button>
        </form>
      </header>

      <div className="px-4">
        {loading && (
          <div className="py-24 flex items-center justify-center gap-3 text-white/45 text-[13px] font-semibold">
            <span className="w-4 h-4 rounded-full border-2 border-white/15 border-t-white/70 animate-spin" />
            Measuring coverage
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center">
            <p className="text-white/65 text-[14px]">{error}</p>
          </div>
        )}

        {!loading && data && (
          <div className="fade-up">
            <div className="py-4 border-b border-[var(--border-soft)]">
              <p className="text-white text-[16px] font-bold truncate">{data.locationLabel}</p>
              <p className="text-white/35 text-[12px] mt-0.5">Within {Math.round(data.radiusKm * 0.621371)} miles</p>
            </div>

            <section aria-labelledby="coverage-heading">
              <div className="flex items-baseline justify-between gap-3 pt-5">
                <h2 id="coverage-heading" className="text-white text-[16px] font-bold">Supply coverage</h2>
                <span className="text-white/30 text-[11px]">Live corpus</span>
              </div>
              <div className="grid grid-cols-2 gap-x-5">
                <Metric label="Restaurants" value={data.restaurantCount} />
                <Metric label="Menu items / restaurant" value={data.averageMenuItems} />
                <Metric label="Photos / restaurant" value={data.averagePhotos} />
                <Metric label="Matched to menu" value={data.matchedPhotoPercentage} suffix="%" />
                <Metric label="Uploaded on seeFood" value={data.seeFoodPhotoPercentage} suffix="%" />
              </div>
              <div className="mt-5 border-y border-[var(--border-subtle)] py-3">
                <p className="text-white/35 text-[10px] uppercase tracking-[0.1em] font-bold mb-3">Coverage ladder</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {data.coverageLevels.map((item) => (
                    <div key={item.level} className="min-w-0">
                      <div className="h-1.5 bg-white/8 overflow-hidden rounded-full">
                        <div className="h-full bg-[var(--accent)]" style={{ width: data.restaurantCount ? `${Math.max(4, item.count / data.restaurantCount * 100)}%` : "0%" }} />
                      </div>
                      <p className="text-white text-[15px] font-bold mt-2 tabular-nums">{item.count}</p>
                      <p className="text-white/35 text-[9px] leading-tight mt-0.5">L{item.level} {item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section aria-labelledby="source-heading" className="pt-6">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 id="source-heading" className="text-white text-[16px] font-bold">Photo sources</h2>
                <span className="text-white/30 text-[11px]">All photos nearby</span>
              </div>
              <div className="space-y-3">
                {data.sourceBreakdown.map((source) => (
                  <div key={source.source}>
                    <div className="flex justify-between gap-3 text-[12px] mb-1.5">
                      <span className="text-white/60 font-semibold">{SOURCE_LABELS[source.source as keyof typeof SOURCE_LABELS] ?? source.source}</span>
                      <span className="text-white tabular-nums font-bold">{source.percentage}% <span className="text-white/30 font-medium">· {source.count}</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(source.percentage, 1)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="acquisition-heading" className="pt-7">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h2 id="acquisition-heading" className="text-white text-[16px] font-bold">Acquisition engine</h2>
                <span className="text-white/30 text-[11px]">This area</span>
              </div>
              <div className="grid grid-cols-2 gap-x-5">
                <Metric label="Restaurant websites" value={data.acquisition.websiteCount} />
                <Metric label="Queued site crawls" value={data.acquisition.queuedCrawls} />
              </div>
              <div className="py-4 border-b border-[var(--border-subtle)]">
                <p className="text-white/35 text-[10px] uppercase tracking-[0.1em] font-bold mb-2">Identity coverage</p>
                <p className="text-white/65 text-[13px] leading-6">{data.acquisition.identitySources.map((item) => `${item.source} ${item.count.toLocaleString()}`).join(" · ") || "No identities yet"}</p>
              </div>
              <div className="py-4 border-b border-[var(--border-subtle)]">
                <p className="text-white/35 text-[10px] uppercase tracking-[0.1em] font-bold mb-2">Ordering platforms found</p>
                <p className="text-white/65 text-[13px] leading-6">{data.acquisition.platforms.map((item) => `${item.platform} ${item.count.toLocaleString()}`).join(" · ") || "Crawls are queued"}</p>
              </div>
            </section>

            <section aria-labelledby="activity-heading" className="pt-7">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h2 id="activity-heading" className="text-white text-[16px] font-bold">App activity</h2>
                <span className="text-white/30 text-[11px]">This area</span>
              </div>
              <div className="grid grid-cols-[1fr_72px_72px] gap-2 text-[10px] uppercase tracking-[0.08em] text-white/30 font-bold pb-1">
                <span>Metric</span><span className="text-right">7 days</span><span className="text-right">30 days</span>
              </div>
              <ActivityRow label="App opens" week={data.activity.week.opens} month={data.activity.month.opens} />
              <ActivityRow label="Unique visitors" week={data.activity.week.uniqueVisitors} month={data.activity.month.uniqueVisitors} />
              <ActivityRow label="Loves" week={data.activity.week.loves} month={data.activity.month.loves} />
              <ActivityRow label="Shares" week={data.activity.week.shares} month={data.activity.month.shares} />
              <ActivityRow label="Photo adds" week={data.activity.week.photoAdds} month={data.activity.month.photoAdds} />
              <p className="text-white/30 text-[11px] leading-relaxed mt-3">
                {data.trackingStartedAt
                  ? `First-party activity tracking began ${new Date(data.trackingStartedAt).toLocaleDateString()}.`
                  : "First-party activity tracking begins with this release; earlier activity is not available."}
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
