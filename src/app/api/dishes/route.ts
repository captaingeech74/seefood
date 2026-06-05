import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getGooglePhotosAndReviews } from "@/lib/google";

// Gemini analysis of 20 photos in parallel can take up to ~30s.
// Vercel paid plan allows up to 300s; we set a comfortable ceiling.
export const maxDuration = 60;

// ── Response cache ─────────────────────────────────────────────────────────────
// Cache full pipeline results by placeId for 24 hours.
// Uses Next.js / Vercel Data Cache — completely free, built-in.
// On a warm cache hit, a 20–40s API+Gemini round-trip becomes a sub-100ms read.
const getCachedDishes = unstable_cache(
  async (placeId: string, restaurantName: string) =>
    getGooglePhotosAndReviews(placeId, restaurantName),
  ["restaurant-dishes"],
  { revalidate: 86400 } // 24 hours
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");
  const restaurantName = searchParams.get("name") ?? "";

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    const { photos, popularDishes } = await getCachedDishes(placeId, restaurantName);

    return NextResponse.json({
      dishes: photos.slice(0, 20),
      popularDishes,
    });
  } catch (e) {
    console.error("Dishes API error:", e);
    return NextResponse.json(
      { error: "Failed to fetch dish photos" },
      { status: 500 }
    );
  }
}
