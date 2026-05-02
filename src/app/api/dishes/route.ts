import { NextRequest, NextResponse } from "next/server";
import { getGooglePhotosAndReviews } from "@/lib/google";

// Gemini analysis of 20 photos in parallel can take up to ~30s.
// Vercel paid plan allows up to 300s; we set a comfortable ceiling.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");
  const restaurantName = searchParams.get("name") ?? "";

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    const { photos, popularDishes } = await getGooglePhotosAndReviews(
      placeId,
      restaurantName
    );

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
