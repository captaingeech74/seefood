import { NextRequest, NextResponse } from "next/server";
import { findNearbyRestaurant, getRestaurantDetails } from "@/lib/google";
import { getSlugForPlaceId, getTestFixtureNameOverride } from "@/lib/db";

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

    const fixtureName = await getTestFixtureNameOverride(restaurant.placeId ?? restaurant.id).catch(() => null);
    const name = fixtureName ?? restaurant.name;

    const slug = await getSlugForPlaceId(
      restaurant.placeId ?? restaurant.id,
      name,
      restaurant.address
    ).catch(() => undefined);

    return NextResponse.json({ ...restaurant, name, slug });
  } catch (e) {
    console.error("Restaurant API error:", e);
    return NextResponse.json(
      { error: "Failed to find restaurant" },
      { status: 500 }
    );
  }
}
