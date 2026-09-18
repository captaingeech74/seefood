#!/usr/bin/env -S npx tsx
/** Correct verified Spokane display-name artifacts and suppress non-restaurants. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const suppressed = [
  "2c9327e7-d543-41ef-b57a-901f91981057", // Spokane Alano Club
  "8d69e939-c67b-4c6d-a6fb-07c1a9dcbbad", // Spokane Party Trolley
  "c0f48988-5b31-453e-97b0-1c53613562b5", // charitable community kitchen
  "31b51b40-1c06-4330-8889-3a88ec48fbe0", // blog/entrepreneur page, not a venue
  "faf30efb-d313-426e-abed-1c4c39c031ad", // legal-name duplicate of Tomato Street
  "535bdfca-34d6-4af0-9d56-2fdec40fe7be", // duplicate/mislocated P.F. Chang's shell
  "0383e08a-9500-4695-909a-8b4eded85ea4", // duplicate Dutch Bros location-page title
  "196b57b0-c2eb-4267-bc14-8ae48d28c257", // duplicate Dutch Bros location-page title
  "262caf67-9676-4ae0-b59f-d429b3b0d374", // duplicate Dutch Bros location-page title
  "2825c3ad-132f-4189-b518-2f37d432ba9e", // duplicate Dutch Bros location-page title
  "d6e09363-cd87-46cf-8db8-f5b8cdee0842", // duplicate Dutch Bros location-page title
  "aff56e08-78d5-45ca-8544-412030114d41", // former tenant at current House of Brunch address
  "9ca1efbe-d32a-40e3-857e-e9cfb7ce2256", // former tenant at current House of Brunch address
  "fe9a20de-c32d-48ee-a9dd-da4debf738cc", // former tenant at current House of Brunch address
];
const dutchOriginals = [
  ["0383e08a-9500-4695-909a-8b4eded85ea4", "Spokane, WA (Market)", "spokane-wa-market-spokane"],
  ["196b57b0-c2eb-4267-bc14-8ae48d28c257", "Spokane, WA (Freya)", "spokane-wa-freya-spokane"],
  ["262caf67-9676-4ae0-b59f-d429b3b0d374", "Spokane, WA (Shiv)", "spokane-wa-shiv-spokane"],
  ["2825c3ad-132f-4189-b518-2f37d432ba9e", "Spokane, WA (Downtown)", "spokane-wa-downtown-spokane"],
  ["d6e09363-cd87-46cf-8db8-f5b8cdee0842", "Spokane, WA (Franny)", "spokane-wa-franny-spokane"],
] as const;

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  loadEnv();
  const rollback = process.argv.includes("--rollback");
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password),
    ssl: { rejectUnauthorized: false },
    application_name: "seefood-spokane-market-repair",
  });
  await db.connect();
  await db.query("begin");
  try {
    let dutchCount = 0;
    for (const [id, originalName, originalSlug] of dutchOriginals) {
      const name = rollback ? originalName : "Dutch Bros Coffee";
      const slug = rollback ? originalSlug : `dutch-bros-coffee-spokane-${id.slice(0, 8)}`;
      const entity = await db.query(`update restaurant_entities set name=$1,updated_at=now() where id=$2 returning id`, [name, id]);
      await db.query(`update restaurants set name=$1,slug=$2,updated_at=now() where entity_id=$3`, [name, slug, id]);
      dutchCount += entity.rowCount ?? 0;
    }
    const market = await db.query(
      `update acquisition_market_entities set active=$1
       where market_key='spokane-wa' and entity_id=any($2::uuid[]) returning entity_id`,
      [rollback, suppressed],
    );
    const restaurants = await db.query(
      `update restaurants set status=$1,updated_at=now()
       where entity_id=any($2::uuid[]) returning place_id`,
      [rollback ? "active" : "inactive", suppressed],
    );
    await db.query("commit");
    console.log(JSON.stringify({ mode: rollback ? "rollback" : "repair", dutchBrosRenamed: dutchCount,
      marketRowsChanged: market.rowCount, restaurantsChanged: restaurants.rowCount }, null, 2));
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
