"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { MapPickerProps } from "@/components/MapPicker";
import type { DishPhoto, Restaurant } from "@/lib/types";
import { formatAddress } from "@/lib/labels";
import { recoveryMapZoom, shouldClusterRestaurantPins } from "@/lib/restaurantPolicy";

type SearchRestaurant = Restaurant & { distanceKm?: number };
type GeocoderResult = { id: string; label: string; lat: number; lng: number; type?: string };
type MapPreview = { topPhoto: DishPhoto; dishes: DishPhoto[]; totalDishCount: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const EMPTY_CHOICES: Restaurant[] = [];

export default function OpenMapPicker({
  lat,
  lng,
  recoveryMode = false,
  initialView,
  initialChoices = EMPTY_CHOICES,
  onViewChange,
  onSelectRestaurant,
  onClose,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const requestRef = useRef(0);
  const recoveryZoomAdjustedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [restaurants, setRestaurants] = useState<SearchRestaurant[]>([]);
  const [previews, setPreviews] = useState<Record<string, MapPreview>>({});
  const [selected, setSelected] = useState<SearchRestaurant | null>(null);
  const [overlapChoices, setOverlapChoices] = useState<SearchRestaurant[]>([]);
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

  useEffect(() => {
    if (!recoveryMode || initialChoices.length < 2) return;
    const choices = [...initialChoices].sort((a, b) => a.name.localeCompare(b.name));
    setOverlapChoices(choices);
    setRestaurants((current) => {
      const seen = new Set(current.map((restaurant) => restaurant.id));
      return [...current, ...choices.filter((restaurant) => !seen.has(restaurant.id))];
    });
    void loadPreviews(choices.filter((restaurant) => restaurant.readiness !== "shell"));
  }, [initialChoices, loadPreviews, recoveryMode]);

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
      void loadPreviews(rows.filter((restaurant) => restaurant.readiness !== "shell").slice(0, 200));

      if (recoveryMode && !recoveryZoomAdjustedRef.current && rows.length > 1) {
        recoveryZoomAdjustedRef.current = true;
        const currentZoom = map.getZoom();
        const adjustedZoom = recoveryMapZoom(currentZoom, lat, rows);
        if (adjustedZoom > currentZoom + 0.1) {
          map.easeTo({ center: [lng, lat], zoom: adjustedZoom, duration: 550 });
        }
      }
    } catch {
      // Keep the existing pins if a viewport refresh briefly fails.
    }
  }, [lat, lng, loadPreviews, recoveryMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    void import("maplibre-gl").then((maplibre) => {
      if (disposed || !containerRef.current) return;
      const start = initialView ?? { lat, lng, zoom: recoveryMode ? 15 : 14 };
      const map = new maplibre.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [start.lng, start.lat],
        zoom: start.zoom,
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", () => {
        const userLocation = document.createElement("div");
        userLocation.className = "open-map-user-location";
        userLocation.setAttribute("aria-label", "Your location");
        userMarkerRef.current = new maplibre.Marker({ element: userLocation })
          .setLngLat([lng, lat])
          .addTo(map);
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
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialView, lat, lng, loadViewport, onViewChange, recoveryMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    void import("maplibre-gl").then(({ Marker: MapMarker }) => {
      if (map !== mapRef.current) return;
      const shouldCluster = shouldClusterRestaurantPins(restaurants.length);
      const markerGroups = new Map<string, SearchRestaurant[]>();
      for (const restaurant of restaurants) {
        const point = map.project([restaurant.lng, restaurant.lat]);
        const key = shouldCluster
          ? `${Math.floor(point.x / 62)}:${Math.floor(point.y / 62)}`
          // Even in an uncrowded viewport, multiple venues can share one
          // provider/GPS coordinate. This is universal to malls, airports,
          // food halls, resorts, and shared street addresses.
          : `venue:${restaurant.lat.toFixed(5)}:${restaurant.lng.toFixed(5)}`;
        markerGroups.set(key, [...(markerGroups.get(key) ?? []), restaurant]);
      }

      markersRef.current = [...markerGroups.values()].map((group) => {
        if (group.length > 1) {
          const center = group.reduce((current, restaurant) => ({
            lat: current.lat + restaurant.lat / group.length,
            lng: current.lng + restaurant.lng / group.length,
          }), { lat: 0, lng: 0 });
          const element = document.createElement("button");
          element.type = "button";
          element.className = "open-map-cluster";
          element.textContent = String(group.length);
          element.setAttribute("aria-label", `${group.length} restaurants at this location`);
          element.addEventListener("click", () => {
            const spread = group.reduce((max, restaurant) => Math.max(max,
              Math.hypot(restaurant.lat - center.lat, restaurant.lng - center.lng)), 0);
            if (spread < 0.00012 || map.getZoom() >= 17) {
              setOverlapChoices([...group].sort((a, b) => a.name.localeCompare(b.name)));
            } else {
              map.easeTo({ center: [center.lng, center.lat], zoom: Math.min(18, map.getZoom() + 2) });
            }
          });
          return new MapMarker({ element })
            .setLngLat([center.lng, center.lat])
            .addTo(map);
        }

        const restaurant = group[0];
        const id = restaurant.placeId || restaurant.id;
        const preview = previews[id];
        const element = document.createElement("button");
        element.type = "button";
        element.className = [
          "open-map-pin",
          restaurant.readiness === "shell" ? "open-map-pin--shell" : "",
          selected?.id === restaurant.id ? "open-map-pin--selected" : "",
        ].filter(Boolean).join(" ");
        element.setAttribute("aria-label", restaurant.name);
        if (preview?.topPhoto.url) {
          element.style.backgroundImage = `url(${JSON.stringify(preview.topPhoto.url).slice(1, -1)})`;
        }
        element.addEventListener("click", () => setSelected(restaurant));
        if (!recoveryMode) {
          return new MapMarker({ element, anchor: "bottom" })
            .setLngLat([restaurant.lng, restaurant.lat])
            .addTo(map);
        }

        const labeledMarker = document.createElement("div");
        labeledMarker.className = "open-map-labeled-marker";
        labeledMarker.addEventListener("click", () => setSelected(restaurant));
        const label = document.createElement("span");
        label.className = "open-map-pin-label";
        label.textContent = restaurant.name;
        labeledMarker.append(label, element);
        return new MapMarker({ element: labeledMarker, anchor: "bottom" })
          .setLngLat([restaurant.lng, restaurant.lat])
          .addTo(map);
      });
    });
  }, [previews, ready, recoveryMode, restaurants, selected?.id]);

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
    setOverlapChoices([]);
    setSelected(restaurant);
    // Text search can select a restaurant outside the current viewport. Load
    // its corpus preview directly so newly added (including honestly unnamed)
    // food photos appear in the selection card before opening the page.
    void loadPreviews([restaurant]);
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

      {recoveryMode && !selected && overlapChoices.length === 0 && restaurants.length > 0 && (
        <div
          className="absolute z-10 inset-x-0 bottom-0 px-4 pt-12 pb-[max(22px,env(safe-area-inset-bottom))] pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(10,10,10,0.98) 0%, rgba(10,10,10,0.78) 68%, transparent 100%)" }}
        >
          <h1 className="mx-auto max-w-xl text-center text-[25px] font-bold tracking-[-0.03em]">
            Where would you like to See Food?
          </h1>
        </div>
      )}

      {overlapChoices.length > 0 && !selected && (
        <div className="absolute z-20 bottom-0 left-0 right-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="max-w-xl mx-auto rounded-3xl bg-[#111]/95 backdrop-blur-2xl border border-white/10 p-4 shadow-2xl max-h-[48vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="font-bold text-[17px]">Which restaurant are you in?</h2>
              <button type="button" onClick={() => setOverlapChoices([])} className="text-white/55 px-2 py-1" aria-label="Close choices">✕</button>
            </div>
            <p className="text-white/45 text-[12px] mb-3">Your location could match more than one nearby restaurant.</p>
            {overlapChoices.map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => setSelected(restaurant)}
                className="w-full text-left px-3 py-3 rounded-xl border-t border-white/8 hover:bg-white/5"
              >
                <span className="block font-semibold text-[14px]">{restaurant.name}</span>
                <span className="block text-white/45 text-[11px] mt-0.5">
                  {restaurant.readiness === "shell" ? "Restaurant found · photos needed" : "Menu or food photos available"}
                </span>
              </button>
            ))}
          </div>
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
                  {selected.readiness === "shell"
                    ? "Needs its first dish photo"
                    : selectedPreview
                      ? `${selectedPreview.totalDishCount} dish photo${selectedPreview.totalDishCount === 1 ? "" : "s"}`
                      : selected.menuItemCount
                        ? `Menu found · photos needed`
                        : "Restaurant found"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectRestaurant(selectedId, selected.name)}
              className="mt-3 w-full rounded-2xl bg-[var(--accent)] py-3.5 font-bold text-[14px] active:scale-[0.99] transition-transform"
            >
              {selected.readiness === "shell" ? "Open & help build it" : "See this restaurant"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
