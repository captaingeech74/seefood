import { NextRequest, NextResponse } from "next/server";
import { incrementPhotoView, recordAppEvent } from "@/lib/db";
import type { AnalyticsEventName } from "@/lib/analytics";

const EVENT_NAMES = new Set<AnalyticsEventName>(["app_open", "love", "share", "photo_add", "photo_view"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const eventName = body?.eventName as AnalyticsEventName | undefined;
  const visitorId = typeof body?.visitorId === "string" ? body.visitorId.slice(0, 100) : "";
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId.slice(0, 180) : undefined;
  const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined;

  if (!eventName || !EVENT_NAMES.has(eventName) || !visitorId) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  await recordAppEvent({ eventName, visitorId, restaurantId, metadata }).catch(() => {});
  if (eventName === "photo_view") {
    const photoId = Number(String(metadata?.photoId ?? "").replace(/^corpus-/, ""));
    if (Number.isFinite(photoId)) {
      await incrementPhotoView(photoId).catch(() => {});
    }
  }
  return new NextResponse(null, { status: 204 });
}
