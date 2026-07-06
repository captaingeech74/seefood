import { NextRequest } from "next/server";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY!.trim();

// Proxies Google Places photo bytes so GOOGLE_MAPS_API_KEY never reaches the browser.
// Client requests /api/photo?ref=<photo_reference>&maxwidth=800 instead of the raw
// maps.googleapis.com URL with an embedded key.
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  const maxwidth = req.nextUrl.searchParams.get("maxwidth") || "800";
  if (!ref) return new Response("Missing ref", { status: 400 });

  const upstream = await fetch(
    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photo_reference=${encodeURIComponent(ref)}&key=${API_KEY}`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("Photo fetch failed", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
