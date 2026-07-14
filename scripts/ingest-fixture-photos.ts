#!/usr/bin/env -S npx tsx
// Kyle's answer to "where should I place these photos?": drop image files
// into fixture-photos/inbox/ and run `npm run ingest-fixture-photos`.
// For each photo this: identifies the dish via Gemini vision (short menu-
// style name + description, same conservative prompt style as the live
// pipeline), uploads it to R2, and adds it to LRay's Kitchen's menu as an
// "owner" (management) photo — same status the seed script's stock photos
// have. Processed files move to fixture-photos/processed/ so re-running is
// safe and never double-ingests. Existing dish names are matched by exact
// text so a second real photo of "Burger Supreme" attaches to the same
// menu item instead of creating a duplicate.
import { readFileSync, readdirSync, renameSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, extname, basename } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INBOX = join(ROOT, "fixture-photos", "inbox");
const PROCESSED = join(ROOT, "fixture-photos", "processed");

function loadEnvLocal() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI"; // LRay's Kitchen fixture
const VISION_KEY = (process.env.VISION_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

async function identifyDish(buffer: Buffer, mimeType: string): Promise<{ name: string; description: string | null } | null> {
  const prompt = `You are looking at a photo a restaurant owner is adding to their menu on SeeFood. Identify the dish.
Respond with ONLY a JSON object, no markdown fences, no explanation:
{"name": string, "description": string}
"name": a SHORT menu-style name of 4 words or fewer, exactly like it would appear on a printed menu (e.g. "Brisket Plate", "Loaded Nachos").
"description": one sentence describing ingredients, preparation, and how it's served.
If this is not a photo of a single served dish/drink/dessert (e.g. it's a menu board, a storefront, a group photo, or otherwise not food), respond with {"name": null, "description": null}.`;

  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: buffer.toString("base64") } }] }],
    generationConfig: { thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
  };

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      const parsed = JSON.parse(text);
      if (parsed.name) return { name: String(parsed.name).trim(), description: parsed.description ? String(parsed.description).trim() : null };
      return null;
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { uploadPhotoBuffer } = await import("../src/lib/storage");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (!existsSync(INBOX)) mkdirSync(INBOX, { recursive: true });
  if (!existsSync(PROCESSED)) mkdirSync(PROCESSED, { recursive: true });

  const files = readdirSync(INBOX).filter((f) => Object.keys(MIME_BY_EXT).includes(extname(f).toLowerCase()));
  if (files.length === 0) {
    console.log(`No new photos in ${INBOX}. Drop image files there and re-run.`);
    return;
  }

  const { data: existingItems } = await supabase.from("menu_items").select("id, name").eq("restaurant_id", PLACE_ID);
  const items = existingItems ?? [];

  for (const file of files) {
    const filePath = join(INBOX, file);
    const buffer = readFileSync(filePath);
    const mimeType = MIME_BY_EXT[extname(file).toLowerCase()];

    console.log(`Identifying ${file} ...`);
    const identified = await identifyDish(buffer, mimeType);
    if (!identified) {
      console.log(`  Gemini couldn't identify a dish in ${file} — skipping (left in inbox for review).`);
      continue;
    }
    console.log(`  -> "${identified.name}"`);

    let menuItemId: number;
    const match = items.find((i) => i.name.toLowerCase().trim() === identified.name.toLowerCase().trim());
    if (match) {
      menuItemId = match.id;
    } else {
      const { data: item, error } = await supabase
        .from("menu_items")
        .insert({ restaurant_id: PLACE_ID, name: identified.name, description: identified.description, source: "schema_org", confidence: "high" })
        .select("id")
        .single();
      if (error || !item) { console.error(`  FAILED to create menu item:`, error?.message); continue; }
      menuItemId = item.id;
      items.push({ id: item.id, name: identified.name });
    }

    const key = `fixture-photos/lrays-kitchen/${Date.now()}-${basename(file)}`;
    const url = await uploadPhotoBuffer(buffer, mimeType, key);
    if (!url) { console.error(`  FAILED to upload ${file} to R2`); continue; }

    const { error: photoErr } = await supabase.from("photos").insert({
      restaurant_id: PLACE_ID,
      menu_item_id: menuItemId,
      origin_url: url,
      source: "schema_org",
      attribution: "owner",
      tier: 1,
      is_orderable: true,
      width: 1200,
      height: 1200,
    });
    if (photoErr) { console.error(`  FAILED to save photo row:`, photoErr.message); continue; }

    renameSync(filePath, join(PROCESSED, file));
    console.log(`  Added as a management photo for "${identified.name}". Moved to processed/.`);
  }

  console.log(`\nDone. Live at: https://seefood-rho.vercel.app/r/lrays-kitchen-temecula`);
}

main().catch((e) => { console.error(e); process.exit(1); });
