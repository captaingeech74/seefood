import { NextRequest, NextResponse } from "next/server";
import { findNearbyRestaurant, getRestaurantDetails } from "@/lib/google";
import { getSlugForPlaceId } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const placeId = searchParams.get("placeId");

  try {
    let restaurant;

    if (placeId) {
      restaurant = await getRestaurantDetails(placeId);
    } else if (lat && lng) {
      restaurant = await findNearbyRestaurant(
        parseFloat(lat),
        parseFloat(lng)
      );
    } else {
      return NextResponse.json(
        { error: "Provide lat/lng or placeId" },
        { status: 400 }
      );
    }

    if (!restaurant) {
      return NextResponse.json(
        { error: "No restaurant found nearby" },
        { status: 404 }
      );
    }

    const slug = await getSlugForPlaceId(
      restaurant.placeId ?? restaurant.id,
      restaurant.name,
      restaurant.address
    ).catch(() => undefined);

    return NextResponse.json({ ...restaurant, slug });
  } catch (e) {
    console.error("Restaurant API error:", e);
    return NextResponse.json(
      { error: "Failed to find restaurant" },
      { status: 500 }
    );
  }
}
