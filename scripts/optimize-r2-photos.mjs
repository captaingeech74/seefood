#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const bucket = process.env.R2_BUCKET;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db
  .from("photos")
  .select("id,origin_url,storage_url")
  .or("origin_url.like./api/r2-photo%,storage_url.like./api/r2-photo%");
if (error) throw error;

let optimized = 0;
let skipped = 0;
for (const row of data ?? []) {
  const currentUrl = row.storage_url || row.origin_url;
  const match = currentUrl?.match(/[?&]key=([^&]+)/);
  if (!match) { skipped++; continue; }
  const key = decodeURIComponent(match[1]);
  if (key.endsWith(".webp")) { skipped++; continue; }
  const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) { skipped++; continue; }
  const original = Buffer.from(await object.Body.transformToByteArray());
  const result = await sharp(original, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  const nextKey = key.replace(/\.[^.]+$/, "") + ".webp";
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: nextKey,
    Body: result.data,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  const nextUrl = `/api/r2-photo?key=${encodeURIComponent(nextKey)}`;
  const updates = {
    width: result.info.width,
    height: result.info.height,
    [row.storage_url ? "storage_url" : "origin_url"]: nextUrl,
  };
  const { error: updateError } = await db.from("photos").update(updates).eq("id", row.id);
  if (updateError) throw updateError;
  optimized++;
}

console.log(JSON.stringify({ optimized, skipped, total: data?.length ?? 0 }));

