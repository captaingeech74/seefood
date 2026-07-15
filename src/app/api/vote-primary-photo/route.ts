import { NextRequest, NextResponse } from "next/server";
import { incrementPrimaryVotes } from "@/lib/db";

/** Thumbs-up a non-primary same-dish variant — POST { photoId }. See incrementPrimaryVotes. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const photoId = body?.photoId;
  if (typeof photoId !== "string") {
    return NextResponse.json({ error: "photoId is required" }, { status: 400 });
  }

  const primaryVotes = await incrementPrimaryVotes(photoId);
  if (primaryVotes === null) {
    return NextResponse.json({ error: "Could not vote for this photo yet — try again after the page settles." }, { status: 409 });
  }
  return NextResponse.json({ primaryVotes });
}
