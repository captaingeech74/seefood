/**
 * Diagnostic endpoint — tests every live-path menu data source for a given
 * restaurant. Usage: GET /api/debug-sources?placeId=ChIJ...&name=...&lat=&lng=
 *
 * NOT cached — always runs fresh for debugging.
 *
 * DoorDash is intentionally NOT tested here: its Scrapfly ASP challenge costs
 * 51–75+ credits per attempt, and this endpoint is hit often during debugging.
 * DoorDash is corpus-only (Tier 1 local crawler) — see DECISIONS.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchMenuFromGrubhub } from "@/lib/google";
import { fetchMenuFromUrl } from "@/lib/menuSources";
import { getDoorDashStoreUrl } from "@/lib/db";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId") ?? "";
  const name    = searchParams.get("name") ?? "";
  const lat     = parseFloat(searchParams.get("lat") ?? "0");
  const lng     = parseFloat(searchParams.get("lng") ?? "0");

  const API_KEY = process.env.GOOGLE_MAPS_API_KEY!.trim();

  const results: Record<string, unknown> = {};
  let websiteUrl: string | undefined;

  // ── Source: restaurant website schema.org + Menufy (2-hop) ──────────────────
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_address&key=${API_KEY}`;
    const dr = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
    const dd = await dr.json();
    websiteUrl = dd.result?.website;
    results.website = { url: websiteUrl ?? null, menu_items: 0, sample: [] };

    if (websiteUrl) {
      const wr = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SeeFood/1.0)", Accept: "text/html" },
      });
      const html = await wr.text();
      const isMenufy = html.includes("api.menufy.com");
      (results.website as Record<string, unknown>).html_length = html.length;
      (results.website as Record<string, unknown>).has_ld_json = html.includes("application/ld+json");
      (results.website as Record<string, unknown>).is_menufy_direct = isMenufy;
      (results.website as Record<string, unknown>).website_ok = wr.ok;

      const parsed = await fetchMenuFromUrl(websiteUrl);
      (results.website as Record<string, unknown>).parsed_menu_items = parsed.length;
      (results.website as Record<string, unknown>).parsed_sample = parsed.slice(0, 3).map((i) => i.name);
    }
  } catch (e) {
    results.website = { error: String(e) };
  }

  // ── Source: Grubhub ──────────────────────────────────────────────────────────
  if (lat && lng) {
    try {
      const items = await fetchMenuFromGrubhub(name, lat, lng);
      results.grubhub = {
        ok: items.length > 0,
        item_count: items.length,
        sample: items.slice(0, 3).map((i) => i.name),
        scrapfly_configured: !!process.env.SCRAPFLY_KEY,
      };
    } catch (e) {
      results.grubhub = { error: String(e) };
    }
  }

  // ── Source: Menufy (explicit, via website + 2-hop follower) ─────────────────
  results.menufy = {
    detected: (results.website as Record<string, unknown>)?.is_menufy_direct ?? false,
    item_count: (results.website as Record<string, unknown>)?.parsed_menu_items ?? 0,
    note: "Menufy items are surfaced via the `website` source above (2-hop link follower included); duplicated here for scoreboard visibility.",
  };

  // ── Source: DoorDash — status only, never actually fetched here ─────────────
  // Corpus-only (Tier 1 crawler): Scrapfly's ASP challenge costs 51-75+
  // credits/attempt, and this endpoint is hit often during debugging. Discovery
  // is sitemap-first with a Camoufox-driven interactive search fallback in the
  // crawler (Google Custom Search is permanently closed to new customers —
  // see DECISIONS.md). Read-only status shown here.
  try {
    const cachedUrl = placeId ? await getDoorDashStoreUrl(placeId) : null;
    results.doordash = {
      note: "Corpus-only — not fetched here to conserve Scrapfly credits. Coverage comes from the Tier 1 local crawler.",
      cached_store_url: cachedUrl,
    };
  } catch (e) {
    results.doordash = { note: "Corpus-only.", error: String(e) };
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
