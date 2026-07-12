"use client";

import { useState, useEffect, useCallback } from "react";
import { Restaurant, DishPhoto } from "@/lib/types";
import RestaurantHeader from "@/components/RestaurantHeader";
import TopDishesGrid from "@/components/TopDishesGrid";
import Reveal from "@/components/Reveal";
import PopularDishes from "@/components/PopularDishes";
import MapPicker, { MapView } from "@/components/MapPicker";
import LoadingScreen from "@/components/LoadingScreen";

type AppState =
  | "locating"
  | "loading_restaurant"
  | "loading_dishes"
  | "ready"
  | "map_open"
  | "error";

/**
 * Core app shell (PRD §4.1–§4.3). Two entry points share this: the GPS-first
 * home route (`/`, no props) and a stable shared restaurant link
 * (`/r/[slug]`, `initialPlaceId` set) — same landing experience either way,
 * just skipping the geolocation step when we already know the restaurant.
 */
export default function SeeFoodApp({ initialPlaceId }: { initialPlaceId?: string }) {
  const [state, setState] = useState<AppState>(initialPlaceId ? "loading_restaurant" : "locating");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<DishPhoto[]>([]);
  const [popularDishes, setPopularDishes] = useState<string[]>([]);
  const [userLat, setUserLat] = useState<number>(0);
  const [userLng, setUserLng] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [dishesLoading, setDishesLoading] = useState(false);
  // True once the stage-2 (Gemini-labeled) result has landed — gates whether
  // TopDishesGrid shows the flat streaming view or the real hero/tier layout.
  const [dishesFinal, setDishesFinal] = useState(false);
  const [reveal, setReveal] = useState<{ list: DishPhoto[]; index: number } | null>(null);
  // Preserves map pan/zoom across opens (PRD §4.4 "back preserves map position") —
  // only used on re-open, not the first cold explore entry, which centers fresh.
  const [lastMapView, setLastMapView] = useState<MapView | null>(null);

  const fetchDishes = useCallback(async (r: Restaurant) => {
    setDishesLoading(true);
    setDishesFinal(false);
    setDishes([]);
    setPopularDishes([]);
    window.scrollTo({ top: 0, behavior: "instant" });
    try {
      const params = new URLSearchParams({
        placeId: r.placeId || r.id,
        name: r.name,
        lat: String(r.lat),
        lng: String(r.lng),
        address: r.address || "",
      });
      const res = await fetch(`/api/dishes?${params}`);
      if (!res.body) throw new Error("No response body");

      // Server streams newline-delimited JSON: raw unlabeled photos first (no
      // blocking skeleton — PRD §4.5), then the final Gemini-labeled result.
      // `chunk.done` distinguishes the two — the grid renders a flat,
      // unfiltered stream during stage 1 (nothing is confidently tiered yet,
      // so hiding anything behind "More photos" would just look broken) and
      // switches to the real hero/tier layout once stage 2 lands.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let first = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          setDishes(chunk.dishes ?? []);
          if (chunk.popularDishes) setPopularDishes(chunk.popularDishes);
          if (chunk.done) setDishesFinal(true);
          if (first) {
            setState("ready");
            setDishesLoading(false);
            first = false;
          }
        }
      }
    } catch {
      setDishes([]);
      setDishesFinal(true);
    } finally {
      setDishesLoading(false);
      setDishesFinal(true);
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
        setUserLat((prev) => prev || data.lat);
        setUserLng((prev) => prev || data.lng);
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
    if (initialPlaceId) {
      fetchRestaurantByPlaceId(initialPlaceId);
      return;
    }

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
    // Only run once on mount — initialPlaceId/fetchRestaurant/fetchRestaurantByPlaceId
    // are stable for the lifetime of this decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="fixed inset-0 bg-[var(--surface-0)] flex flex-col items-center justify-center px-6 text-center fade-in">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 text-3xl"
          style={{ background: "var(--surface-2)" }}
        >
          {isLocationDenied ? "📍" : "🔍"}
        </div>
        <p className="text-white/85 text-[16px] font-semibold mb-1.5 max-w-xs">{error}</p>
        {isLocationDenied ? (
          <p className="text-white/40 text-[13px] mb-7 max-w-xs leading-relaxed">
            No worries — search manually below to find any restaurant.
          </p>
        ) : (
          <p className="text-white/40 text-[13px] mb-7 max-w-xs leading-relaxed">
            Try searching for a restaurant manually.
          </p>
        )}
        <button
          onClick={() => setState("map_open")}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-8 py-3.5 rounded-2xl font-bold text-[14px] active:scale-95 transition-all shadow-lg shadow-orange-500/20"
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
        initialView={lastMapView}
        onViewChange={setLastMapView}
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

      <TopDishesGrid
        dishes={dishes}
        loading={state === "loading_dishes" || dishesLoading}
        finalized={dishesFinal}
        onOpenReveal={(list, index) => setReveal({ list, index })}
      />

      {reveal && restaurant && (
        <Reveal
          photos={reveal.list}
          startIndex={reveal.index}
          restaurant={restaurant}
          onClose={(lastIndex) => {
            const dishId = reveal.list[lastIndex]?.id;
            setReveal(null);
            if (dishId) {
              requestAnimationFrame(() => {
                document
                  .querySelector(`[data-dish-id="${dishId}"]`)
                  ?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
              });
            }
          }}
        />
      )}
    </main>
  );
}
