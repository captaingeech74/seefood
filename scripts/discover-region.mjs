#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(scriptDir, "..", ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const rawArgs = process.argv.slice(2);
const args = {};
for (let index = 0; index < rawArgs.length; index++) {
  if (!rawArgs[index].startsWith("--")) continue;
  const key = rawArgs[index].slice(2);
  const next = rawArgs[index + 1];
  args[key] = next && !next.startsWith("--") ? next : true;
  if (args[key] !== true) index++;
}
const query = String(args.query || [args.city, args.state, args.zip].filter(Boolean).join(", ")).trim();
const radius = Math.min(25000, Math.max(1000, Number(args.radius || 10000)));
if (!query) {
  console.error('Usage: node scripts/discover-region.mjs --query "Austin, TX" [--radius 12000]');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const googleKey = process.env.GOOGLE_MAPS_API_KEY.trim();
const userAgent = "SeeFood/1.0 (restaurant identity discovery)";
const normalize = (value = "") => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function distanceMeters(a, b) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function nameScore(a, b) {
  const left = new Set(normalize(a).split(" ").filter((word) => word.length > 1));
  const right = new Set(normalize(b).split(" ").filter((word) => word.length > 1));
  if (!left.size || !right.size) return 0;
  return [...left].filter((word) => right.has(word)).length / Math.max(left.size, right.size);
}

async function locateRegion() {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": userAgent } });
  const results = await response.json();
  if (!results[0]) throw new Error(`Could not locate ${query}`);
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

async function discoverOsm(center) {
  const statement = `[out:json][timeout:60];(node[amenity~"restaurant|cafe|fast_food|food_court"](around:${radius},${center.lat},${center.lng});way[amenity~"restaurant|cafe|fast_food|food_court"](around:${radius},${center.lat},${center.lng});relation[amenity~"restaurant|cafe|fast_food|food_court"](around:${radius},${center.lat},${center.lng}););out center tags;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": userAgent },
    body: new URLSearchParams({ data: statement }),
  });
  if (!response.ok) throw new Error(`OpenStreetMap discovery failed: ${response.status}`);
  const data = await response.json();
  return data.elements.flatMap((element) => {
    const name = element.tags?.name || element.tags?.brand;
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || !lat || !lng) return [];
    const address = [element.tags?.["addr:housenumber"], element.tags?.["addr:street"], element.tags?.["addr:city"], element.tags?.["addr:state"], element.tags?.["addr:postcode"]].filter(Boolean).join(" ");
    return [{ providerId: `${element.type}/${element.id}`, name, lat, lng, address, website: element.tags?.website || element.tags?.["contact:website"] || null, raw: element.tags ?? {} }];
  });
}

async function discoverGoogle(center) {
  const results = [];
  let pageToken = null;
  for (let page = 0; page < 3; page++) {
    const url = pageToken
      ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${googleKey}`
      : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${center.lat},${center.lng}&radius=${radius}&type=restaurant&key=${googleKey}`;
    const response = await fetch(url);
    const data = await response.json();
    results.push(...(data.results ?? []));
    if (!data.next_page_token) break;
    pageToken = data.next_page_token;
    await sleep(2200);
  }
  return results.map((place) => ({ providerId: place.place_id, name: place.name, lat: place.geometry.location.lat, lng: place.geometry.location.lng, address: place.vicinity || "", raw: { business_status: place.business_status, types: place.types } }));
}

async function createEntity(candidate, legacyPlaceId = null) {
  const { data, error } = await db.from("restaurant_entities").insert({ legacy_place_id: legacyPlaceId, name: candidate.name, normalized_name: normalize(candidate.name), address: candidate.address, lat: candidate.lat, lng: candidate.lng, website: candidate.website ?? null, status: legacyPlaceId ? "active" : "identity_only" }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertIdentity(entityId, provider, candidate) {
  await db.from("restaurant_identities").upsert({ entity_id: entityId, provider, provider_id: candidate.providerId, provider_url: provider === "openstreetmap" ? `https://www.openstreetmap.org/${candidate.providerId}` : null, name: candidate.name, address: candidate.address, lat: candidate.lat, lng: candidate.lng, website: candidate.website ?? null, confidence: 1, raw_metadata: candidate.raw, last_seen_at: new Date().toISOString(), active: true }, { onConflict: "provider,provider_id" });
}

async function main() {
  const center = await locateRegion();
  console.log(`Discovering ${query} within ${(radius / 1000).toFixed(1)} km...`);
  const [google, osm] = await Promise.all([discoverGoogle(center), discoverOsm(center)]);
  const entityByGoogleId = new Map();

  for (const candidate of google) {
    const { data: identity } = await db.from("restaurant_identities").select("entity_id").eq("provider", "google").eq("provider_id", candidate.providerId).maybeSingle();
    const entityId = identity?.entity_id ?? await createEntity(candidate, candidate.providerId);
    entityByGoogleId.set(candidate.providerId, entityId);
    await upsertIdentity(entityId, "google", candidate);
    await db.from("restaurants").upsert({ place_id: candidate.providerId, entity_id: entityId, name: candidate.name, lat: candidate.lat, lng: candidate.lng, address: candidate.address, status: "queued" }, { onConflict: "place_id", ignoreDuplicates: true });
    await db.from("acquisition_jobs").upsert({ entity_id: entityId, source: "google", region_key: normalize(query).replace(/ /g, "-"), priority: 20 }, { onConflict: "entity_id,source", ignoreDuplicates: true });
  }

  let linked = 0;
  let osmOnly = 0;
  for (const candidate of osm) {
    const { data: existing } = await db.from("restaurant_identities").select("entity_id").eq("provider", "openstreetmap").eq("provider_id", candidate.providerId).maybeSingle();
    let entityId = existing?.entity_id;
    if (!entityId) {
      const match = google.map((place) => ({ place, distance: distanceMeters(candidate, place), score: nameScore(candidate.name, place.name) })).filter((result) => result.distance <= 175 && result.score >= 0.6).sort((a, b) => b.score - a.score || a.distance - b.distance)[0];
      entityId = match ? entityByGoogleId.get(match.place.providerId) : await createEntity(candidate);
      if (match) linked++; else osmOnly++;
    }
    await upsertIdentity(entityId, "openstreetmap", candidate);
  }
  console.log(`Google: ${google.length}; OpenStreetMap: ${osm.length}; cross-linked: ${linked}; OSM-only identities: ${osmOnly}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
