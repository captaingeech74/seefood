#!/usr/bin/env -S npx tsx
/** Reverses one acquisition batch without touching pre-existing content. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const batchId = process.argv.find((value, index) => process.argv[index - 1] === "--batch");
if (!batchId) throw new Error("Usage: npm run acquisition:rollback -- --batch <uuid>");
const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password), ssl: { rejectUnauthorized: false } });
await db.connect(); await db.query("begin");
try {
  const batch = await db.query("select status from acquisition_import_batches where id=$1 for update", [batchId]);
  if (!batch.rowCount) throw new Error("Unknown batch");
  if (batch.rows[0].status === "rolled_back") { await db.query("rollback"); console.log("already_rolled_back"); }
  else {
    const changes = (await db.query("select * from acquisition_batch_changes where batch_id=$1 order by id desc", [batchId])).rows;
    for (const change of changes) {
      if (change.action === "identity_inserted") await db.query("delete from restaurant_identities where provider=$1 and provider_id=$2 and last_import_batch_id=$3", [change.provider,change.provider_id,batchId]);
      if (change.action === "identity_updated" && change.before_state) {
        const before = change.before_state;
        await db.query(
          `update restaurant_identities set entity_id=$3,name=$4,address=$5,lat=$6,lng=$7,website=$8,confidence=$9,
           raw_metadata=$10,first_seen_at=$11,last_seen_at=$12,active=$13,source_release=$14,source_record_version=$15,
           raw_fingerprint=$16,last_import_batch_id=$17 where provider=$1 and provider_id=$2`,
          [change.provider,change.provider_id,before.entity_id,before.name,before.address,before.lat,before.lng,before.website,before.confidence,
            before.raw_metadata,before.first_seen_at,before.last_seen_at,before.active,before.source_release,before.source_record_version,before.raw_fingerprint,before.last_import_batch_id]
        );
      }
      if (change.action === "entity_created") {
        await db.query(`delete from restaurant_entities e where e.id=$1 and not exists(select 1 from restaurant_identities i where i.entity_id=e.id)
          and not exists(select 1 from restaurants r where r.entity_id=e.id)`, [change.entity_id]);
      }
    }
    await db.query("update acquisition_import_batches set status='rolled_back',rolled_back_at=now() where id=$1", [batchId]);
    await db.query("commit"); console.log(JSON.stringify({ batchId, status: "rolled_back", changes: changes.length }));
  }
} catch (error) { await db.query("rollback"); throw error; } finally { await db.end(); }
