#!/usr/bin/env node
// One-time (safe to rerun) discovery sweep: finds Temecula restaurants via
// Google Places Nearby Search (paginated) + a couple of Text Search queries
// for broader coverage, and upserts each as a 'queued' row in the corpus so
// Track A's cron (/api/cron/saturate-temecula) has a real backlog to work
// through. Never touches restaurants already in the corpus (any existing
// status, including 'test_fixture') — insert-if-absent only.
//
// Run with: node scripts/discover-temecula.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnvLocal() {
  try {
    const content = readFileSync(join(__dirname, "..", ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.GOOGLE_MAPS_API_KEY.trim();

const TEMECULA_CENTER = { lat: 33.4936, lng: -117.1484 };
const RADIUS_M = 9000; // ~covers the whole city + immediate surroundings

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nearbySearchAllPages(location, radius, type) {
  const results = [];
  let pageToken = null;
  for (let page = 0; page < 3; page++) {
    const url = pageToken
      ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${API_KEY}`
      : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=${radius}&type=${type}&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.results) results.push(...data.results);
    if (!data.next_page_token) break;
    pageToken = data.next_page_token;
    await sleep(2200); // Google requires a short delay before a page token is valid
  }
  return results;
}

async function textSearch(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results ?? [];
}

async function main() {
  console.log("Discovering Temecula restaurants...");
  const [nearby, text1, text2] = await Promise.all([
    nearbySearchAllPages(TEMECULA_CENTER, RADIUS_M, "restaurant"),
    textSearch("restaurants in Temecula, CA"),
    textSearch("cafes and diners in Temecula, CA"),
  ]);

  const byId = new Map();
  for (const r of [...nearby, ...text1, ...text2]) {
    if (r.place_id && !byId.has(r.place_id)) byId.set(r.place_id, r);
  }
  console.log(`Found ${byId.size} distinct places.`);

  const { data: existing } = await supabase.from("restaurants").select("place_id");
  const existingIds = new Set((existing ?? []).map((r) => r.place_id));

  let inserted = 0;
  for (const [placeId, place] of byId) {
    if (existingIds.has(placeId)) continue; // never touch an existing row (incl. test_fixture)
    const { error } = await supabase.from("restaurants").upsert(
      {
        place_id: placeId,
        name: place.name,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        address: place.formatted_address ?? place.vicinity ?? "",
        status: "queued",
      },
      { onConflict: "place_id", ignoreDuplicates: true }
    );
    if (error) console.error(`  FAILED ${place.name}:`, error.message);
    else inserted++;
  }

  console.log(`\nQueued ${inserted} new restaurants for Track A saturation (${existingIds.size} already existed).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
