import { NextRequest, NextResponse } from "next/server";
import { getGooglePhotosAndReviews } from "@/lib/google";
import { completeAcquisitionJob, getAcquisitionBatch, markSaturated, persistPipelineResult } from "@/lib/db";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const TIME_BUDGET_MS = 270_000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const batch = await getAcquisitionBatch(BATCH_SIZE);
  const results: Array<{ jobId: string; name: string; ok: boolean; photos?: number; error?: string }> = [];

  for (const target of batch) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
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
      await Promise.all([completeAcquisitionJob(target.jobId, true), markSaturated(target.placeId)]);
      results.push({ jobId: target.jobId, name: target.name, ok: true, photos: photos.length });
    } catch (error) {
      const message = String(error);
      await completeAcquisitionJob(target.jobId, false, message);
      results.push({ jobId: target.jobId, name: target.name, ok: false, error: message });
    }
  }

  return NextResponse.json({ processed: results.length, durationMs: Date.now() - startedAt, results });
}
