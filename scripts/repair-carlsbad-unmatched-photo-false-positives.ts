#!/usr/bin/env -S npx tsx
/** Remove three known non-food images admitted by the first unmatched-photo pass. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const urls = [
  "https://static.parastorage.com/services/restaurant-menus-showcase-ooi/32f43626916d61c7230c005be8198518edbcf8b3b64433b47f70e8c6/media/menus_side_image.7077f229.jpeg",
  "https://images.squarespace-cdn.com/content/v1/6a0cc2548fc002414872ef5e/0ebd941a-a32b-4d74-b257-43ba1c92cfee/littlekiki_illustration02.png",
  "https://static.spotapps.co/spots/23/6bc57316524e559649688705fa9e3f/full",
];

async function main() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const rollback = process.argv.includes("--rollback");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const connectionString = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
  const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, application_name: "seefood-carlsbad-photo-repair" });
  await db.connect();
  const result = await db.query(
    `update photos set active=$1,is_orderable=$1,last_seen_at=now()
     where source='common_crawl' and origin_url=any($2::text[]) returning id,restaurant_id,origin_url`,
    [rollback, urls],
  );
  await db.end();
  console.log(JSON.stringify({ mode: rollback ? "rollback" : "repair", affected: result.rowCount, rows: result.rows }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
