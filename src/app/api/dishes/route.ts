import { NextRequest, NextResponse } from "next/server";
import { getGooglePhotosAndReviews } from "@/lib/google";
import { getCorpusSnapshot, persistPipelineResult } from "@/lib/db";

// Gemini analysis of up to 10 images in one batched call, plus source fetches,
// can take up to ~30s on a cold miss. Vercel paid plan allows up to 300s.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");
  const restaurantName = searchParams.get("name") ?? "";
  const lat = parseFloat(searchParams.get("lat") ?? "0");
  const lng = parseFloat(searchParams.get("lng") ?? "0");
  const address = searchParams.get("address") ?? "";

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    // ── Corpus-first: a fresh hit means zero external API calls ───────────────
    const corpus = await getCorpusSnapshot(placeId).catch(() => null);
    if (corpus?.isFresh) {
      return NextResponse.json({
        dishes: corpus.photos.slice(0, 20),
        popularDishes: corpus.popularDishes,
      });
    }

    // Corpus miss or stale — run the live pipeline, then persist everything
    // learned before responding. Vercel serverless functions stop executing the
    // moment a response is returned (no background work survives past that
    // without an explicit waitUntil), so this must be awaited, not fire-and-forget.
    const { photos, popularDishes, menuItems } = await getGooglePhotosAndReviews(
      placeId,
      restaurantName
    );

    await persistPipelineResult({
      placeId,
      restaurantName,
      lat,
      lng,
      address,
      photos,
      menuItems,
    }).catch((e) => console.error("[corpus] persist failed:", e));

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
