"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { DishPhoto, Restaurant } from "@/lib/types";
import { formatAddress } from "@/lib/labels";

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface MapPickerProps {
  lat: number;
  lng: number;
  recoveryMode?: boolean;
  initialView?: MapView | null;
  onViewChange?: (view: MapView) => void;
  onSelectRestaurant: (placeId: string, name: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    google: typeof google;
    initMapPicker: () => void;
    gm_authFailure?: () => void;
    __seefoodGoogleMapsAuthFailed?: boolean;
  }
}

interface SelectedPlace {
  placeId: string;
  name: string;
  vicinity: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  dishes?: DishPhoto[]; // top ~5 from the corpus, for the bottom-sheet strip (PRD §4.4)
  totalDishCount?: number;
}

interface MapPreview {
  topPhoto: DishPhoto;
  dishes: DishPhoto[];
  totalDishCount: number;
}

interface NearbyDish {
  placeId: string;
  restaurantName: string;
  rating?: number;
  photo: DishPhoto;
}

type SearchRestaurant = Restaurant & { distanceKm?: number };

// LRay's Kitchen (status='test_fixture') is a real Google Place that isn't
// classified as an active restaurant — that's exactly why it was safe to
// pick as a permanent demo fixture, but it also means Google's own
// nearbySearch(type: "restaurant") will never surface it, no matter how
// close the viewport is. Injected manually whenever it's in view so the
// restaurant Kyle actively demos is reachable from Map Explore at all.
const TEST_FIXTURE = {
  placeId: "ChIJa7SNNcl_24ARGN-49KRUqPI",
  name: "LRay's Kitchen",
  lat: 33.5273381,
  lng: -117.1147095,
};

function PriceLevel({ level }: { level: number }) {
  return (
    <span className="text-[12px] font-bold tracking-tight">
      <span className="text-white/65">{"$".repeat(level)}</span>
      <span className="text-white/15">{"$".repeat(4 - level)}</span>
    </span>
  );
}

/** Pin geometry (CSS px): circular photo + ring, with a small anchor tail so
 *  the pin visibly points at its coordinate instead of floating as a bare
 *  square pasted over the map. */
const PIN = {
  normal: { size: 48, ring: 3 },
  selected: { size: 60, ring: 4 },
  tail: 7,
};

/**
 * Composites a dish photo into a proper map-marker icon (2x canvas for
 * retina): center-cropped circle, white ring (accent when selected), and an
 * anchor tail. Returns data-URLs for both states, or null when the photo's
 * host blocks anonymous canvas reads (caller falls back to the raw square).
 */
async function buildPhotoMarkerIcons(url: string): Promise<{ normal: string; selected: string } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("load failed"));
      i.src = url;
    });

    const draw = (sizeCss: number, ringCss: number, ringColor: string) => {
      const dpr = 2;
      const size = sizeCss * dpr;
      const tail = PIN.tail * dpr;
      const ring = ringCss * dpr;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size + tail;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d context");

      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - ring / 2;

      // Anchor tail (under the circle, same color as the ring)
      ctx.beginPath();
      ctx.moveTo(cx - 5.5 * dpr, size - ring);
      ctx.lineTo(cx + 5.5 * dpr, size - ring);
      ctx.lineTo(cx, size + tail);
      ctx.closePath();
      ctx.fillStyle = ringColor;
      ctx.fill();

      // Photo, center-cropped into the circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - ring / 2, 0, Math.PI * 2);
      ctx.clip();
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();

      // Ring on top
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = ring;
      ctx.strokeStyle = ringColor;
      ctx.stroke();

      return c.toDataURL("image/png");
    };

    return {
      normal: draw(PIN.normal.size, PIN.normal.ring, "#ffffff"),
      selected: draw(PIN.selected.size, PIN.selected.ring, "#ff6b35"),
    };
  } catch {
    return null;
  }
}

