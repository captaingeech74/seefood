#!/usr/bin/env node
// Seeds the permanent SeeFood test fixture restaurant, displayed as "LRay's
// Kitchen" (underlying Google Place is "qutamicatering" — a real, central
// Temecula Place that isn't an active restaurant, so it's a safe
// forever-available canvas for dummy data; getTestFixtureNameOverride() in
// db.ts is what makes /api/restaurant show "LRay's Kitchen" instead of
// Google's real name for this place_id). Idempotent: clears and re-writes
// its menu_items/photos each run, safe to re-run any time to refresh the
// fixture.
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
const NAME = "LRay's Kitchen";
const ADDRESS = "40900 Via Los Altos, Temecula, CA 92591";

// Real, stable, freely-licensed food photos (foodish-api.com). Real
// descriptions per dish (not placeholder text) so Dish Detail looks like a
// real menu. Several dishes carry 4-5 photos across both owner/user
// attribution specifically to exercise: (a) the management-vs-diner
// comparison carousel, and (b) horizontal same-dish-photo swiping.
const DISHES = [
  {
    name: "Burger Supreme",
    description: "A juicy beef patty with melted cheddar, crisp lettuce, tomato, and our signature burger sauce on a toasted brioche bun.",
    photos: [
      { url: "https://foodish-api.com/images/burger/burger60.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger18.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger20.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger34.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/burger/burger14.jpg", attribution: "user" },
    ],
  },
  {
    name: "BBQ Bacon Burger",
    description: "Applewood-smoked bacon, tangy BBQ sauce, and crispy onion straws stacked on a charbroiled patty.",
    photos: [
      { url: "https://foodish-api.com/images/burger/burger77.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/burger/burger28.jpg", attribution: "user" },
    ],
  },
  {
    name: "Wood-Fired Pizza",
    description: "Hand-stretched dough, San Marzano tomato sauce, fresh mozzarella, and basil, fired in our 900°F oven.",
    photos: [
      { url: "https://foodish-api.com/images/pizza/pizza92.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pizza/pizza79.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pizza/pizza55.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/pizza/pizza78.jpg", attribution: "user" },
    ],
  },
  {
    name: "Pepperoni Feast Pizza",
    description: "Double pepperoni, mozzarella, and a honey drizzle for a sweet-and-spicy finish.",
    photos: [
      { url: "https://foodish-api.com/images/pizza/pizza85.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pizza/pizza75.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/pizza/pizza43.jpg", attribution: "user" },
    ],
  },
  {
    name: "Truffle Pasta",
    description: "Fresh tagliatelle tossed in a black truffle cream sauce with shaved parmesan.",
    photos: [
      { url: "https://foodish-api.com/images/pasta/pasta11.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pasta/pasta13.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/pasta/pasta29.jpg", attribution: "user" },
    ],
  },
  {
    name: "Spicy Arrabbiata",
    description: "Penne in a fiery tomato sauce with garlic, red chili flakes, and fresh basil.",
    photos: [
      { url: "https://foodish-api.com/images/pasta/pasta8.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pasta/pasta18.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/pasta/pasta22.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/pasta/pasta6.jpg", attribution: "user" },
    ],
  },
  {
    name: "Chocolate Lava Cake",
    description: "Warm chocolate cake with a molten center, served with vanilla bean ice cream.",
    photos: [
      { url: "https://foodish-api.com/images/dessert/dessert31.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert24.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert34.jpg", attribution: "user" },
    ],
  },
  {
    name: "Tiramisu",
    description: "Espresso-soaked ladyfingers layered with mascarpone cream and a dusting of cocoa.",
    photos: [
      { url: "https://foodish-api.com/images/dessert/dessert35.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert12.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dessert/dessert21.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/dessert/dessert28.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/dessert/dessert29.jpg", attribution: "user" },
    ],
  },
  {
    name: "Chicken Biryani",
    description: "Basmati rice slow-cooked with marinated chicken, saffron, and warm spices.",
    photos: [
      { url: "https://foodish-api.com/images/biryani/biryani61.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/biryani/biryani10.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/biryani/biryani29.jpg", attribution: "user" },
    ],
  },
  {
    name: "Lamb Biryani",
    description: "Tender lamb layered with fragrant basmati rice, caramelized onions, and mint.",
    photos: [
      { url: "https://foodish-api.com/images/biryani/biryani25.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/biryani/biryani57.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/biryani/biryani38.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/biryani/biryani62.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/biryani/biryani47.jpg", attribution: "user" },
    ],
  },
  {
    name: "Crispy Samosa",
    description: "Golden fried pastry filled with spiced potatoes and peas, served with tamarind chutney.",
    photos: [
      { url: "https://foodish-api.com/images/samosa/samosa17.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/samosa/samosa9.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/samosa/samosa14.jpg", attribution: "user" },
    ],
  },
  {
    name: "Masala Dosa",
    description: "A crispy rice-and-lentil crepe filled with spiced potato masala, served with sambar and coconut chutney.",
    photos: [
      { url: "https://foodish-api.com/images/dosa/dosa33.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dosa/dosa60.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/dosa/dosa59.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/dosa/dosa44.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/dosa/dosa40.jpg", attribution: "user" },
    ],
  },
  {
    name: "Saffron Rice",
    description: "Fragrant basmati rice infused with saffron, cardamom, and toasted almonds.",
    photos: [
      { url: "https://foodish-api.com/images/rice/rice2.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/rice/rice21.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/rice/rice13.jpg", attribution: "user" },
    ],
  },
  {
    name: "Vegetable Fried Rice",
    description: "Wok-tossed rice with seasonal vegetables, egg, and a savory soy glaze.",
    photos: [
      { url: "https://foodish-api.com/images/rice/rice32.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/rice/rice5.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/rice/rice19.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/rice/rice33.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/rice/rice6.jpg", attribution: "user" },
    ],
  },
  {
    name: "Butter Chicken",
    description: "Tandoori chicken simmered in a creamy tomato-butter sauce with garam masala.",
    photos: [
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken10.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken5.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/butter-chicken/butter-chicken16.jpg", attribution: "user" },
    ],
  },
  {
    name: "Idly Platter",
    description: "Steamed rice-and-lentil cakes served with coconut chutney and sambar.",
    photos: [
      { url: "https://foodish-api.com/images/idly/idly63.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/idly/idly71.jpg", attribution: "owner" },
      { url: "https://foodish-api.com/images/idly/idly70.jpg", attribution: "user" },
      { url: "https://foodish-api.com/images/idly/idly28.jpg", attribution: "user" },
    ],
  },
];

async function main() {
  console.log(`Seeding test fixture restaurant ${PLACE_ID} ...`);

  const { error: restErr } = await supabase.from("restaurants").upsert(
    {
      place_id: PLACE_ID,
      slug: "lrays-kitchen-temecula",
      name: NAME,
      lat: 33.5276698,
      lng: -117.1172185,
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
  console.log(`Live at: https://seefood.vercel.app/r/lrays-kitchen-temecula`);
}

main().catch((e) => { console.error(e); process.exit(1); });
