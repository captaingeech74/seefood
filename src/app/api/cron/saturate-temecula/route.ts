import { NextRequest, NextResponse } from "next/server";
import { getGooglePhotosAndReviews } from "@/lib/google";
import { getSaturationBatch, markSaturated, persistPipelineResult } from "@/lib/db";

// Vercel Cron (vercel.json) hits this on a schedule — Track A of the
// two-track saturation plan (see DECISIONS.md "Removing the founder as the
// crawl bottleneck"). This track only needs website/Google/Gemini, none of
// which need a residential IP, so it runs entirely in Vercel's cloud with
// zero manual involvement. Track B (DoorDash/Grubhub) still needs the Mac
// scheduler — see scripts/mac/.
export const maxDuration = 300;

const BATCH_SIZE = 10;
const TIME_BUDGET_MS = 270_000; // leave headroom under the 300s function ceiling

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const batch = await getSaturationBatch(BATCH_SIZE);
  const results: Array<{ placeId: string; name: string; ok: boolean; photos?: number; error?: string }> = [];

  for (const target of batch) {
    if (Date.now() - start > TIME_BUDGET_MS) break; // next invocation picks up where this left off
    try {
      const { photos, menuItems } = await getGooglePhotosAndReviews(target.placeId, target.name);
      await persistPipelineResult({
        placeId: target.placeId,
        restaurantName: target.name,
        lat: target.lat,
        lng: target.lng,
        address: target.address,
        photos,
        menuItems,
      });
      await markSaturated(target.placeId);
      results.push({ placeId: target.placeId, name: target.name, ok: true, photos: photos.length });
    } catch (e) {
      results.push({ placeId: target.placeId, name: target.name, ok: false, error: String(e) });
    }
  }

  return NextResponse.json({
    processed: results.length,
    remaining_in_batch: batch.length - results.length,
    durationMs: Date.now() - start,
    results,
  });
}