/**
 * Map Explore v2 (PRD §4.4) — instant open on the user's block, pins are
 * dish-photo thumbnails from the corpus (dot pins for uncrawled restaurants,
 * which also enqueues them for the Tier 1 crawler), tap → glass bottom sheet
 * with a swipeable dish strip → "See all dishes" opens the Reveal/grid.
 */
export default function MapPicker({
  lat,
  lng,
  recoveryMode = false,
  initialView,
  onViewChange,
  onSelectRestaurant,
  onClose,
}: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const selectedMarkerRef = useRef<google.maps.Marker | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const previewsRef = useRef<Map<string, MapPreview>>(new Map());

  const [ready, setReady] = useState(false);
  const [showSearchHere, setShowSearchHere] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [nearbyDishes, setNearbyDishes] = useState<NearbyDish[]>([]);
  const [bestNearbyExpanded, setBestNearbyExpanded] = useState(false);
  /** Post-search feedback ("7 restaurants found"), auto-dismissed. */
  const [foundToast, setFoundToast] = useState<string | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchRestaurant[]>([]);
  const [corpusSearching, setCorpusSearching] = useState(false);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    selectedMarkerRef.current = null;
  }, []);

  // Dot pin — restaurants with no corpus photos yet (upgrades once crawled).
  const dotIcon = useCallback((): google.maps.Symbol => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: "#ff6b35",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
    scale: 8.5,
    labelOrigin: new window.google.maps.Point(0, -18),
  }), []);

  const selectedDotIcon = useCallback((): google.maps.Symbol => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: "#ffffff",
    fillOpacity: 1,
    strokeColor: "#ff6b35",
    strokeWeight: 4,
    scale: 11,
    labelOrigin: new window.google.maps.Point(0, -21),
  }), []);

  // Composited circular marker icons per photo URL (see buildPhotoMarkerIcons).
  const iconCacheRef = useRef<Map<string, { normal: string; selected: string }>>(new Map());

  // Photo-thumbnail pin (PRD §4.4 "pins are dish-photo thumbnails, not dots").
  // Uses the composited circle+ring+tail icon when available; falls back to
  // the raw square thumbnail if the photo's host blocked canvas reads.
  const photoIcon = useCallback(
    (url: string, isSelected: boolean): google.maps.Icon => {
      const built = iconCacheRef.current.get(url);
      if (built) {
        const { size } = isSelected ? PIN.selected : PIN.normal;
        return {
          url: isSelected ? built.selected : built.normal,
          scaledSize: new window.google.maps.Size(size, size + PIN.tail),
          // Anchor at the tail tip so the pin points at its coordinate.
          anchor: new window.google.maps.Point(size / 2, size + PIN.tail),
          labelOrigin: new window.google.maps.Point(size / 2, -8),
        };
      }
      return {
        url,
        scaledSize: new window.google.maps.Size(isSelected ? 56 : 44, isSelected ? 56 : 44),
        anchor: new window.google.maps.Point(isSelected ? 28 : 22, isSelected ? 28 : 22),
        labelOrigin: new window.google.maps.Point(isSelected ? 28 : 22, -8),
      };
    },
    []
  );

  const setMarkerSelected = useCallback(
    (marker: google.maps.Marker | null, placeId?: string) => {
      if (selectedMarkerRef.current && selectedMarkerRef.current !== marker) {
        const prevId = selectedMarkerRef.current.get("placeId") as string | undefined;
        const prevPreview = prevId ? previewsRef.current.get(prevId) : undefined;
        selectedMarkerRef.current.setIcon(prevPreview ? photoIcon(prevPreview.topPhoto.url, false) : dotIcon());
        selectedMarkerRef.current.setZIndex(undefined);
      }
      if (marker) {
        const preview = placeId ? previewsRef.current.get(placeId) : undefined;
        marker.setIcon(preview ? photoIcon(preview.topPhoto.url, true) : selectedDotIcon());
        marker.setZIndex(999);
      }
      selectedMarkerRef.current = marker;
    },
    [dotIcon, selectedDotIcon, photoIcon]
  );

  const addRestaurantMarker = useCallback(
    (mapInstance: google.maps.Map, place: google.maps.places.PlaceResult) => {
      if (!place.geometry?.location || !place.place_id) return null;
      const placeId = place.place_id;
      const preview = previewsRef.current.get(placeId);

      const marker = new window.google.maps.Marker({
        map: mapInstance,
        title: place.name,
        position: place.geometry.location,
        icon: preview ? photoIcon(preview.topPhoto.url, false) : dotIcon(),
        label: recoveryMode
          ? {
              text: (place.name || "Restaurant").slice(0, 28),
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "700",
              className: "seefood-google-map-label",
            }
          : undefined,
        animation: window.google.maps.Animation.DROP,
      });
      marker.set("placeId", placeId);

      marker.addListener("click", () => {
        setMarkerSelected(marker, placeId);
        const currentPreview = previewsRef.current.get(placeId);
        setSelected({
          placeId,
          name: place.name || "Restaurant",
          vicinity: place.vicinity || place.formatted_address || "",
          rating: place.rating ?? undefined,
          userRatingsTotal: place.user_ratings_total ?? undefined,
          priceLevel: place.price_level ?? undefined,
          dishes: currentPreview?.dishes,
          totalDishCount: currentPreview?.totalDishCount,
        });
        if (place.geometry?.location) {
          mapInstance.panTo(place.geometry.location);
          window.setTimeout(() => mapInstance.panBy(0, -100), 150);
        }
      });

      markersRef.current.push(marker);
      return marker;
    },
    [dotIcon, photoIcon, recoveryMode, setMarkerSelected]
  );

  // Viewport prefetch (PRD §4.4 <300ms pin taps): batch-fetch corpus photo
  // previews for every result before dropping markers, so pins render as
  // photos immediately rather than dots-then-upgrade. Also the enqueue
  // signal for uncrawled restaurants happens server-side in this same call.
  const loadPreviewsAndAddMarkers = useCallback(
    async (mapInstance: google.maps.Map, results: google.maps.places.PlaceResult[]) => {
      const restaurants = results
        .filter((r) => r.place_id && r.geometry?.location)
        .map((r) => ({
          placeId: r.place_id!,
          name: r.name || "",
          lat: r.geometry!.location!.lat(),
          lng: r.geometry!.location!.lng(),
          address: r.vicinity || r.formatted_address || "",
        }));

      try {
        const res = await fetch("/api/map-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurants }),
        });
        if (res.ok) {
          const data: Record<string, MapPreview> = await res.json();
          for (const [placeId, preview] of Object.entries(data)) {
            previewsRef.current.set(placeId, preview);
          }
        }
      } catch {
        // Fail open — dot pins for everyone, map still fully usable.
      }

      const nearby: NearbyDish[] = [];
      for (const place of results) {
        const preview = place.place_id ? previewsRef.current.get(place.place_id) : undefined;
        if (!preview || !place.place_id) continue;
        nearby.push({
          placeId: place.place_id,
          restaurantName: place.name || "Restaurant",
          rating: place.rating ?? undefined,
          photo: preview.topPhoto,
        });
        if (nearby.length === 8) break;
      }
      setNearbyDishes(nearby);

      // Composite marker icons before dropping pins so photo pins land
      // styled (circle + ring + anchor tail) rather than as raw squares.
      // Hard-capped: a photo host that never settles (no load OR error
      // event) must not hold the entire pin drop hostage — those pins fall
      // back to the raw thumbnail icon.
      await Promise.all(
        [...previewsRef.current.values()]
          .map((p) => p.topPhoto.url)
          .filter((url) => !iconCacheRef.current.has(url))
          .map(async (url) => {
            const built = await Promise.race([
              buildPhotoMarkerIcons(url),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
            ]);
            if (built) iconCacheRef.current.set(url, built);
          })
      );

      results.slice(0, 20).forEach((place) => addRestaurantMarker(mapInstance, place));
    },
    [addRestaurantMarker]
  );

  const foundToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFoundToast = useCallback((msg: string) => {
    setFoundToast(msg);
    if (foundToastTimer.current) clearTimeout(foundToastTimer.current);
    foundToastTimer.current = setTimeout(() => setFoundToast(null), 2200);
  }, []);

  const searchCurrentArea = useCallback(
    (mapInstance: google.maps.Map, opts?: { ensureVisible?: boolean }) => {
      setSearching(true);
      setShowSearchHere(false);
      setSelected(null);
      setNearbyDishes([]);
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
        { location: center, radius: Math.max(300, radius), type: "restaurant" },
        async (rawResults, status) => {
          setSearching(false);
          const ok =
            status === window.google.maps.places.PlacesServiceStatus.OK ||
            status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
          if (!ok) {
            showFoundToast("Couldn't search this area — try again");
            return;
          }
          // ZERO_RESULTS still proceeds with an empty list: the demo fixture
          // below must drop its pin even in a viewport where Google's own
          // search comes back empty (it's excluded from type:"restaurant").
          const results = rawResults ?? [];

          const bounds = mapInstance.getBounds();
          const fixtureLatLng = new window.google.maps.LatLng(TEST_FIXTURE.lat, TEST_FIXTURE.lng);
          const alreadyPresent = results.some((r) => r.place_id === TEST_FIXTURE.placeId);
          // The fixture's Google Place is registered under its old handle
          // ("qutamicatering") with none of the demo stats — when Google's own
          // search surfaces it, override the display fields in place (the
          // stored/Google data itself is left untouched). Otherwise prepend
          // it (not append — loadPreviewsAndAddMarkers caps markers at the
          // first 20 results, and the fixture should never lose that race).
          const fixtureOverride = {
            name: TEST_FIXTURE.name,
            // Hardcoded demo stats (Kyle: highly reviewed, expensive,
            // matching the same override in getRestaurantDetails).
            rating: 4.9,
            user_ratings_total: 812,
            price_level: 4,
          };
          const withFixture = alreadyPresent
            ? results.map((r) =>
                r.place_id === TEST_FIXTURE.placeId
                  ? (Object.assign(Object.create(Object.getPrototypeOf(r)), r, fixtureOverride) as google.maps.places.PlaceResult)
                  : r
              )
            : bounds?.contains(fixtureLatLng)
            ? [
                {
                  place_id: TEST_FIXTURE.placeId,
                  vicinity: "Temecula, CA",
                  geometry: { location: fixtureLatLng },
                  ...fixtureOverride,
                } as unknown as google.maps.places.PlaceResult,
                ...results,
              ]
            : results;

          if (withFixture.length === 0) {
            // "Nothing here" is an answer too — without it the button just
            // vanishes and the search looks broken.
            showFoundToast("No restaurants found here");
            return;
          }

          await loadPreviewsAndAddMarkers(mapInstance, withFixture);

          const n = Math.min(withFixture.length, 20);
          showFoundToast(`${n} restaurant${n === 1 ? "" : "s"} found`);

          // First open only: if the camera landed somewhere with pins all
          // off-screen, widen to include them — never open onto an empty map.
          if (opts?.ensureVisible && markersRef.current.length > 0) {
            const view = mapInstance.getBounds();
            const anyVisible = markersRef.current.some((m) => {
              const p = m.getPosition();
              return !!p && !!view?.contains(p);
            });
            if (!anyVisible) {
              const fit = new window.google.maps.LatLngBounds();
              markersRef.current.forEach((m) => {
                const p = m.getPosition();
                if (p) fit.extend(p);
              });
              fit.extend(center);
              mapInstance.fitBounds(fit, 80);
              window.google.maps.event.addListenerOnce(mapInstance, "idle", () => {
                const z = mapInstance.getZoom();
                if (z !== undefined && z > 16) mapInstance.setZoom(16);
              });
            }
          }
        }
      );
    },
    [clearMarkers, loadPreviewsAndAddMarkers, showFoundToast]
  );

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    const center = initialView ?? { lat, lng };
    const zoom = initialView?.zoom ?? (recoveryMode ? 16 : 13);

    const mapInstance = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      // Matches the custom style's base so unloaded tile regions render dark
      // instead of Google's default light gray (a dark-only app flashing a
      // washed-out map for seconds reads as broken).
      backgroundColor: "#16161c",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#16161c" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#16161c" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#7a7a85" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#9a9aa5" }] },
        // POI markers (schools, churches, studios…) compete with restaurant
        // pins in the same visual language — hide them all except parks,
        // which act as orientation landmarks.
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }] },
        { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ visibility: "on" }, { color: "#4a5a50" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#22222a" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a2a35" }] },
        { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#a0a0ad" }] },
        { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1c1c24" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a12" }] },
        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a3a48" }] },
      ],
      disableDefaultUI: true,
      // Mouse users expect visible zoom affordances; touch users pinch.
      // Right-center keeps it clear of the locate FAB (bottom-right).
      zoomControl: typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
      zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
      clickableIcons: false,
    });

    mapInstanceRef.current = mapInstance;

    new window.google.maps.Marker({
      map: mapInstance,
      position: { lat, lng },
      title: "Your location",
      zIndex: 1000,
      clickable: false,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: "#3b82f6",
        fillOpacity: 1,
        strokeColor: "#dbeafe",
        strokeWeight: 3,
        scale: 7,
      },
    });

    mapInstance.addListener("click", () => {
      setSelected(null);
      setMarkerSelected(null);
    });

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    let viewTimer: ReturnType<typeof setTimeout> | null = null;
    let firstIdle = true;

    mapInstance.addListener("idle", () => {
      const c = mapInstance.getCenter();
      const z = mapInstance.getZoom();
      if (c && z !== undefined && onViewChange) {
        if (viewTimer) clearTimeout(viewTimer);
        viewTimer = setTimeout(() => onViewChange({ lat: c.lat(), lng: c.lng(), zoom: z }), 300);
      }

      if (firstIdle) {
        firstIdle = false;
        searchCurrentArea(mapInstance, { ensureVisible: true });
        return;
      }
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => setShowSearchHere(true), 350);
    });

    if (searchRef.current) {
      const searchBox = new window.google.maps.places.SearchBox(searchRef.current);

      mapInstance.addListener("bounds_changed", () => {
        searchBox.setBounds(mapInstance.getBounds() as google.maps.LatLngBounds);
      });

      searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (!places || places.length === 0) return;

        clearMarkers();
        setShowSearchHere(false);
        setSelected(null);
        const bounds = new window.google.maps.LatLngBounds();
        places.forEach((place) => {
          if (place.geometry?.location) bounds.extend(place.geometry.location);
        });
        mapInstance.fitBounds(bounds);
        setTimeout(() => searchCurrentArea(mapInstance), 800);
      });
    }

    setReady(true);

    // Google can load its JavaScript successfully and only then reject the
    // map (for example when billing is disabled). That failure does not
    // reliably call gm_authFailure in every browser, so detect Google's own
    // rendered error message and switch to corpus search instead of leaving a
    // broken map blocking the product.
    [500, 1500, 4000].forEach((delay) => {
      window.setTimeout(() => {
        if (mapRef.current?.textContent?.includes("can't load Google Maps")) {
          window.__seefoodGoogleMapsAuthFailed = true;
          setMapUnavailable(true);
          setReady(false);
        }
      }, delay);
    });
  }, [lat, lng, initialView, onViewChange, clearMarkers, recoveryMode, searchCurrentArea, setMarkerSelected]);

  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setCorpusSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCorpusSearching(true);
      try {
        const response = await fetch(`/api/restaurants/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = response.ok ? await response.json() : { restaurants: [] };
        setSearchResults(body.restaurants ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setCorpusSearching(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchText]);

  useEffect(() => {
    const markMapUnavailable = () => {
      window.__seefoodGoogleMapsAuthFailed = true;
      setMapUnavailable(true);
      setReady(false);
    };
    window.gm_authFailure = markMapUnavailable;

    // Keep the product usable when the Maps project is disabled. Re-enable
    // explicitly after the Google project is healthy; the corpus search above
    // remains the primary, no-billing fallback either way.
    if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED !== "true") {
      markMapUnavailable();
      return;
    }

    if (window.__seefoodGoogleMapsAuthFailed) {
      markMapUnavailable();
      return;
    }
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
    script.onerror = markMapUnavailable;
    document.head.appendChild(script);
    const readinessTimer = window.setTimeout(() => {
      if (!mapInstanceRef.current) setMapUnavailable(true);
    }, 8000);
    return () => window.clearTimeout(readinessTimer);
    // Only run once on mount — initMap is intentionally not in deps here;
    // re-running on every initMap identity change would re-attach listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecenter = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.panTo({ lat, lng });
    map.setZoom(recoveryMode ? 16 : 13);
    setTimeout(() => searchCurrentArea(map), 250);
  }, [lat, lng, recoveryMode, searchCurrentArea]);

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-0)] flex flex-col">
      {/* Header — search bar */}
      <div
        className="relative z-30 px-3 pb-3 glass border-b border-[var(--border-subtle)]"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 max-w-xl mx-auto">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white/65 hover:text-white hover:bg-white/8 active:bg-white/15 transition-colors shrink-0"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>

          <form
            className="relative flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const first = searchResults[0];
              if (first) onSelectRestaurant(first.placeId ?? first.id, first.name);
            }}
          >
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
          </form>
        </div>

        {searchText.trim().length >= 2 && (
          <div className="absolute left-14 right-3 top-[62px] z-50 max-w-[calc(36rem-3.5rem)] mx-auto rounded-2xl border border-white/10 bg-[#17171d]/[0.98] shadow-2xl overflow-hidden">
            {corpusSearching ? (
              <p className="px-4 py-4 text-white/50 text-[13px]">Searching SeeFood…</p>
            ) : searchResults.length > 0 ? (
              <div className="max-h-[min(55vh,420px)] overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.placeId ?? item.id}
                    type="button"
                    onClick={() => onSelectRestaurant(item.placeId ?? item.id, item.name)}
                    className="w-full px-4 py-3.5 text-left border-b border-white/[0.06] last:border-0 hover:bg-white/[0.06] active:bg-white/[0.1]"
                  >
                    <p className="text-white text-[14px] font-bold">{item.name}</p>
                    <p className="text-white/45 text-[11px] mt-1 truncate">{formatAddress(item.address)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 py-4 text-white/50 text-[13px]">No SeeFood restaurants match that search.</p>
            )}
          </div>
        )}
      </div>

      {/* Map area */}
      <div className="relative flex-1 overflow-hidden" style={{ background: "#16161c" }}>
        {!mapUnavailable ? (
          <div
            ref={mapRef}
            className="absolute"
            style={{
              background: "#16161c",
              inset: "-5% -7% -12%",
              transform: "perspective(1100px) rotateX(7deg) scale(1.08)",
              transformOrigin: "50% 18%",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center bg-[#111116]">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center text-2xl">🔍</div>
            <h2 className="text-white text-[19px] font-bold mt-5">Restaurant search is ready</h2>
            <p className="text-white/45 text-[13px] leading-relaxed mt-2 max-w-sm">
              The map is temporarily unavailable, but SeeFood's restaurant and menu search still works. Type a restaurant or city above.
            </p>
          </div>
        )}

        {ready && showSearchHere && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none fade-up">
            <button
              onClick={() => mapInstanceRef.current && searchCurrentArea(mapInstanceRef.current)}
              className="pointer-events-auto bg-white text-gray-900 text-[15px] font-bold px-7 py-3.5 rounded-full shadow-2xl active:scale-95 transition-transform flex items-center gap-2.5"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>
              </svg>
              Search this area
            </button>
          </div>
        )}

        {searching && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 fade-in">
            <div className="bg-[var(--surface-1)]/95 backdrop-blur text-white/70 text-[12px] font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2.5 border border-[var(--border-subtle)]">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/15 border-t-white/85 animate-spin" />
              Finding restaurants
            </div>
          </div>
        )}

        {!searching && foundToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 fade-in pointer-events-none">
            <div className="bg-[var(--surface-1)]/95 backdrop-blur text-white/70 text-[12px] font-semibold px-4 py-2.5 rounded-full shadow-xl border border-[var(--border-subtle)]">
              {foundToast}
            </div>
          </div>
        )}

        {/* Hidden (not just nudged) while the preview sheet is up — the sheet
            is taller than any offset, so a shifted FAB still ended up buried
            behind it. */}
        {!mapUnavailable && <button
          onClick={handleRecenter}
          className="absolute bottom-5 right-4 z-10 w-14 h-14 rounded-full glass border border-[var(--border-subtle)] flex items-center justify-center shadow-2xl active:scale-95 transition-all"
          style={{
            opacity: selected ? 0 : 1,
            pointerEvents: selected ? "none" : "auto",
            transform: selected ? "scale(0.85)" : "scale(1)",
            bottom: !selected && recoveryMode
              ? 118
              : !selected && nearbyDishes.length > 0
                ? (bestNearbyExpanded ? 326 : 178)
                : 20,
            transition: "opacity 240ms var(--ease-standard), transform 240ms var(--ease-standard)",
          }}
          aria-label="Recenter on my location"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white/85">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>}

        {!selected && !recoveryMode && nearbyDishes.length > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 pt-10 pb-3 fade-up transition-[max-height] duration-300 overflow-hidden"
            style={{
              maxHeight: bestNearbyExpanded ? 326 : 178,
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(10,10,10,0.98) 0%, rgba(10,10,10,0.82) 66%, transparent 100%)",
            }}
          >
            <button
              type="button"
              onClick={() => setBestNearbyExpanded((value) => !value)}
              className="w-full flex items-end justify-between gap-3 px-4 mb-2.5 text-left active:opacity-75 transition-opacity"
              aria-expanded={bestNearbyExpanded}
              aria-controls="best-nearby-dishes"
            >
              <div>
                <p className="text-white text-[17px] font-bold tracking-tight">Best nearby</p>
                <p className="text-white/38 text-[11px] font-medium">Top dishes from restaurants around you</p>
              </div>
              <span className="shrink-0 flex items-center gap-1.5 text-white/50 text-[10px] uppercase tracking-[0.08em] font-bold">
                {bestNearbyExpanded ? "Show less" : "See more"}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-300 ${bestNearbyExpanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </span>
            </button>
            <div
              id="best-nearby-dishes"
              className={bestNearbyExpanded
                ? "grid grid-flow-col grid-rows-2 auto-cols-[132px] gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1"
                : "flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1"}
              style={{ perspective: 800 }}
            >
              {nearbyDishes.map((item, index) => (
                <button
                  key={item.placeId}
                  type="button"
                  onClick={() => onSelectRestaurant(item.placeId, item.restaurantName)}
                  className="relative shrink-0 w-[132px] h-[104px] rounded-2xl overflow-hidden text-left border border-white/12 shadow-2xl active:scale-[0.97] transition-transform"
                  style={{
                    background: "var(--surface-2)",
                    transform: `rotateY(${index % 2 === 0 ? -3 : 3}deg) translateY(${index % 3 === 1 ? 3 : 0}px)`,
                    transformOrigin: "bottom center",
                  }}
                  aria-label={`Open ${item.photo.dishName || "top dishes"} at ${item.restaurantName}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.photo.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                  {item.rating && (
                    <span className="absolute top-2 right-2 rounded-md bg-black/72 px-1.5 py-1 text-[9.5px] leading-none font-bold text-white shadow-lg backdrop-blur-sm">
                      {item.rating.toFixed(1)} ★
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <p className="text-white text-[12px] leading-tight font-bold line-clamp-1">{item.photo.dishName || "Top dish"}</p>
                    <p className="text-white/65 text-[9.5px] leading-tight mt-0.5 truncate">
                      {item.restaurantName}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!selected && recoveryMode && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 px-4 pt-10 fade-up"
            style={{
              paddingBottom: "max(22px, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(10,10,10,0.98) 0%, rgba(10,10,10,0.82) 68%, transparent 100%)",
            }}
          >
            <h1 className="mx-auto max-w-xl text-center text-white text-[25px] font-bold tracking-[-0.03em]">
              Where would you like to See Food?
            </h1>
          </div>
        )}

        {/* Bottom sheet — restaurant preview + dish strip (PRD §4.4) */}
        {selected && (
          <>
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
                  background: "linear-gradient(180deg, rgba(28,28,32,0.96) 0%, rgba(18,18,22,0.96) 100%)",
                  backdropFilter: "saturate(180%) blur(24px)",
                  WebkitBackdropFilter: "saturate(180%) blur(24px)",
                }}
              >
                <div className="flex justify-center mb-3">
                  <div className="w-9 h-1 rounded-full bg-white/15" />
                </div>

                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-white text-[18px] font-bold leading-tight tracking-[-0.01em] flex-1 min-w-0">
                    {selected.name}
                  </h3>
                  <button
                    onClick={() => {
                      setSelected(null);
                      setMarkerSelected(null);
                    }}
                    className="hit-target relative shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-full bg-white/8 hover:bg-white/14 active:bg-white/20 flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white/65">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                {(selected.rating !== undefined || selected.priceLevel !== undefined) && (
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
                    {selected.rating !== undefined && selected.priceLevel !== undefined && (
                      <span className="text-white/15 text-[10px]">·</span>
                    )}
                    {selected.priceLevel !== undefined && selected.priceLevel > 0 && (
                      <PriceLevel level={selected.priceLevel} />
                    )}
                  </div>
                )}

                {selected.vicinity && (
                  <p className="text-white/45 text-[12px] mb-3 truncate font-medium">{formatAddress(selected.vicinity)}</p>
                )}

                {/* Swipeable top-5 dish strip (PRD §4.4) — only when corpus has
                    photos. Deduped to one card per dish name: two identical
                    "Mushroom Pizza" cards side by side read as a glitch, not
                    as two photos of the same dish. */}
                {selected.dishes && selected.dishes.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3.5 -mx-0.5 px-0.5">
                    {selected.dishes.filter((d, i, arr) =>
                      !d.dishName || arr.findIndex((o) => o.dishName === d.dishName) === i
                    ).map((d) => (
                      <div
                        key={d.id}
                        className="shrink-0 w-20 h-20 rounded-xl overflow-hidden relative bg-[var(--surface-2)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.url} alt={d.dishName || ""} className="w-full h-full object-cover" />
                        {d.dishName && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1">
                            <p className="text-white text-[9px] font-bold leading-tight line-clamp-2">
                              {d.dishName}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => onSelectRestaurant(selected.placeId, selected.name)}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-[15px] py-3.5 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  {selected.totalDishCount ? `See all dishes (${selected.totalDishCount})` : "See all dishes"}
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
