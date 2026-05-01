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

interface SelectedPlace {
  placeId: string;
  name: string;
  vicinity: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
}

function PriceLevel({ level }: { level: number }) {
  return (
    <span className="text-[12px] font-bold tracking-tight">
      <span className="text-white/65">{"$".repeat(level)}</span>
      <span className="text-white/15">{"$".repeat(4 - level)}</span>
    </span>
  );
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
  const selectedMarkerRef = useRef<google.maps.Marker | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  const [ready, setReady] = useState(false);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<SelectedPlace | null>(null);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    selectedMarkerRef.current = null;
  }, []);

  // Marker icon styles — refined orange pill
  const baseIcon = useCallback((): google.maps.Symbol => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: "#ff6b35",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
    scale: 8.5,
  }), []);

  const selectedIcon = useCallback((): google.maps.Symbol => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: "#ffffff",
    fillOpacity: 1,
    strokeColor: "#ff6b35",
    strokeWeight: 4,
    scale: 11,
  }), []);

  const setMarkerSelected = useCallback(
    (marker: google.maps.Marker | null) => {
      // De-emphasize previous
      if (selectedMarkerRef.current && selectedMarkerRef.current !== marker) {
        selectedMarkerRef.current.setIcon(baseIcon());
        selectedMarkerRef.current.setZIndex(undefined);
      }
      // Highlight new
      if (marker) {
        marker.setIcon(selectedIcon());
        marker.setZIndex(999);
      }
      selectedMarkerRef.current = marker;
    },
    [baseIcon, selectedIcon]
  );

  const addRestaurantMarker = useCallback(
    (
      mapInstance: google.maps.Map,
      place: google.maps.places.PlaceResult
    ) => {
      if (!place.geometry?.location) return null;

      const marker = new window.google.maps.Marker({
        map: mapInstance,
        title: place.name,
        position: place.geometry.location,
        icon: baseIcon(),
        animation: window.google.maps.Animation.DROP,
      });

      marker.addListener("click", () => {
        setMarkerSelected(marker);
        setSelected({
          placeId: place.place_id || "",
          name: place.name || "Restaurant",
          vicinity: place.vicinity || place.formatted_address || "",
          rating: place.rating ?? undefined,
          userRatingsTotal: place.user_ratings_total ?? undefined,
          priceLevel: place.price_level ?? undefined,
        });
        // Smoothly recenter slightly above the pin so the bottom sheet doesn't cover it
        if (place.geometry?.location) {
          mapInstance.panTo(place.geometry.location);
          // Offset down so the pin sits in the upper portion
          window.setTimeout(() => {
            mapInstance.panBy(0, -100);
          }, 150);
        }
      });

      markersRef.current.push(marker);
      return marker;
    },
    [baseIcon, setMarkerSelected]
  );

  const searchCurrentArea = useCallback(
    (mapInstance: google.maps.Map) => {
      setSearching(true);
      setShowSearchHere(false);
      setSelected(null);
      clearMarkers();

      const center = mapInstance.getCenter();
      if (!center) {
        setSearching(false);
        return;
      }

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
          ) {
            return;
          }
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
      // Refined dark style — flatter, more modern
      styles: [
        { elementType: "geometry", stylers: [{ color: "#16161c" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#16161c" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#7a7a85" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#9a9aa5" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5a5a65" }] },
        { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#22222a" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a2a35" }] },
        { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#a0a0ad" }] },
        { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1c1c24" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a12" }] },
        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a3a48" }] },
      ],
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
      clickableIcons: false,
    });

    mapInstanceRef.current = mapInstance;

    // Tap empty map area → dismiss bottom sheet
    mapInstance.addListener("click", () => {
      setSelected(null);
      setMarkerSelected(null);
    });

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    let firstIdle = true;

    mapInstance.addListener("idle", () => {
      if (firstIdle) {
        firstIdle = false;
        searchCurrentArea(mapInstance);
        return;
      }
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => setShowSearchHere(true), 350);
    });

    if (searchRef.current) {
      const searchBox = new window.google.maps.places.SearchBox(searchRef.current);

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
        setSelected(null);
        const bounds = new window.google.maps.LatLngBounds();

        places.forEach((place) => {
          addRestaurantMarker(mapInstance, place);
          if (place.geometry?.location) bounds.extend(place.geometry.location);
        });

        mapInstance.fitBounds(bounds);
        setTimeout(() => searchCurrentArea(mapInstance), 800);
      });
    }

    setReady(true);
  }, [lat, lng, clearMarkers, addRestaurantMarker, searchCurrentArea, setMarkerSelected]);

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

  const handleRecenter = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.panTo({ lat, lng });
    map.setZoom(16);
    setTimeout(() => searchCurrentArea(map), 250);
  }, [lat, lng, searchCurrentArea]);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-0)] flex flex-col">
      {/* Header — search bar */}
      <div
        className="px-3 pb-3 glass border-b border-[var(--border-subtle)]"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          {/* Back */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/65 hover:text-white hover:bg-white/8 active:bg-white/15 transition-colors shrink-0"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>

          {/* Search input */}
          <div className="relative flex-1">
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
              className="w-full bg-[var(--surface-2)] text-white rounded-2xl pl-10 pr-9 py-3.5 text-[15px] outline-none focus:ring-2 focus:ring-[var(--accent-ring)] placeholder:text-white/30 leading-none transition-shadow"
            />

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
                aria-label="Clear search"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="relative flex-1">
        <div ref={mapRef} className="w-full h-full" />

        {/* Search this area — top floating chip */}
        {ready && showSearchHere && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none fade-up">
            <button
              onClick={() =>
                mapInstanceRef.current && searchCurrentArea(mapInstanceRef.current)
              }
              className="pointer-events-auto bg-white text-gray-900 text-[13px] font-bold px-5 py-2.5 rounded-full shadow-2xl active:scale-95 transition-transform flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>
              </svg>
              Search this area
            </button>
          </div>
        )}

        {/* Searching pill */}
        {searching && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 fade-in">
            <div className="bg-[var(--surface-1)]/95 backdrop-blur text-white/70 text-[12px] font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2.5 border border-[var(--border-subtle)]">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/15 border-t-white/85 animate-spin" />
              Finding restaurants
            </div>
          </div>
        )}

        {/* Recenter FAB */}
        <button
          onClick={handleRecenter}
          className="absolute bottom-4 right-4 z-10 w-12 h-12 rounded-full glass border border-[var(--border-subtle)] flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
          style={{
            transform: selected ? "translateY(-100%)" : "translateY(0)",
            transition: "transform 380ms var(--ease-spring)",
          }}
          aria-label="Recenter on my location"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>

        {/* Bottom sheet — restaurant preview */}
        {selected && (
          <>
            {/* Light backdrop dim */}
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)" }}
            />
            <div
              className="absolute bottom-0 inset-x-0 z-20 px-3 slide-up"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
              <div
                className="rounded-3xl border border-[var(--border-soft)] p-4 shadow-2xl"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(28,28,32,0.96) 0%, rgba(18,18,22,0.96) 100%)",
                  backdropFilter: "saturate(180%) blur(24px)",
                  WebkitBackdropFilter: "saturate(180%) blur(24px)",
                }}
              >
                {/* Drag handle */}
                <div className="flex justify-center mb-3">
                  <div className="w-9 h-1 rounded-full bg-white/15" />
                </div>

                {/* Header row: name + close */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-white text-[18px] font-bold leading-tight tracking-[-0.01em] flex-1 min-w-0">
                    {selected.name}
                  </h3>
                  <button
                    onClick={() => {
                      setSelected(null);
                      setMarkerSelected(null);
                    }}
                    className="shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/65">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                {/* Stats row */}
                {(selected.rating !== undefined ||
                  selected.priceLevel !== undefined) && (
                  <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                    {selected.rating !== undefined && (
                      <div className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                          <path d="M12 2 14.6 8.6 22 9.5l-5.4 5L18 22l-6-3.5L6 22l1.4-7.5L2 9.5l7.4-.9L12 2z"/>
                        </svg>
                        <span className="text-white/85 text-[13px] font-bold tabular-nums">
                          {selected.rating.toFixed(1)}
                        </span>
                        {selected.userRatingsTotal !== undefined && (
                          <span className="text-white/35 text-[12px] font-medium">
                            ({selected.userRatingsTotal >= 1000
                              ? `${(selected.userRatingsTotal / 1000).toFixed(1)}k`
                              : selected.userRatingsTotal})
                          </span>
                        )}
                      </div>
                    )}
                    {selected.rating !== undefined &&
                      selected.priceLevel !== undefined && (
                        <span className="text-white/15 text-[10px]">·</span>
                      )}
                    {selected.priceLevel !== undefined &&
                      selected.priceLevel > 0 && (
                        <PriceLevel level={selected.priceLevel} />
                      )}
                  </div>
                )}

                {/* Address */}
                {selected.vicinity && (
                  <p className="text-white/45 text-[12px] mb-3.5 truncate font-medium">
                    {selected.vicinity}
                  </p>
                )}

                {/* CTA */}
                <button
                  onClick={() => onSelectRestaurant(selected.placeId, selected.name)}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-[15px] py-3.5 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  See the dishes
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
