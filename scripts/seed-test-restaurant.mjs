#!/usr/bin/env node
// Seeds the permanent SeeFood test fixture restaurant ("qutamicatering" —
// a real, central Temecula Google Place that isn't an active restaurant, so
// it's a safe forever-available canvas for dummy data). Idempotent: clears
// and re-writes its menu_items/photos each run, safe to re-run any time to
// refresh the fixture.
//
// status='test_fixture' is the load-bearing bit: every crawl sweep (Track A
// Vercel Cron, Track B Mac launchd, scripts/crawl.ts --zone) filters this
// status out, so this restaurant is NEVER touched by the live pipeline or
// the corpus-wide "delete stale google photos" cleanup — it stays exactly
// as seeded until someone reruns this script on purpose.
//
// Run with: node scripts/seed-test-restaurant.mjs
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

const PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI"; // qutamicatering, Temecula — real Place, not an active restaurant
const NAME = "SeeFood Test Kitchen (qutamicatering)";
const ADDRESS = "42200, Temecula, CA";

// Real, stable, freely-licensed food photos (foodish-api.com) — enough
// distinct photos per dish, split across owner/user attribution, to
// populate the management-vs-diner comparison carousel (PRD §4.3 tap-in).
// source is always 'schema_org' regardless of attribution: that source is
// never touched by the live pipeline's "clear stale google photos before
// each re-persist" step (see db.ts persistPipelineResult), which is what
// makes this fixture actually permanent rather than getting wiped on the
// next accidental live-path hit.
const DISHES = [
  {
    name: "Test Burger Supreme",
    description: "A deliberately fake dish for exercising the grid, Reveal, and comparison carousel UI.",
    photos: [
      { url: "https://foodish-api.com/images/burger/burger60.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger18.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger20.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Wood-Fired Pizza",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/pizza/pizza92.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pizza/pizza79.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/pizza/pizza55.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Truffle Pasta",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/pasta/pasta11.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pasta/pasta13.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Chocolate Dessert",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/dessert/dessert31.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert24.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert34.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Chicken Biryani",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/biryani/biryani61.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/biryani/biryani10.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/biryani/biryani29.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Crispy Samosa",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/samosa/samosa17.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/samosa/samosa9.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Masala Dosa",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/dosa/dosa33.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dosa/dosa60.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/dosa/dosa59.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Saffron Rice",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/rice/rice2.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/rice/rice21.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Butter Chicken",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken10.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken5.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken16.jpg", attribution: "user" },
    ],
  },
  {
    name: "Test Idly Platter",
    description: "Fixture dish — not a real menu item.",
    photos: [
      { url: "https://foodish-api.com/images/idly/idly63.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/idly/idly71.jpg", attribution: "user" },
    ],
  },
];

async function main() {
  console.log(`Seeding test fixture restaurant ${PLACE_ID} ...`);

  const { error: restErr } = await supabase.from("restaurants").upsert(
    {
      place_id: PLACE_ID,
      slug: "qutamicatering-temecula",
      name: NAME,
      lat: 33.5273381,
      lng: -117.1147095,
      address: ADDRESS,
      website: null,
      status: "test_fixture",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "place_id" }
  );
  if (restErr) throw restErr;
  console.log("  restaurant row upserted, status=test_fixture");

  // Clear old fixture content so reruns don't accumulate duplicates.
  await supabase.from("photos").delete().eq("restaurant_id", PLACE_ID);
  await supabase.from("menu_items").delete().eq("restaurant_id", PLACE_ID);
  console.log("  cleared old fixture menu_items/photos");

  let totalPhotos = 0;
  for (const dish of DISHES) {
    const { data: item, error: itemErr } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: PLACE_ID,
        name: dish.name,
        description: dish.description,
        source: "schema_org",
        confidence: "high",
      })
      .select("id")
      .single();
    if (itemErr) { console.error(`  FAILED menu_item ${dish.name}:`, itemErr.message); continue; }

    const rows = dish.photos.map((p) => ({
      restaurant_id: PLACE_ID,
      menu_item_id: item.id,
      origin_url: p.url,
      source: "schema_org",
      attribution: p.attribution,
      tier: 1,
      is_orderable: true,
      width: 800,
      height: 600,
    }));
    const { error: photoErr } = await supabase.from("photos").insert(rows);
    if (photoErr) { console.error(`  FAILED photos for ${dish.name}:`, photoErr.message); continue; }
    totalPhotos += rows.length;
    console.log(`  ${dish.name}: ${rows.length} photos (${dish.photos.filter(p=>p.attribution==="owner").length} owner, ${dish.photos.filter(p=>p.attribution==="user").length} user)`);
  }

  console.log(`\nDone. ${DISHES.length} dishes, ${totalPhotos} photos.`);
  console.log(`Live at: https://seefood-rho.vercel.app/r/qutamicatering-temecula`);
}

main().catch((e) => { console.error(e); process.exit(1); });
