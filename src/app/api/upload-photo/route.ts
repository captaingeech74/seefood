import { NextRequest, NextResponse } from "next/server";
import { hasDuplicatePhoto, saveUserUploadedPhoto } from "@/lib/db";
import { uploadPhotoBuffer } from "@/lib/storage";
import { createHash } from "crypto";
import { optimizeImage } from "@/lib/imageOptimization";

// "Take Photo of Dish" (experimental — PRD's long-term user-contribution
// vision, scoped down: no accounts/moderation yet, just a real working
// upload). No auth exists to rate-limit by user, so size/type are the only
// guardrails; this is deliberately minimal per the "experimentation" framing.
export const maxDuration = 30;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("photo");
  const placeId = form.get("placeId");
  const dishName = form.get("dishName");
  const dishDescription = form.get("dishDescription");
  const isMenuMatch = form.get("isMenuMatch") === "true";
  const tierRaw = form.get("tier");
  const menuItemIdRaw = form.get("menuItemId");
  const contributorId = form.get("contributorId");

  if (!(file instanceof File) || typeof placeId !== "string" || !placeId) {
    return NextResponse.json({ error: "photo and placeId are required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (8MB max)" }, { status: 400 });
  }

  const original = Buffer.from(await file.arrayBuffer());
  const duplicateHash = createHash("sha256").update(original).digest("hex");
  if (await hasDuplicatePhoto(placeId, duplicateHash)) {
    return NextResponse.json({ error: "That photo is already on SeeFood." }, { status: 409 });
  }
  const optimized = await optimizeImage(original).catch(() => null);
  if (!optimized) return NextResponse.json({ error: "We could not process that image." }, { status: 422 });
  const key = `user-uploads/${placeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const url = await uploadPhotoBuffer(optimized.buffer, optimized.contentType, key);
  if (!url) {
    return NextResponse.json({ error: "Upload failed — please try again" }, { status: 502 });
  }

  const tier = (tierRaw === "1" || tierRaw === "2" || tierRaw === "3" ? parseInt(String(tierRaw), 10) : 2) as 1 | 2 | 3;
  const menuItemId = typeof menuItemIdRaw === "string" && menuItemIdRaw ? parseInt(menuItemIdRaw, 10) : undefined;

  const photo = await saveUserUploadedPhoto({
    placeId,
    originUrl: url,
    dishName: typeof dishName === "string" && dishName ? dishName : null,
    dishDescription: typeof dishDescription === "string" && dishDescription ? dishDescription : null,
    isMenuMatch,
    tier,
    menuItemId,
    width: optimized.width,
    height: optimized.height,
    contributorId: typeof contributorId === "string" ? contributorId.slice(0, 100) : undefined,
    duplicateHash,
  });

  if (!photo) return NextResponse.json({ error: "Saved the image but failed to record it — please retry" }, { status: 500 });
  return NextResponse.json({ photo });
}
