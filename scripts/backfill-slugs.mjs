#!/usr/bin/env node
// One-time backfill: assigns a slug to every restaurant row that predates
// slug support (upsertRestaurant only computes one when a restaurant is
// actually re-persisted, which corpus-fresh hits skip entirely). Run with:
// node scripts/backfill-slugs.mjs
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

// Mirrors slugifyRestaurant() in src/lib/db.ts — keep in sync.
function slugifyRestaurant(name, address) {
  const city = address?.split(",")[1]?.trim() ?? "";
  const base = `${name} ${city}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base.slice(0, 80);
}

const { data: rows, error } = await supabase
  .from("restaurants")
  .select("place_id,name,address,slug")
  .is("slug", null);

if (error) { console.error(error); process.exit(1); }
console.log(`${rows.length} restaurants missing a slug`);

const seen = new Set(
  (await supabase.from("restaurants").select("slug").not("slug", "is", null)).data?.map((r) => r.slug) ?? []
);

for (const r of rows) {
  let slug = slugifyRestaurant(r.name, r.address ?? "");
  if (seen.has(slug)) slug = `${slug}-${r.place_id.slice(-6).toLowerCase()}`;
  seen.add(slug);
  const { error: updErr } = await supabase.from("restaurants").update({ slug }).eq("place_id", r.place_id);
  console.log(updErr ? `FAILED ${r.name}: ${updErr.message}` : `${r.name} -> ${slug}`);
}
console.log("Done.");
