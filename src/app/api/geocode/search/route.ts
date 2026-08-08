import { NextRequest, NextResponse } from "next/server";
import { searchPelias } from "@/lib/geocoder";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") ?? "").trim().slice(0, 120);
  if (text.length < 2) return NextResponse.json({ available: Boolean(process.env.PELIAS_URL), results: [] });

  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const focus = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  try {
    const result = await searchPelias(text, focus);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[geocode/search] Pelias lookup failed", error);
    return NextResponse.json({ available: true, results: [] });
  }
}
