/**
 * Cloudflare R2 photo storage (PRD §5.1). S3-compatible; zero egress fees.
 * Phase 1: origin URLs are proxied/served directly and copying into R2 is
 * opportunistic (crawler writes, and live-path saves when a photo is judged
 * corpus-worthy) — not every photo needs an R2 copy on day one.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Downloads a photo from its origin URL and uploads it to R2 under `key`.
 * Returns the public r2.dev URL, or null on any failure (fail-open — callers
 * should fall back to serving the origin URL directly).
 */
export async function copyPhotoToR2(originUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(originUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return `https://${bucket}.${accountId}.r2.dev/${key}`;
  } catch (e) {
    console.error(`[R2] copy failed for ${originUrl}:`, e);
    return null;
  }
}
