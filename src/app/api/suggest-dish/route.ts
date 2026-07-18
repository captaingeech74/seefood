import { NextRequest, NextResponse } from "next/server";
import { saveUserUploadedPhoto, saveMenuItems, findExistingMenuItemByName, hasDuplicatePhoto } from "@/lib/db";
import { uploadPhotoBuffer } from "@/lib/storage";
import { createHash } from "crypto";

// "Add a Missing Photo or Menu Item" (grid view, hidden under the
// restaurant-name caret) — for a diner at the table with a dish SeeFood has
// no photo or menu record of: a name, a photo, and an implicit attestation
// that they were actually served it. No accounts exist, so this is the only
// integrity gate; the created photo/menu item is otherwise treated exactly
// like any other real content.
//
// Duplicate handling is automatic, not the diner's job: if the typed name
// matches an existing menu item for this restaurant (any source — Gemini-
// identified, Notion-imported, an earlier suggestion), the new photo is
// attached to THAT item as another variant instead of spawning a duplicate
// dish (see findExistingMenuItemByName).
//
// Delight feature: if the diner leaves the description blank, one quick
// Gemini vision pass looks at their photo and writes one for them.
export const maxDuration = 30;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const VISION_KEY = (process.env.VISION_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();

async function generateDescription(buffer: Buffer, contentType: string, dishName: string): Promise<string | null> {
  const prompt = `A diner is adding "${dishName}" to a restaurant's menu on SeeFood, with this photo. Write ONE appetizing sentence describing the dish — ingredients, preparation, or how it's served, based on what's visible in the photo. Respond with ONLY the sentence, no quotes, no markdown, no preamble.`;
  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: contentType, data: buffer.toString("base64") } }] }],
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
  };
  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (text) return text.replace(/^["']|["']$/g, "");
    } catch {
      continue;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("photo");
  const placeId = form.get("placeId");
  const dishNameRaw = form.get("dishName");
  const dishDescriptionRaw = form.get("dishDescription");
  const attested = form.get("attested");
  const contributorId = form.get("contributorId");

  if (!(file instanceof File) || typeof placeId !== "string" || !placeId) {
    return NextResponse.json({ error: "photo and placeId are required" }, { status: 400 });
  }
  if (typeof dishNameRaw !== "string" || !dishNameRaw.trim()) {
    return NextResponse.json({ error: "Dish name is required" }, { status: 400 });
  }
  if (attested !== "true") {
    return NextResponse.json({ error: "You must confirm this is a real menu item" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (8MB max)" }, { status: 400 });
  }

  const dishName = dishNameRaw.trim().slice(0, 60);
  let dishDescription = typeof dishDescriptionRaw === "string" ? dishDescriptionRaw.trim().slice(0, 300) : "";

  const buffer = Buffer.from(await file.arrayBuffer());
  const duplicateHash = createHash("sha256").update(buffer).digest("hex");
  if (await hasDuplicatePhoto(placeId, duplicateHash)) {
    return NextResponse.json({ error: "That photo is already on SeeFood." }, { status: 409 });
  }
  const ext = file.type.split("/")[1]?.split("+")[0] || "jpg";
  const key = `user-uploads/${placeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const [url, aiDescription] = await Promise.all([
    uploadPhotoBuffer(buffer, file.type, key),
    dishDescription ? Promise.resolve(null) : generateDescription(buffer, file.type, dishName),
  ]);
  if (!url) {
    return NextResponse.json({ error: "Upload failed — please try again" }, { status: 502 });
  }
  const aiWrote = !dishDescription && !!aiDescription;
  if (aiWrote) dishDescription = aiDescription!;

  const existingMenuItemId = await findExistingMenuItemByName(placeId, dishName);
  let menuItemId = existingMenuItemId ?? undefined;
  if (!existingMenuItemId) {
    const nameToId = await saveMenuItems(placeId, [
      { name: dishName, description: dishDescription || undefined, source: "user_suggested" },
    ]);
    menuItemId = nameToId.get(dishName);
  }

  const photo = await saveUserUploadedPhoto({
    placeId,
    originUrl: url,
    dishName,
    dishDescription: dishDescription || null,
    isMenuMatch: true,
    tier: 1,
    menuItemId,
    width: 1200,
    height: 1200,
    contributorId: typeof contributorId === "string" ? contributorId.slice(0, 100) : undefined,
    duplicateHash,
  });

  if (!photo) return NextResponse.json({ error: "Saved the image but failed to record it — please retry" }, { status: 500 });
  return NextResponse.json({ photo, aiWrote });
}
