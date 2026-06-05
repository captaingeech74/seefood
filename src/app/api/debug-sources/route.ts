/**
 * Diagnostic endpoint — tests all 4 menu data sources for a given restaurant.
 * Usage: GET /api/debug-sources?placeId=ChIJ...&name=...&lat=37.77&lng=-122.42
 *
 * NOT cached — always runs fresh for debugging.
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId") ?? "";
  const name    = searchParams.get("name") ?? "";
  const lat     = parseFloat(searchParams.get("lat") ?? "0");
  const lng     = parseFloat(searchParams.get("lng") ?? "0");

  const API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
  const YELP_KEY = process.env.YELP_API_KEY!;

  const results: Record<string, unknown> = {};

  // ── Source 1: Google Places v1 menuItems ──────────────────────────────────
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${API_KEY}&languageCode=en`,
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

  // ── Source 2: Restaurant website schema.org ────────────────────────────────
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website&key=${API_KEY}`;
    const dr = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
    const dd = await dr.json();
    const websiteUrl = dd.result?.website;
    results.website = { url: websiteUrl ?? null, menu_items: 0, sample: [] };

    if (websiteUrl) {
      const wr = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SeeFood/1.0)", Accept: "text/html" },
      });
      const html = await wr.text();
      const hasLdJson = html.includes("application/ld+json");
      const hasMenuItem = html.toLowerCase().includes("menuitem");
      (results.website as Record<string, unknown>).html_length = html.length;
      (results.website as Record<string, unknown>).has_ld_json = hasLdJson;
      (results.website as Record<string, unknown>).has_menu_item = hasMenuItem;
      (results.website as Record<string, unknown>).website_ok = wr.ok;
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

    if (bizId) {
      const br = await fetch(`https://api.yelp.com/v3/businesses/${bizId}`, {
        headers: { Authorization: `Bearer ${YELP_KEY}` },
        signal: AbortSignal.timeout(6000),
      });
      const bd = await br.json();
      (results.yelp as Record<string, unknown>).photos = bd.photos ?? [];
      (results.yelp as Record<string, unknown>).menu_url = bd.attributes?.menu_url ?? null;
      (results.yelp as Record<string, unknown>).biz_ok = br.ok;
    }
  } catch (e) {
    results.yelp = { error: String(e) };
  }

  // ── Source 4: DoorDash direct ─────────────────────────────────────────────
  if (lat && lng) {
    try {
      const q = encodeURIComponent(name);
      const dr = await fetch(`https://www.doordash.com/search/?q=${q}`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await dr.text();
      const slugs = [...new Set(
        [...html.matchAll(/["'](\/store\/([a-z0-9][a-z0-9-]{3,70})\/)/gi)].map(m => m[2])
      )].filter(s => !["pickup","search","home","dasher"].some(x => s.startsWith(x)));

      results.doordash_direct = {
        ok: dr.ok,
        status: dr.status,
        html_length: html.length,
        has_next_data: html.includes("__NEXT_DATA__"),
        cloudflare_blocked: html.includes("cf-browser-verification") || html.includes("Checking your browser"),
        store_slugs: slugs.slice(0, 10),
        slug_count: slugs.length,
        // Sample of the raw html start for debugging
        html_preview: html.substring(0, 300).replace(/\n/g, ' '),
      };
    } catch (e) {
      results.doordash_direct = { error: String(e) };
    }
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
