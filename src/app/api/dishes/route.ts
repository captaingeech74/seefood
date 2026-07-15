import { NextRequest } from "next/server";
import { fetchStreamingCandidates, finalizeWithGemini } from "@/lib/google";
import { getCorpusSnapshot, persistPipelineResult } from "@/lib/db";

// Gemini analysis of up to 10 images in one batched call, plus source fetches,
// can take up to ~30s on a cold miss. Vercel paid plan allows up to 300s.
export const maxDuration = 60;

// Streamed as newline-delimited JSON: {"dishes": DishPhoto[], "popularDishes"?: string[], "done": boolean}.
// Corpus-fresh restaurants get one line. Corpus misses get two: raw
// (unlabeled) Google photos first — PRD §4.5 "show best available source
// immediately, backfill" — then the final Gemini-labeled, sorted result.
// Pre-labeled owner photos (Menufy/DoorDash/schema.org) no longer appear in
// stage 1: they now go through the same ad-photo/duplicate quality pass as
// everything else before being shown, so they only land in the final line.
//
// The 100 cap here is a hard ceiling matching MAX_VISIBLE in
// TopDishesGrid.tsx, which reveals dishes progressively (30 initially,
// growing via infinite scroll) — this used to be capped at 20 with no way
// to see more at all, hiding real dishes (confirmed live: LRay's Kitchen
// has 36 real menu items behind this cap). Keep these two numbers in sync.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId");
  const restaurantName = searchParams.get("name") ?? "";
  const lat = parseFloat(searchParams.get("lat") ?? "0");
  const lng = parseFloat(searchParams.get("lng") ?? "0");
  const address = searchParams.get("address") ?? "";

  if (!placeId) {
    return new Response(JSON.stringify({ error: "placeId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (chunk: object) => controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));

      try {
        // ── Corpus-first: a fresh hit means zero external API calls ───────────
        const corpus = await getCorpusSnapshot(placeId).catch(() => null);
        if (corpus?.isFresh) {
          write({ dishes: corpus.photos.slice(0, 100), popularDishes: corpus.popularDishes, done: true });
          controller.close();
          return;
        }

        // Stage 1 — pre-labeled + raw Google photos, no Gemini call needed yet.
        const candidates = await fetchStreamingCandidates(placeId, restaurantName);
        if (!candidates) {
          write({ dishes: [], popularDishes: [], done: true });
          controller.close();
          return;
        }
        write({
          dishes: candidates.rawPhotoPlaceholders.slice(0, 100),
          done: false,
        });

        // Stage 2 — batched Gemini call + OCR + final scoring.
        const { photos, menuItems } = await finalizeWithGemini(candidates);

        // Persist before closing — Vercel serverless functions stop executing the
        // instant the stream closes, so this must be awaited, not fire-and-forget.
        await persistPipelineResult({
          placeId,
          restaurantName,
          lat,
          lng,
          address,
          photos,
          menuItems,
        }).catch((e) => console.error("[corpus] persist failed:", e));

        write({ dishes: photos.slice(0, 100), popularDishes: candidates.popularDishes, done: true });
        controller.close();
      } catch (e) {
        console.error("Dishes API error:", e);
        write({ error: "Failed to fetch dish photos", dishes: [], popularDishes: [], done: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
