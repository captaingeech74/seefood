/**
 * Diagnostic endpoint — tests all 6 menu data sources for a given restaurant.
 * Usage: GET /api/debug-sources?placeId=ChIJ...&name=...&lat=37.77&lng=-122.42
 *
 * NOT cached — always runs fresh for debugging.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchMenuFromDoorDash, fetchMenuFromGrubhub } from "@/lib/google";
import { fetchMenuFromUrl } from "@/lib/menuSources";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId") ?? "";
  const name    = searchParams.get("name") ?? "";
  const lat     = parseFloat(searchParams.get("lat") ?? "0");
  const lng     = parseFloat(searchParams.get("lng") ?? "0");

  const API_KEY    = process.env.GOOGLE_MAPS_API_KEY!.trim();
  const PLACES_KEY = (process.env.PLACES_API_KEY || API_KEY).trim();
  const YELP_KEY   = process.env.YELP_API_KEY!;

  const results: Record<string, unknown> = {};
  let websiteUrl: string | undefined;
  let address = "";

  // ── Source 1: Google Places v1 menuItems ──────────────────────────────────
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${PLACES_KEY}&languageCode=en`,
      { headers: { "X-Goog-FieldMask": "menuItems" }, signal: AbortSignal.timeout(6000) }
    );
    const d = await r.json();
    results.places_v1 = {
      ok: r.ok,
      status: r.status,
      menuItems_count: Array.isArray(d.menuItems) ? d.menuItems.length : 0,
      sample: Array.isArray(d.menuItems) ? d.menuItems.slice(0, 3).map((i: Record<string, unknown>) => (i as Record<string, {text?: string}>).displayName?.text) : [],
      error: d.error?.message ?? null,
    };
  } catch (e) {
    results.places_v1 = { error: String(e) };
  }

  // ── Source 2: Restaurant website schema.org + Menufy (2-hop) ───────────────
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_address&key=${API_KEY}`;
    const dr = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
    const dd = await dr.json();
    websiteUrl = dd.result?.website;
    address = dd.result?.formatted_address ?? "";
    results.website = { url: websiteUrl ?? null, menu_items: 0, sample: [] };

    if (websiteUrl) {
      const wr = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SeeFood/1.0)", Accept: "text/html" },
      });
      const html = await wr.text();
      const hasLdJson = html.includes("application/ld+json");
      const hasMenuItem = html.toLowerCase().includes("menuitem");
      const isMenufy = html.includes("api.menufy.com");
      (results.website as Record<string, unknown>).html_length = html.length;
      (results.website as Record<string, unknown>).has_ld_json = hasLdJson;
      (results.website as Record<string, unknown>).has_menu_item = hasMenuItem;
      (results.website as Record<string, unknown>).is_menufy_direct = isMenufy;
      (results.website as Record<string, unknown>).website_ok = wr.ok;

      const parsed = await fetchMenuFromUrl(websiteUrl);
      (results.website as Record<string, unknown>).parsed_menu_items = parsed.length;
      (results.website as Record<string, unknown>).parsed_sample = parsed.slice(0, 3).map((i) => i.name);
    }
  } catch (e) {
    results.website = { error: String(e) };
  }

  // ── Source 3: Yelp ─────────────────────────────────────────────────────────
  try {
    const searchUrl = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(name)}&latitude=${lat}&longitude=${lng}&limit=1&categories=restaurants,food`;
    const yr = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${YELP_KEY}` },
      signal: AbortSignal.timeout(6000),
    });
    const yd = await yr.json();
    const bizId = yd.businesses?.[0]?.id ?? null;
    results.yelp = {
      search_ok: yr.ok,
      search_status: yr.status,
      business_found: !!bizId,
      business_id: bizId,
      business_name: yd.businesses?.[0]?.name ?? null,
      error: yd.error?.description ?? null,
    };
  } catch (e) {
    results.yelp = { error: String(e) };
  }

  // ── Source 4: DoorDash ──────────────────────────────────────────────────────
  try {
    const items = await fetchMenuFromDoorDash(name, address, lat, lng);
    results.doordash = {
      ok: items.length > 0,
      item_count: items.length,
      sample: items.slice(0, 3).map((i) => i.name),
      scrapfly_configured: !!process.env.SCRAPFLY_KEY,
    };
  } catch (e) {
    results.doordash = { error: String(e) };
  }

  // ── Source 5: Grubhub ────────────────────────────────────────────────────────
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

  // ── Source 6: Menufy (explicit, via website + 2-hop follower) ───────────────
  // Surfaced separately from `website` for clarity, since Menufy detection lives
  // inside fetchMenuFromUrl but is a distinct source for scoreboard purposes.
  results.menufy = {
    detected: (results.website as Record<string, unknown>)?.is_menufy_direct ?? false,
    item_count: (results.website as Record<string, unknown>)?.parsed_menu_items ?? 0,
    note: "Menufy items are surfaced via the `website` source above (2-hop link follower included); duplicated here for scoreboard visibility.",
  };

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
