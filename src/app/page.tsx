"use client";

import { useState, useEffect, useCallback } from "react";
import { Restaurant, DishPhoto } from "@/lib/types";
import RestaurantHeader from "@/components/RestaurantHeader";
import DishGallery from "@/components/DishGallery";
import PopularDishes from "@/components/PopularDishes";
import MapPicker from "@/components/MapPicker";
import LoadingScreen from "@/components/LoadingScreen";

type AppState =
  | "locating"
  | "loading_restaurant"
  | "loading_dishes"
  | "ready"
  | "map_open"
  | "error";

export default function Home() {
  const [state, setState] = useState<AppState>("locating");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<DishPhoto[]>([]);
  const [popularDishes, setPopularDishes] = useState<string[]>([]);
  const [userLat, setUserLat] = useState<number>(0);
  const [userLng, setUserLng] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [dishesLoading, setDishesLoading] = useState(false);

  const fetchDishes = useCallback(async (r: Restaurant) => {
    setDishesLoading(true);
    setDishes([]);
    setPopularDishes([]);
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      const params = new URLSearchParams({ placeId: r.placeId || r.id });
      const res = await fetch(`/api/dishes?${params}`);
      const data = await res.json();
      setDishes(data.dishes || []);
      setPopularDishes(data.popularDishes || []);
    } catch {
      setDishes([]);
    } finally {
      setDishesLoading(false);
      setState("ready");
    }
  }, []);

  const fetchRestaurant = useCallback(
    async (lat: number, lng: number) => {
      setState("loading_restaurant");
      try {
        const res = await fetch(`/api/restaurant?lat=${lat}&lng=${lng}`);
        if (!res.ok) throw new Error("No restaurant found");
        const data: Restaurant = await res.json();
        setRestaurant(data);
        setState("loading_dishes");
        await fetchDishes(data);
      } catch {
        setError("Could not find a restaurant near you.");
        setState("error");
      }
    },
    [fetchDishes]
  );

  const fetchRestaurantByPlaceId = useCallback(
    async (placeId: string) => {
      setState("loading_restaurant");
      try {
        const res = await fetch(`/api/restaurant?placeId=${placeId}`);
        if (!res.ok) throw new Error("Not found");
        const data: Restaurant = await res.json();
        setRestaurant(data);
        setState("loading_dishes");
        await fetchDishes(data);
      } catch {
        setError("Could not load that restaurant.");
        setState("error");
      }
    },
    [fetchDishes]
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setState("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLat(latitude);
        setUserLng(longitude);
        fetchRestaurant(latitude, longitude);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location access denied. Please enable location and refresh."
            : "Could not determine your location."
        );
        setState("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [fetchRestaurant]);

  const handleSelectRestaurant = useCallback(
    (placeId: string, _name: string) => {
      fetchRestaurantByPlaceId(placeId);
    },
    [fetchRestaurantByPlaceId]
  );

  if (state === "locating") {
    return <LoadingScreen message="Finding your location..." />;
  }

  if (state === "loading_restaurant") {
    return <LoadingScreen message="Finding your restaurant..." />;
  }

  if (state === "error") {
    const isLocationDenied = error.toLowerCase().includes("denied");
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">{isLocationDenied ? "📍" : "😕"}</div>
        <p className="text-white/70 text-base mb-2 max-w-xs">{error}</p>
        {isLocationDenied && (
          <p className="text-white/35 text-sm mb-6 max-w-xs">
            You can still search manually below.
          </p>
        )}
        {!isLocationDenied && <div className="mb-6" />}
        <button
          onClick={() => setState("map_open")}
          className="bg-[#ff6b35] text-white px-8 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
        >
          Search for a Restaurant
        </button>
      </div>
    );
  }

  if (state === "map_open") {
    return (
      <MapPicker
        lat={userLat || 37.7749}
        lng={userLng || -122.4194}
        onSelectRestaurant={handleSelectRestaurant}
        onClose={() => setState(restaurant ? "ready" : "error")}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] max-w-3xl mx-auto">
      <RestaurantHeader
        restaurant={restaurant}
        onChangeRestaurant={() => setState("map_open")}
      />

      {!dishesLoading && <PopularDishes dishes={popularDishes} />}

      <DishGallery dishes={dishes} loading={state === "loading_dishes" || dishesLoading} />
    </main>
  );
}
