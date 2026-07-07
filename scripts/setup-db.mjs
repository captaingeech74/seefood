#!/usr/bin/env node
// One-time (idempotent) provisioning: applies db/schema.sql to the Supabase Postgres
// instance. Run with: node scripts/setup-db.mjs
// Reads SUPABASE_DB_PASSWORD + SUPABASE_URL from .env.local (or process.env).

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const envPath = join(__dirname, "..", ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const projectRef = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
// Direct db.<ref>.supabase.co only has an AAAA (IPv6) record on new projects;
// use the IPv4-reachable Supavisor pooler instead (session mode, port 5432).
const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;

const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf-8");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`Connected to db.${projectRef}.supabase.co`);
  await client.query(schema);
  console.log("Schema applied.");
  const res = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
  );
  console.log("Tables:", res.rows.map((r) => r.table_name).join(", "));
  await client.end();
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
