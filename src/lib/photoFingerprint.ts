import { createHash } from "node:crypto";
import sharp from "sharp";

export interface PhotoFingerprint {
  contentHash: string;
  perceptualHash: string;
}

export function isImageContentType(contentType: string | null): boolean {
  return !!contentType?.toLowerCase().startsWith("image/");
}

export function isTransientPhotoFetchStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
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
