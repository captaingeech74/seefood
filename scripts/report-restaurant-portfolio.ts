#!/usr/bin/env -S npx tsx
/** Founder-facing geography accounting: managed, legacy, duplicate, invalid. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const envPath = join(__dirname, "..", ".env.local");
if (!existsSync(envPath)) throw new Error(`Missing ${envPath}`);
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
async function main() {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const totals = (await db.query(`select reporting_class,count(*)::int entities,
      count(*) filter(where exists(select 1 from restaurants r where r.entity_id=v.id and r.status<>'inactive'))::int live
      from restaurant_portfolio_reporting v group by reporting_class order by reporting_class`)).rows;
    const markets = (await db.query(`select m.market_key,max(k.name) name,count(distinct m.entity_id)::int managed,
      count(distinct r.entity_id) filter(where r.status<>'inactive')::int live
      from acquisition_market_entities m join acquisition_markets k on k.market_key=m.market_key
      left join restaurants r on r.entity_id=m.entity_id where m.active group by m.market_key order by m.market_key`)).rows;
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), totals, markets }, null, 2));
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
