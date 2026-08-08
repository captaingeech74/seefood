"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import MapPicker, { MapPickerProps, MapView } from "@/components/MapPicker";

const OpenMapPicker = dynamic(() => import("@/components/OpenMapPicker"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center text-white/60">
      Opening map…
    </div>
  ),
});

export type { MapView };

/**
 * A deliberately thin experiment seam. `?map=open` enables the MapLibre
 * picker for a QA session; `?map=google` forces the established picker.
 * Removing this file and changing one import in SeeFoodApp fully removes the
 * experiment without touching restaurant data or Google provider identities.
 */
export default function RestaurantPicker(props: MapPickerProps) {
  const [useOpenMap, setUseOpenMap] = useState<boolean | null>(null);

  useEffect(() => {
    const queryChoice = new URLSearchParams(window.location.search).get("map");
    setUseOpenMap(queryChoice === "open" || (
      queryChoice !== "google" && process.env.NEXT_PUBLIC_MAP_PROVIDER === "open"
    ));
  }, []);

  if (useOpenMap === null) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center text-white/60">
        Opening search…
      </div>
    );
  }

  return useOpenMap ? <OpenMapPicker {...props} /> : <MapPicker {...props} />;
}
