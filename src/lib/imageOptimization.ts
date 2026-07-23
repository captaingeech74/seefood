import sharp from "sharp";

const MAX_EDGE = 1600;
const WEBP_QUALITY = 84;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
}

/**
 * Normalizes orientation, strips bulky camera metadata, limits dimensions to
 * what a high-density phone display can use, and emits high-quality WebP.
 */
export async function optimizeImage(buffer: Buffer): Promise<OptimizedImage> {
  const result = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    contentType: "image/webp",
    extension: "webp",
    width: result.info.width,
    height: result.info.height,
  };
}

