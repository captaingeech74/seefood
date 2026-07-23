import { NextRequest, NextResponse } from "next/server";
import { getMemberProfile } from "@/lib/db";

export async function GET(request: NextRequest) {
  const visitorId = request.nextUrl.searchParams.get("visitorId")?.trim();
  if (!visitorId || visitorId.length > 120) {
    return NextResponse.json({ error: "A visitor ID is required." }, { status: 400 });
  }
  const profile = await getMemberProfile(visitorId);
  return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
}

