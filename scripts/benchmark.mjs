#!/usr/bin/env node
// Runs the fixed benchmark set against production and produces a per-source
// scoreboard: hit rate, items/restaurant, photos/restaurant, latency.
// Usage: npm run benchmark
// PRD §5.5 — every "improved" claim must cite before/after from this table.

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BENCHMARK_BASE_URL || "https://seefood-rho.vercel.app";
const restaurants = JSON.parse(
  readFileSync(join(__dirname, "..", "benchmark", "restaurants.json"), "utf-8")
);

// Cache-bust: unstable_cache key includes the `name` query param, so tag it
// per run to force a fresh full-pipeline execution instead of a 24h cache hit.
const RUN_TAG = new Date().toISOString().slice(0, 10);

// DoorDash excluded — corpus-only, never live-tested (Scrapfly credit cost).
const SOURCES = ["website", "grubhub", "menufy"];

function isHit(source, result) {
  if (!result) return false;
  switch (source) {
    case "website": return (result.parsed_menu_items ?? 0) > 0;
    case "grubhub": return !!result.ok;
    case "menufy": return !!result.detected && (result.item_count ?? 0) > 0;
    default: return false;
  }
}

function itemCount(source, result) {
  if (!result) return 0;
  switch (source) {
    case "website": return result.parsed_menu_items ?? 0;
    case "grubhub": return result.item_count ?? 0;
    case "menufy": return result.item_count ?? 0;
    default: return 0;
  }
}

async function fetchJson(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latency_ms = Date.now() - start;
    const json = await res.json();
    return { ok: res.ok, json, latency_ms };
  } catch (e) {
    return { ok: false, json: null, latency_ms: Date.now() - start, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`SeeFood benchmark — ${restaurants.length} restaurants against ${BASE_URL} (run: ${RUN_TAG})\n`);

  const perRestaurant = [];
  const perSource = Object.fromEntries(
    SOURCES.map((s) => [s, { hits: 0, totalItems: 0, totalLatency: 0, errors: 0 }])
  );

  for (const r of restaurants) {
    const debugUrl = `${BASE_URL}/api/debug-sources?placeId=${r.placeId}&name=${encodeURIComponent(r.name)}&lat=${r.lat}&lng=${r.lng}`;
    const dishesUrl = `${BASE_URL}/api/dishes?placeId=${r.placeId}&name=${encodeURIComponent(r.name + " [bench-" + RUN_TAG + "]")}`;

    const [debugRes, dishesRes] = await Promise.all([fetchJson(debugUrl), fetchJson(dishesUrl, 60000)]);

    const sourceResults = {};
    for (const source of SOURCES) {
      const result = debugRes.json?.[source];
      const hit = isHit(source, result);
      const items = itemCount(source, result);
      sourceResults[source] = { hit, items, error: result?.error ?? null };
      perSource[source].totalLatency += debugRes.latency_ms;
      if (hit) {
        perSource[source].hits += 1;
        perSource[source].totalItems += items;
      }
      if (result?.error) perSource[source].errors += 1;
    }

    const dishes = dishesRes.json?.dishes ?? [];
    const menuMatched = dishes.filter((d) => d.isMenuMatch).length;

    perRestaurant.push({
      name: r.name,
      category: r.category,
      placeId: r.placeId,
      sources: sourceResults,
      photo_count: dishes.length,
      menu_matched_count: menuMatched,
      debug_latency_ms: debugRes.latency_ms,
      dishes_latency_ms: dishesRes.latency_ms,
    });

    console.log(
      `${r.name.padEnd(38)} photos=${String(dishes.length).padStart(2)} matched=${String(menuMatched).padStart(2)} ` +
      SOURCES.map((s) => `${s}:${sourceResults[s].hit ? "✓" : "·"}`).join(" ")
    );
  }

  console.log("\n── Per-source scoreboard ──────────────────────────────────────────");
  console.log(
    "source".padEnd(12) + "hit_rate".padEnd(10) + "avg_items".padEnd(11) + "avg_latency_ms"
  );
  for (const source of SOURCES) {
    const s = perSource[source];
    const hitRate = ((s.hits / restaurants.length) * 100).toFixed(0) + "%";
    const avgItems = s.hits > 0 ? (s.totalItems / s.hits).toFixed(1) : "0";
    const avgLatency = (s.totalLatency / restaurants.length).toFixed(0);
    console.log(source.padEnd(12) + hitRate.padEnd(10) + avgItems.padEnd(11) + avgLatency);
  }

  const avgPhotos = (perRestaurant.reduce((a, r) => a + r.photo_count, 0) / restaurants.length).toFixed(1);
  const avgMatched = (perRestaurant.reduce((a, r) => a + r.menu_matched_count, 0) / restaurants.length).toFixed(1);
  const magicCapable = perRestaurant.filter((r) => r.menu_matched_count + r.photo_count >= 5).length;
  console.log(`\nAvg photos/restaurant: ${avgPhotos}   Avg menu-matched/restaurant: ${avgMatched}`);
  console.log(`"Magic-capable" (≥5 named dish photos): ${magicCapable}/${restaurants.length}`);

  const resultsDir = join(__dirname, "..", "benchmark", "results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `${RUN_TAG}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ run_date: RUN_TAG, base_url: BASE_URL, perSource, perRestaurant }, null, 2)
  );
  console.log(`\nResults written to ${outPath}`);
}

main();
