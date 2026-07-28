#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const boundaryPath = resolve(
  root,
  "data-lab/raw/baseline/DL-002/tiger-2025/temecula-0678120.geojson",
);
const permitsPath = resolve(
  root,
  "data-lab/raw/baseline/DL-002/riverside-deh/active-bbox.geojson",
);
const outputPath = resolve(
  root,
  "data-lab/artifacts/DL-002/temecula-deh-frame.json",
);

const boundary = JSON.parse(readFileSync(boundaryPath, "utf8"));
const permits = JSON.parse(readFileSync(permitsPath, "utf8"));

if (boundary.features?.length !== 1) {
  throw new Error("Expected exactly one Temecula boundary feature");
}

const polygon = boundary.features[0].geometry;
if (!["Polygon", "MultiPolygon"].includes(polygon?.type)) {
  throw new Error(`Unsupported boundary geometry: ${polygon?.type}`);
}

function pointOnSegment([x, y], [x1, y1], [x2, y2], epsilon = 1e-10) {
  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (squaredLength <= epsilon ** 2) {
    return (x - x1) ** 2 + (y - y1) ** 2 <= epsilon ** 2;
  }
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < -epsilon) return false;
  return dot <= squaredLength + epsilon;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointOnSegment(point, ring[j], ring[i])) return true;
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function contains(point) {
  const polygons = polygon.type === "Polygon" ? [polygon.coordinates] : polygon.coordinates;
  return polygons.some((rings) => pointInPolygon(point, rings));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function countsBy(records, field) {
  return Object.fromEntries(
    [...records.reduce((counts, record) => {
      const value = String(record.properties[field] ?? "");
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([a], [b]) => a.localeCompare(b)),
  );
}

const inside = permits.features.filter((feature) => {
  if (feature.geometry?.type !== "Point") return false;
  return contains(feature.geometry.coordinates);
});

const homeBased = inside.filter(
  ({ properties }) =>
    properties.Program_Type === "Retail Food – Home Based Food Facilities",
);
const shareable = inside.filter(
  ({ properties }) =>
    properties.Program_Type !== "Retail Food – Home Based Food Facilities",
);

const uniqueEstablishments = new Set(
  inside.map(({ properties }) => String(properties.Establishment_ID)),
);
const uniqueShareableEstablishments = new Set(
  shareable.map(({ properties }) => String(properties.Establishment_ID)),
);

const result = {
  schemaVersion: 1,
  snapshotDate: "2026-07-27",
  decision: "candidate_status_frame_not_restaurant_census",
  boundary: {
    geoid: "0678120",
    vintage: "2025-01-01",
    sha256: sha256(boundaryPath),
  },
  source: {
    name: "Riverside County DES Food Facility Permits",
    itemId: "1af15c9bdf51452b89f67430d4e1c82d",
    layer:
      "https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/Food/FeatureServer/0",
    sha256: sha256(permitsPath),
  },
  counts: {
    bboxPermitRows: permits.features.length,
    polygonPermitRows: inside.length,
    polygonUniqueEstablishments: uniqueEstablishments.size,
    withheldHomeBasedPermitRows: homeBased.length,
    shareablePermitRows: shareable.length,
    shareableUniqueEstablishments: uniqueShareableEstablishments.size,
  },
  programTypesInsidePolygon: countsBy(inside, "Program_Type"),
  permitTypesInsidePolygon: countsBy(inside, "Permit_Type"),
  caveats: [
    "A permit row is not necessarily a unique customer-facing restaurant.",
    "Multiple permits may attach to one establishment.",
    "Schools, markets, hotels, nonprofits, caterers, temporary facilities, and mobile bases require classification.",
    "Home-based records are withheld from the shareable frame.",
    "The public item exposes no explicit redistribution or commercial-reuse license.",
  ],
  shareableRecords: shareable
    .map(({ geometry, properties }) => ({
      stableExternalId: `rivco-deh-establishment:${properties.Establishment_ID}`,
      permitNumber: String(properties.Permit_Number ?? ""),
      establishmentId: String(properties.Establishment_ID ?? ""),
      status: properties.Status ?? null,
      publicName: properties.Establishment_Name ?? null,
      siteAddress: properties.Site_Address ?? null,
      cityStateZip: properties.City__State__Zip ?? null,
      programType: properties.Program_Type ?? null,
      permitType: properties.Permit_Type ?? null,
      permitTypeCode: String(properties.Permit_Type_Code ?? ""),
      longitude: geometry.coordinates[0],
      latitude: geometry.coordinates[1],
    }))
    .sort(
      (a, b) =>
        a.stableExternalId.localeCompare(b.stableExternalId) ||
        a.permitNumber.localeCompare(b.permitNumber),
    ),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.counts, null, 2));
