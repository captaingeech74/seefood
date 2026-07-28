#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const tigerDirectory = resolve(
  root,
  "data-lab/raw/baseline/DL-002/tiger-2025",
);
const dehDirectory = resolve(
  root,
  "data-lab/raw/baseline/DL-002/riverside-deh",
);

mkdirSync(tigerDirectory, { recursive: true });
mkdirSync(dehDirectory, { recursive: true });

async function download(url, outputPath, maxBytes) {
  const response = await fetch(url, {
    headers: { "user-agent": "SeeFood-DataLab-DL002/1.0 bounded-public-snapshot" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new Error(`Declared response exceeds ${maxBytes} bytes: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`Response exceeds ${maxBytes} bytes: ${url}`);
  }
  writeFileSync(outputPath, bytes);
  console.log(`${bytes.length}\t${outputPath}`);
}

function queryUrl(base, parameters) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

const tigerArchive =
  "https://www2.census.gov/geo/tiger/TIGER2025/PLACE/tl_2025_06_place.zip";
const tigerQuery = queryUrl(
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/11/query",
  {
    where: "GEOID='0678120'",
    outFields: "*",
    returnGeometry: "true",
    f: "geojson",
    outSR: "4326",
  },
);

const arcgisItem = queryUrl(
  "https://www.arcgis.com/sharing/rest/content/items/1af15c9bdf51452b89f67430d4e1c82d",
  { f: "json" },
);
const dehLayer =
  "https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/Food/FeatureServer/0";
const layerMetadata = queryUrl(dehLayer, { f: "json" });
const commonPermitParameters = {
  where: "Status IN ('Active','Active Billing Exempt')",
  geometry: "-117.206525,33.432154,-117.054739,33.554423",
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
};
const permitCount = queryUrl(`${dehLayer}/query`, {
  ...commonPermitParameters,
  returnCountOnly: "true",
  f: "json",
});
const permitRows = queryUrl(`${dehLayer}/query`, {
  ...commonPermitParameters,
  outSR: "4326",
  outFields:
    "OBJECTID,Permit_Number,Establishment_ID,Status,Establishment_Name,Site_Address,City__State__Zip,Program_Type,Permit_Type,Permit_Type_Code,Inspector_District,Inspection_District,X,Y",
  returnGeometry: "true",
  resultRecordCount: "2000",
  orderByFields: "OBJECTID ASC",
  f: "geojson",
});

await download(
  tigerArchive,
  resolve(tigerDirectory, "tl_2025_06_place.zip"),
  15_000_000,
);
await download(
  tigerQuery,
  resolve(tigerDirectory, "temecula-0678120.geojson"),
  250_000,
);
await download(
  arcgisItem,
  resolve(dehDirectory, "item-metadata.json"),
  100_000,
);
await download(
  layerMetadata,
  resolve(dehDirectory, "layer-metadata.json"),
  250_000,
);
await download(
  permitCount,
  resolve(dehDirectory, "bbox-count.json"),
  10_000,
);
await download(
  permitRows,
  resolve(dehDirectory, "active-bbox.geojson"),
  2_000_000,
);
