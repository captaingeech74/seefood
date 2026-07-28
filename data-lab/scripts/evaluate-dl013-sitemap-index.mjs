#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node data-lab/scripts/evaluate-dl013-sitemap-index.mjs <sitemap-index.xml>");
  process.exit(1);
}

const xml = readFileSync(path, "utf8");
const regions = [
  ...new Set(
    [...xml.matchAll(/sitemap-doordash-([^/<]+)-stores\.xml/g)].map(
      (match) => match[1],
    ),
  ),
].sort();
const expectedUsRegions = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
  "dc", "pr",
];
const presentUsRegions = expectedUsRegions.filter((region) =>
  regions.includes(region),
);
const missingUsRegions = expectedUsRegions.filter(
  (region) => !regions.includes(region),
);

console.log(
  JSON.stringify(
    {
      input: path,
      sha256: createHash("sha256").update(xml).digest("hex"),
      bytes: Buffer.byteLength(xml),
      uniqueGlobalRegionLabels: regions.length,
      expectedUsStateDistrictTerritoryLabels: expectedUsRegions.length,
      presentUsStateDistrictTerritoryLabels: presentUsRegions.length,
      missingUsRegionLabels: missingUsRegions,
      interpretation:
        "Geographic footprint evidence only. This does not measure unique restaurants, menu freshness, image population, rights, or incremental SeeFood coverage.",
    },
    null,
    2,
  ),
);
