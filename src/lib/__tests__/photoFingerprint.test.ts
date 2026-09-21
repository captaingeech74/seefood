import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  canReactivateQuarantinedPhoto,
  fingerprintPhoto,
  isImageContentType,
  isTransientPhotoFetchStatus,
  perceptualHashDistance,
  shouldActivatePhotoObservation,
  providerPhotoAssetKey,
} from "../photoFingerprint";

describe("photo fingerprints", () => {
  it("recognizes provider size variants without merging different assets",()=>{
    expect(providerPhotoAssetKey('https://popmenucloud.com/cdn-cgi/image/width%3D600/a/dish.jpg'))
      .toBe(providerPhotoAssetKey('https://popmenucloud.com/cdn-cgi/image/width=1920/a/dish.jpg'));
    expect(providerPhotoAssetKey('https://d1w7312wesee68.cloudfront.net/token/resize:fit:720:720/plain/s3://toasttab/restaurants/x.jpg'))
      .toBe(providerPhotoAssetKey('https://s3.amazonaws.com/toasttab/restaurants/x.jpg'));
    expect(providerPhotoAssetKey('https://static-content.owner.com/a.jpg?w=48')).not.toBe(providerPhotoAssetKey('https://static-content.owner.com/b.jpg?w=48'));
    expect(providerPhotoAssetKey('https://unknown.example/a.jpg')).toBeNull();
    expect(canReactivateQuarantinedPhoto('same_provider_asset_variant','verified-hash')).toBe(false);
  });
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

  it("keeps new unverified acquisition candidates out of the live grid", () => {
    expect(shouldActivatePhotoObservation(undefined, null)).toBe(false);
    expect(shouldActivatePhotoObservation(false, null)).toBe(false);
    expect(shouldActivatePhotoObservation(true, null)).toBe(true);
    expect(shouldActivatePhotoObservation(false, "verified-hash")).toBe(true);
  });
});
