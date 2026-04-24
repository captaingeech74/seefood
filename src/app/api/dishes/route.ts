import { NextRequest, NextResponse } from "next/server";
import { getGooglePhotosAndReviews } from "@/lib/google";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    const { photos, popularDishes } = await getGooglePhotosAndReviews(placeId);

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
