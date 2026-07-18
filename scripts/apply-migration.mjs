#!/usr/bin/env node
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

function loadEnvLocal() {
  try {
    const content = readFileSync(join(repoRoot, ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

loadEnvLocal();

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error("Usage: node scripts/apply-migration.mjs db/migrations/<file>.sql");
  process.exit(1);
}

const migrationPath = resolve(repoRoot, migrationArg);
const migrationsDir = resolve(repoRoot, "db", "migrations");
if (!migrationPath.startsWith(`${migrationsDir}/`)) {
  console.error("Migration must be inside db/migrations.");
  process.exit(1);
}

const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "");
const connectionString = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
if (!connectionString) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const sql = readFileSync(migrationPath, "utf-8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`Applied ${migrationArg}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
