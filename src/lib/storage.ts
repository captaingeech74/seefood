/**
 * Cloudflare R2 photo storage (PRD §5.1). S3-compatible; zero egress fees.
 * Phase 1: origin URLs are proxied/served directly and copying into R2 is
 * opportunistic (crawler writes, and live-path saves when a photo is judged
 * corpus-worthy) — not every photo needs an R2 copy on day one.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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
 * Uploads raw bytes to R2 under `key`. Returns a stable app-relative URL
 * proxied through /api/r2-photo (see that route). R2's actual public-bucket
 * domain is a dashboard-provisioned pub-<hash>.r2.dev address (or a custom
 * domain) that can't be derived from the account id and bucket name alone —
 * an earlier version of this function guessed `${bucket}.${accountId}.r2.dev`,
 * which doesn't correspond to any real R2 domain format and silently served
 * broken images (caught July 2026 when the LRay's Kitchen Notion-menu import
 * was the first real end-to-end exercise of this upload path).
 */
export async function uploadPhotoBuffer(
  buffer: Buffer,
  contentType: string,
  key: string
): Promise<string | null> {
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `/api/r2-photo?key=${encodeURIComponent(key)}`;
  } catch (e) {
    console.error(`[R2] upload failed for key ${key}:`, e);
    return null;
  }
}

/** Streams an object back out of R2 for /api/r2-photo to serve. Null on any failure. */
export async function getR2ObjectStream(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  try {
    const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) return null;
    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType || "image/jpeg",
    };
  } catch (e) {
    console.error(`[R2] get failed for key ${key}:`, e);
    return null;
  }
}

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
    return uploadPhotoBuffer(buffer, contentType, key);
  } catch (e) {
    console.error(`[R2] copy failed for ${originUrl}:`, e);
    return null;
  }
}
