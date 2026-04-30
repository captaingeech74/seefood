"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface MapPickerProps {
  lat: number;
  lng: number;
  onSelectRestaurant: (placeId: string, name: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    google: typeof google;
    initMapPicker: () => void;
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export default function MapPicker({
  lat,
  lng,
  onSelectRestaurant,
  onClose,
}: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  }, []);

  const addRestaurantMarker = useCallback(
    (
      mapInstance: google.maps.Map,
      place: {
        name?: string;
        place_id?: string;
        vicinity?: string;
        formatted_address?: string;
        geometry?: { location?: google.maps.LatLng };
      }
    ) => {
      if (!place.geometry?.location) return null;

      const marker = new window.google.maps.Marker({
        map: mapInstance,
        title: place.name,
        position: place.geometry.location,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#ff6b35",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 9,
        },
        animation: window.google.maps.Animation.DROP,
      });

      const safeName = escapeHtml(place.name || "Restaurant");
      const safeAddr = escapeHtml(place.vicinity || place.formatted_address || "");
      const placeId = place.place_id || "";

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="color:#111;padding:6px 4px;font-family:-apple-system,sans-serif;min-width:180px;max-width:220px;">
            <strong style="font-size:14px;line-height:1.3;display:block;margin-bottom:2px;">${safeName}</strong>
            ${safeAddr ? `<span style="color:#666;font-size:12px;">${safeAddr}</span>` : ""}
            <button
              data-place-id="${placeId}"
              data-place-name="${safeName}"
              class="seefood-select-btn"
              style="margin-top:10px;background:#ff6b35;color:white;border:none;padding:9px 0;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px;width:100%;letter-spacing:0.01em;"
            >
              See Dishes →
            </button>
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindow.open(mapInstance, marker);
      });

      markersRef.current.push(marker);
      return marker;
    },
    []
  );

  // Search for restaurants at the current map center/bounds
  const searchCurrentArea = useCallback(
    (mapInstance: google.maps.Map) => {
      setSearching(true);
      setShowSearchHere(false);
      clearMarkers();

      const center = mapInstance.getCenter();
      if (!center) {
        setSearching(false);
        return;
      }

      // Derive a search radius from the current zoom level
      const zoom = mapInstance.getZoom() ?? 14;
      const radius = Math.min(50000, Math.round(40000 / Math.pow(2, zoom - 10)));

      const service = new window.google.maps.places.PlacesService(mapInstance);
      service.nearbySearch(
        {
          location: center,
          radius: Math.max(300, radius),
          type: "restaurant",
        },
        (results, status) => {
          setSearching(false);
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !results
          )
            return;
          results.slice(0, 20).forEach((place) => {
            addRestaurantMarker(mapInstance, place);
          });
        }
      );
    },
    [clearMarkers, addRestaurantMarker]
  );

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    const mapInstance = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 16,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#2a2a3e" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0e0e1a" }],
        },
        {
          featureType: "poi.business",
          elementType: "labels",
          stylers: [{ visibility: "on" }],
        },
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    mapInstanceRef.current = mapInstance;

    // Show "Search this area" button after user pans or zooms
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    let firstIdle = true;

    mapInstance.addListener("idle", () => {
      if (firstIdle) {
        firstIdle = false;
        // Initial load — just do the automatic nearby search
        searchCurrentArea(mapInstance);
        return;
      }
      // Subsequent idles (after user pan/zoom) — show the button
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => setShowSearchHere(true), 300);
    });

    // Search box
    if (searchRef.current) {
      const searchBox = new window.google.maps.places.SearchBox(
        searchRef.current
      );

      mapInstance.addListener("bounds_changed", () => {
        searchBox.setBounds(
          mapInstance.getBounds() as google.maps.LatLngBounds
        );
      });

      searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (!places || places.length === 0) return;

        clearMarkers();
        setShowSearchHere(false);
        const bounds = new window.google.maps.LatLngBounds();

        places.forEach((place) => {
          addRestaurantMarker(mapInstance, place);
          if (place.geometry?.location) {
            bounds.extend(place.geometry.location);
          }
        });

        mapInstance.fitBounds(bounds);
        // After navigating to a searched place, trigger a restaurant search there
        setTimeout(() => searchCurrentArea(mapInstance), 800);
      });
    }

    setReady(true);
  }, [lat, lng, clearMarkers, addRestaurantMarker, searchCurrentArea]);

  // Listen for "See Dishes" button clicks inside info windows
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest(
        ".seefood-select-btn"
      ) as HTMLElement | null;
      if (btn) {
        const placeId = btn.getAttribute("data-place-id");
        const name = btn.getAttribute("data-place-name");
        if (placeId && name) {
          onSelectRestaurant(placeId, name);
        }
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [onSelectRestaurant]);

  useEffect(() => {
    if (window.google?.maps) {
      initMap();
      return;
    }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      window.initMapPicker = initMap;
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    window.initMapPicker = initMap;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMapPicker`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [initMap]);

  return (
    <div className="fixed inset-0 z-50 bg-[#111] flex flex-col">
      {/* Header — search bar inspired by Google Maps */}
      <div
        className="px-3 pb-3 bg-[#111]"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          {/* Back button */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>

          {/* Search input */}
          <div className="relative flex-1">
            {/* Search icon */}
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>

            <input
              ref={searchRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search city, neighborhood, restaurant…"
              className="w-full bg-[#242424] text-white rounded-2xl pl-10 pr-9 py-3.5 text-[15px] outline-none focus:ring-2 focus:ring-[#ff6b35]/40 placeholder:text-white/30 leading-none"
            />

            {/* Clear button */}
            {searchText.length > 0 && (
              <button
                onClick={() => {
                  setSearchText("");
                  if (searchRef.current) {
                    searchRef.current.value = "";
                    searchRef.current.focus();
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 active:text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        {/* Search this area — floats over map after panning */}
        {ready && showSearchHere && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <button
              onClick={() =>
                mapInstanceRef.current && searchCurrentArea(mapInstanceRef.current)
              }
              className="pointer-events-auto bg-white text-gray-900 text-[13px] font-bold px-5 py-2.5 rounded-full shadow-2xl active:scale-95 transition-transform flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Search this area
            </button>
          </div>
        )}

        {/* Searching indicator */}
        {searching && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-[#1c1c1c]/95 backdrop-blur text-white/70 text-[12px] font-medium px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
              Finding restaurants…
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint bar */}
      <div
        className="bg-[#111] border-t border-white/[0.06] px-4 py-2.5 text-center"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      >
        <p className="text-white/25 text-[11px]">
          {showSearchHere
            ? "Pan complete — tap Search this area to load pins"
            : "Tap a pin to view dishes · Pan to any city and search"}
        </p>
      </div>
    </div>
  );
}
