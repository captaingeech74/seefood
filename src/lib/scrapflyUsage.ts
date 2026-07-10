/**
 * Scrapfly free-tier budget guard (1,000 calls/mo). Reads real usage straight
 * from Scrapfly's own account API rather than self-counting — accurate, and
 * immune to drift if a call fails after being counted or succeeds after being
 * skipped. Cached briefly per warm serverless instance since this is called
 * before every live-path Scrapfly attempt (Menufy render fallback, ordering-
 * platform render fallback) and we don't want to double request latency for it.
 */

const USAGE_URL = "https://api.scrapfly.io/account";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Stop making Scrapfly calls once remaining credits drop below this, so a
// burst of concurrent requests can't blow through the free tier's hard reset
// date and so debug-sources/manual testing always has some headroom left.
const RESERVE_FLOOR = 50;

export interface ScrapflyUsage {
  current: number;
  limit: number;
  remaining: number;
  periodEnd: string;
  capActive: boolean; // true once remaining < RESERVE_FLOOR — live calls are being skipped
}

let cached: { usage: ScrapflyUsage | null; fetchedAt: number } | null = null;

async function fetchUsage(): Promise<ScrapflyUsage | null> {
  const key = process.env.SCRAPFLY_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${USAGE_URL}?key=${key}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const scrape = data?.subscription?.usage?.scrape;
    if (!scrape) return null;
    const remaining = scrape.remaining ?? scrape.limit - scrape.current;
    return {
      current: scrape.current,
      limit: scrape.limit,
      remaining,
      periodEnd: data?.subscription?.period?.end ?? "",
      capActive: remaining < RESERVE_FLOOR,
    };
  } catch (e) {
    console.error("[scrapfly-usage] fetch failed:", e);
    return null;
  }
}

/** Visible counter for /api/debug-sources — real numbers from Scrapfly, cached 5min. */
export async function getScrapflyUsage(): Promise<ScrapflyUsage | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.usage;
  const usage = await fetchUsage();
  cached = { usage, fetchedAt: Date.now() };
  return usage;
}

/**
 * Hard cap check before spending a Scrapfly credit. Fail-closed: if usage
 * can't be verified (network error, missing key), skip the call rather than
 * risk overage — the caller already treats a `false` here as "source
 * unavailable" and fails open on the page overall (PRD §6 resilience).
 */
export async function hasScrapflyBudget(): Promise<boolean> {
  const usage = await getScrapflyUsage();
  if (!usage) return false;
  return !usage.capActive;
}
