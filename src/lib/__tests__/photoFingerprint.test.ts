import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  canReactivateQuarantinedPhoto,
  fingerprintPhoto,
  isImageContentType,
  isTransientPhotoFetchStatus,
  perceptualHashDistance,
} from "../photoFingerprint";

describe("photo fingerprints", () => {
  it("uses exact bytes for automatic identity", async () => {
    const image = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: { r: 220, g: 80, b: 40 },
      },
    }).jpeg().toBuffer();

    const first = await fingerprintPhoto(image);
    const second = await fingerprintPhoto(image);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.perceptualHash).toBe(second.perceptualHash);
  });

  it("keeps perceptual matching diagnostic and measurable", () => {
    expect(perceptualHashDistance("0000000000000000", "0000000000000003")).toBe(2);
  });

  it("rejects HTML before image analysis", () => {
    expect(isImageContentType("image/jpeg")).toBe(true);
    expect(isImageContentType("image/webp; charset=binary")).toBe(true);
    expect(isImageContentType("text/html")).toBe(false);
    expect(isImageContentType(null)).toBe(false);
  });

  it("does not classify rate limits or upstream outages as bad photos", () => {
    expect(isTransientPhotoFetchStatus(429)).toBe(true);
    expect(isTransientPhotoFetchStatus(503)).toBe(true);
    expect(isTransientPhotoFetchStatus(404)).toBe(false);
  });

  it("does not reactivate a quarantined photo on an unverified observation", () => {
    expect(canReactivateQuarantinedPhoto("non_image_text/html", null)).toBe(false);
    expect(canReactivateQuarantinedPhoto("exact_content_duplicate", undefined)).toBe(false);
    expect(canReactivateQuarantinedPhoto("non_image_text/html", "abc123")).toBe(true);
    expect(canReactivateQuarantinedPhoto(null, null)).toBe(true);
  });
});
