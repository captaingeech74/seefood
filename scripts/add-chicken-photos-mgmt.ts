#!/usr/bin/env -S npx tsx
// One-off: attaches the 4 photos Kyle dropped in the repo root (chicken1.png
// .. chicken4.png) to LRay's Kitchen's existing "Rotisserie Chicken & Veggies"
// dish, all tagged attribution="owner" (management) — Kyle wants to see the
// Reveal detail view fully populated with mgmt photos + user photos + a long
// description at once. Explicitly NOT run through the generic AI-identify
// ingest script (scripts/ingest-fixture-photos.ts): that script guesses the
// dish name from the photo via Gemini vision, which risks attaching to a
// different (or newly-created) menu item instead of this exact existing one.
//
// Run with: npx tsx scripts/add-chicken-photos-mgmt.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Dimensions read via `sips -g pixelWidth -g pixelHeight` — avoids pulling in
// an image-parsing dependency for a one-off script.
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "chicken1.png": { width: 1142, height: 1398 },
  "chicken2.png": { width: 1140, height: 752 },
  "chicken3.png": { width: 1142, height: 1486 },
  "chicken4.png": { width: 1132, height: 1016 },
};

function loadEnvLocal() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI"; // LRay's Kitchen fixture
const DISH_NAME = "Rotisserie Chicken & Veggies";
const FILES = ["chicken1.png", "chicken2.png", "chicken3.png", "chicken4.png"];

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { uploadPhotoBuffer } = await import("../src/lib/storage");
  const { findExistingMenuItemByName } = await import("../src/lib/db");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const menuItemId = await findExistingMenuItemByName(PLACE_ID, DISH_NAME);
  if (!menuItemId) {
    console.error(`Could not find existing menu item "${DISH_NAME}" for ${PLACE_ID}`);
    process.exit(1);
  }
  console.log(`Found menu_item id ${menuItemId} for "${DISH_NAME}"`);

  let count = 0;
  for (const file of FILES) {
    const path = join(ROOT, file);
    const buffer = readFileSync(path);
    const { width, height } = DIMENSIONS[file];
    const key = `fixture-photos/lrays-kitchen/mgmt-rotisserie-${file}`;
    const url = await uploadPhotoBuffer(buffer, "image/png", key);
    if (!url) { console.error(`  FAILED to upload ${file}`); continue; }

    const { error } = await supabase.from("photos").insert({
      restaurant_id: PLACE_ID,
      menu_item_id: menuItemId,
      origin_url: url,
      source: "user_upload",
      attribution: "owner",
      tier: 1,
      is_orderable: true,
      width,
      height,
    });
    if (error) { console.error(`  FAILED to save photo row for ${file}:`, error.message); continue; }
    count++;
    console.log(`  Added ${file} (${width}x${height})`);
  }

  console.log(`\nDone. ${count}/${FILES.length} mgmt photos added to "${DISH_NAME}".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
