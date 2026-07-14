import { NextRequest, NextResponse } from "next/server";
import { incrementLoveCount } from "@/lib/db";

/** "I Loved This" (experimental) — POST { photoId }. See incrementLoveCount for the corpus-id constraint. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const photoId = body?.photoId;
  if (typeof photoId !== "string") {
    return NextResponse.json({ error: "photoId is required" }, { status: 400 });
  }

  const loveCount = await incrementLoveCount(photoId);
  if (loveCount === null) {
    return NextResponse.json({ error: "Could not love this photo yet — try again after the page settles." }, { status: 409 });
  }
  return NextResponse.json({ loveCount });
}
