import { createHash } from "node:crypto";
import sharp from "sharp";

export interface PhotoFingerprint {
  contentHash: string;
  perceptualHash: string;
}

/**
 * These rows were rejected because their content is not supported as a food
 * photo, not because an image download temporarily failed. Re-observing the
 * same bytes is therefore not new evidence and must not silently republish it.
 * A deliberate rollback/review can still restore the row.
 */
const DURABLE_CONTENT_QUARANTINE_REASONS = new Set([
  "unsupported_generic_website_image",
]);

export function isImageContentType(contentType: string | null): boolean {
  return !!contentType?.toLowerCase().startsWith("image/");
}

export function isTransientPhotoFetchStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * A transient fetch failure must not resurrect a row that a byte-level audit
 * already quarantined. A later observation may rehabilitate it only after the
 * bytes successfully decode and produce a new exact content hash.
 */
export function canReactivateQuarantinedPhoto(
  priorDedupeReason: string | null | undefined,
  incomingContentHash: string | null | undefined
): boolean {
  if (priorDedupeReason && DURABLE_CONTENT_QUARANTINE_REASONS.has(priorDedupeReason)) {
    return false;
  }
  return !priorDedupeReason || Boolean(incomingContentHash);
}

/**
 * New acquired-photo URLs are evidence candidates, not displayable photos,
 * until their bytes have been decoded and hashed. Preserve an already-active
 * legacy row through a transient refresh failure, but do not promote a new or
 * previously inactive unverified row.
 */
export function shouldActivatePhotoObservation(
  priorActive: boolean | null | undefined,
  incomingContentHash: string | null | undefined
): boolean {
  return Boolean(incomingContentHash) || priorActive === true;
}

/**
 * Exact bytes are the safe automatic identity. The 64-bit dHash is diagnostic:
 * it spots resized/re-encoded and near-identical candidates, but is never used
 * by itself to delete a photo.
 */
export async function fingerprintPhoto(buffer: Buffer): Promise<PhotoFingerprint> {
  const raw = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += raw[y * 9 + x] > raw[y * 9 + x + 1] ? "1" : "0";
    }
  }

  return {
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    perceptualHash: BigInt(`0b${bits}`).toString(16).padStart(16, "0"),
  };
}

export function perceptualHashDistance(left: string, right: string): number {
  let different = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (different) {
    distance += Number(different & BigInt(1));
    different >>= BigInt(1);
  }
  return distance;
}
