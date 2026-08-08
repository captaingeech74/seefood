"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { MapPickerProps } from "@/components/MapPicker";
import type { DishPhoto, Restaurant } from "@/lib/types";
import { formatAddress } from "@/lib/labels";

type SearchRestaurant = Restaurant & { distanceKm?: number };
type GeocoderResult = { id: string; label: string; lat: number; lng: number; type?: string };
type MapPreview = { topPhoto: DishPhoto; dishes: DishPhoto[]; totalDishCount: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export default function OpenMapPicker({
  lat,
  lng,
  initialView,
  onViewChange,
  onSelectRestaurant,
  onClose,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const requestRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [restaurants, setRestaurants] = useState<SearchRestaurant[]>([]);
  const [previews, setPreviews] = useState<Record<string, MapPreview>>({});
  const [selected, setSelected] = useState<SearchRestaurant | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchRestaurant[]>([]);
  const [placeResults, setPlaceResults] = useState<GeocoderResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [mapError, setMapError] = useState(false);

  const loadPreviews = useCallback(async (rows: SearchRestaurant[]) => {
    if (!rows.length) return;
    try {
      const response = await fetch("/api/map-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurants: rows.map((restaurant) => ({
            placeId: restaurant.placeId || restaurant.id,
            name: restaurant.name,
            address: restaurant.address,
            lat: restaurant.lat,
            lng: restaurant.lng,
          })),
        }),
      });
      if (response.ok) {
        const payload = await response.json() as Record<string, MapPreview>;
        setPreviews((current) => ({ ...current, ...payload }));
      }
    } catch {
      // Photo previews improve the pins, but are not required for map search.
    }
  }, []);

  const loadViewport = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    const request = ++requestRef.current;
    setShowSearchArea(false);
    try {
      const response = await fetch(`/api/restaurants/search?bbox=${encodeURIComponent(bbox)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { restaurants?: SearchRestaurant[] };
      if (request !== requestRef.current) return;
      const rows = payload.restaurants ?? [];
      setRestaurants(rows);
      void loadPreviews(rows);
    } catch {
      // Keep the existing pins if a viewport refresh briefly fails.
    }
  }, [loadPreviews]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    void import("maplibre-gl").then((maplibre) => {
      if (disposed || !containerRef.current) return;
      const start = initialView ?? { lat, lng, zoom: 14 };
      const map = new maplibre.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [start.lng, start.lat],
        zoom: start.zoom,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", () => {
        setReady(true);
        void loadViewport();
      });
      map.on("moveend", () => {
        const center = map.getCenter();
        onViewChange?.({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
        setShowSearchArea(true);
      });
      map.on("error", (event) => {
        if (event.error) setMapError(true);
      });
      mapRef.current = map;
    }).catch(() => setMapError(true));

    return () => {
      disposed = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialView, lat, lng, loadViewport, onViewChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    void import("maplibre-gl").then(({ Marker: MapMarker }) => {
      if (map !== mapRef.current) return;
      markersRef.current = restaurants.map((restaurant) => {
        const id = restaurant.placeId || restaurant.id;
        const preview = previews[id];
        const element = document.createElement("button");
        element.type = "button";
        element.className = `open-map-pin${selected?.id === restaurant.id ? " open-map-pin--selected" : ""}`;
        element.setAttribute("aria-label", restaurant.name);
        if (preview?.topPhoto.url) {
          element.style.backgroundImage = `url(${JSON.stringify(preview.topPhoto.url).slice(1, -1)})`;
        }
        element.addEventListener("click", () => setSelected(restaurant));
        return new MapMarker({ element, anchor: "bottom" })
          .setLngLat([restaurant.lng, restaurant.lat])
          .addTo(map);
      });
    });
  }, [previews, ready, restaurants, selected?.id]);

  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setPlaceResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const center = mapRef.current?.getCenter();
      const focus = center ? `&lat=${center.lat}&lng=${center.lng}` : "";
      try {
        const [restaurantsResponse, placesResponse] = await Promise.all([
          fetch(`/api/restaurants/search?q=${encodeURIComponent(query)}${focus}`, { signal: controller.signal }),
          fetch(`/api/geocode/search?text=${encodeURIComponent(query)}${focus}`, { signal: controller.signal }),
        ]);
        if (restaurantsResponse.ok) {
          const payload = await restaurantsResponse.json();
          setSearchResults(payload.restaurants ?? []);
        }
        if (placesResponse.ok) {
          const payload = await placesResponse.json();
          setPlaceResults(payload.results ?? []);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchResults([]);
          setPlaceResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchText]);

  const chooseRestaurant = (restaurant: SearchRestaurant) => {
    setSelected(restaurant);
    setSearchText("");
    setSearchResults([]);
    setPlaceResults([]);
    mapRef.current?.flyTo({ center: [restaurant.lng, restaurant.lat], zoom: 16 });
  };

  const choosePlace = (place: GeocoderResult) => {
    setSearchText("");
    setSearchResults([]);
    setPlaceResults([]);
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 14 });
    window.setTimeout(() => void loadViewport(), 800);
  };

  const selectedId = selected ? selected.placeId || selected.id : "";
  const selectedPreview = selected ? previews[selectedId] : undefined;

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-white overflow-hidden">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none">
        <div className="max-w-2xl mx-auto flex gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-12 shrink-0 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 text-xl shadow-lg"
            aria-label="Close map"
          >
            ←
          </button>
          <div className="relative flex-1">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Restaurant, address, or neighborhood"
              className="w-full h-12 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 px-4 pr-10 text-[15px] outline-none focus:border-orange-400/70 shadow-lg"
              autoComplete="off"
            />
            {searching && <span className="absolute right-4 top-3.5 text-white/45 animate-pulse">•••</span>}
            {(searchResults.length > 0 || placeResults.length > 0) && (
              <div className="absolute top-14 left-0 right-0 rounded-2xl bg-[#161616]/95 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl max-h-[55vh] overflow-y-auto">
                {searchResults.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    type="button"
                    onClick={() => chooseRestaurant(restaurant)}
                    className="w-full px-4 py-3 text-left border-b border-white/7 hover:bg-white/5"
                  >
                    <span className="block font-semibold text-[14px]">{restaurant.name}</span>
                    <span className="block text-white/45 text-[12px] truncate">{formatAddress(restaurant.address)}</span>
                  </button>
                ))}
                {placeResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => choosePlace(place)}
                    className="w-full px-4 py-3 text-left border-b border-white/7 hover:bg-white/5"
                  >
                    <span className="block text-[10px] uppercase tracking-wider text-orange-300/80 mb-0.5">Move map</span>
                    <span className="block font-medium text-[13px]">{place.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSearchArea && ready && (
        <button
          type="button"
          onClick={() => void loadViewport()}
          className="absolute z-10 top-20 left-1/2 -translate-x-1/2 rounded-full bg-black/80 backdrop-blur-lg border border-white/15 px-4 py-2 text-[12px] font-semibold shadow-xl"
        >
          Search this area
        </button>
      )}

      {mapError && (
        <div className="absolute inset-x-4 top-24 z-20 mx-auto max-w-md rounded-2xl bg-red-950/90 border border-red-400/30 p-4 text-sm">
          The open map could not load. Close it and use SeeFood’s regular search.
        </div>
      )}

      {ready && restaurants.length === 0 && !selected && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/75 backdrop-blur-lg px-4 py-2 text-white/60 text-[12px] whitespace-nowrap">
          No SeeFood restaurants in this view yet
        </div>
      )}

      {selected && (
        <div className="absolute z-20 bottom-0 left-0 right-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="max-w-xl mx-auto rounded-3xl bg-[#111]/95 backdrop-blur-2xl border border-white/10 p-4 shadow-2xl">
            <div className="flex gap-3">
              {selectedPreview?.topPhoto.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedPreview.topPhoto.url} alt="" className="w-20 h-20 rounded-2xl object-cover bg-white/5" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">🍽️</div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-[17px] truncate">{selected.name}</h2>
                <p className="text-white/45 text-[12px] line-clamp-2 mt-1">{formatAddress(selected.address)}</p>
                <p className="text-orange-300/80 text-[11px] mt-1.5">
                  {selectedPreview ? `${selectedPreview.totalDishCount} dish photo${selectedPreview.totalDishCount === 1 ? "" : "s"}` : "Restaurant found"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectRestaurant(selectedId, selected.name)}
              className="mt-3 w-full rounded-2xl bg-[var(--accent)] py-3.5 font-bold text-[14px] active:scale-[0.99] transition-transform"
            >
              See this restaurant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
