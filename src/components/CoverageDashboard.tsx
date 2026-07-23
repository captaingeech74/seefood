"use client";

import { useState } from "react";
import CoverageV1Dashboard from "./CoverageV1Dashboard";
import CoverageV2Dashboard from "./CoverageV2Dashboard";

export default function CoverageDashboard() {
  const [version, setVersion] = useState<"v1" | "v2">("v2");

  return (
    <div className="relative">
      <div className="fixed z-40 top-3 right-4 flex p-0.5 bg-black/80 border border-white/10 rounded-lg backdrop-blur">
        {(["v1", "v2"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setVersion(item)}
            className="min-w-11 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase transition-colors"
            style={{
              color: version === item ? "white" : "rgba(255,255,255,0.35)",
              background: version === item ? "var(--accent)" : "transparent",
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {version === "v1" ? <CoverageV1Dashboard /> : <CoverageV2Dashboard />}
    </div>
  );
}
