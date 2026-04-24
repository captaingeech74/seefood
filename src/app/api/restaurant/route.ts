import { NextRequest, NextResponse } from "next/server";
import { findNearbyRestaurant, getRestaurantDetails } from "@/lib/google";
import { findYelpBusiness } from "@/lib/yelp";

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

    // Try to find matching Yelp business
    const yelpId = await findYelpBusiness(
      restaurant.name,
      restaurant.lat,
      restaurant.lng
    );
    if (yelpId) {
      restaurant.yelpId = yelpId;
    }

    return NextResponse.json(restaurant);
  } catch (e) {
    console.error("Restaurant API error:", e);
    return NextResponse.json(
      { error: "Failed to find restaurant" },
      { status: 500 }
    );
  }
}
