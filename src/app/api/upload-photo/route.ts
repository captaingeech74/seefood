import { NextRequest, NextResponse } from "next/server";
import {
  getContributionPhotoByAttempt,
  getContributionAttempt,
  getCurrentContributionTarget,
  hasDuplicatePhoto,
  recordContributionFunnelEvent,
  savePendingKnownDishPhoto,
  updateContributionAttempt,
} from "@/lib/db";
import { uploadPhotoBuffer } from "@/lib/storage";
import { createHash } from "crypto";
import { optimizeImage } from "@/lib/imageOptimization";
import {
  CONTRIBUTION_EXPERIMENT,
  CONTRIBUTION_RIGHTS_VERSION,
  CONTRIBUTION_VARIANT,
  contributionAttemptMatches,
  isUuid,
} from "@/lib/contributionFunnel";

// Known-current-dish contribution intake. The client supplies a stable menu
// item and a versioned rights grant; the resulting record stays inactive and
// unpublished until moderation, item matching, and duplicate review pass.
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
  const sessionId = form.get("sessionId");
  const attemptId = form.get("attemptId");
  const rightsVersion = form.get("rightsVersion");

  if (
    !(file instanceof File) ||
    typeof placeId !== "string" ||
    !placeId ||
    !isUuid(attemptId) ||
    rightsVersion !== CONTRIBUTION_RIGHTS_VERSION
  ) {
    return NextResponse.json(
      { error: "photo, current dish, attempt, and photo rights are required" },
      { status: 400 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (8MB max)" }, { status: 400 });
  }

  const menuItemId =
    typeof menuItemIdRaw === "string" && menuItemIdRaw
      ? Number(menuItemIdRaw)
      : NaN;
  if (!Number.isSafeInteger(menuItemId)) {
    return NextResponse.json({ error: "A current menu item is required" }, { status: 400 });
  }

  try {
    const attempt = await getContributionAttempt(attemptId);
    if (
      !attempt ||
      !contributionAttemptMatches(attempt, {
        restaurantId: placeId,
        menuItemId,
        visitorId: typeof contributorId === "string" ? contributorId : "",
        sessionId: typeof sessionId === "string" ? sessionId : "",
        experimentKey: CONTRIBUTION_EXPERIMENT,
        variantKey: CONTRIBUTION_VARIANT,
        surface: "known_dish",
        targetClass: "behavioral_prompt_candidate",
      })
    ) {
      return NextResponse.json(
        { error: "This upload does not match its original dish" },
        { status: 409 }
      );
    }
    const existing = await getContributionPhotoByAttempt(attemptId);
    if (existing) {
      return NextResponse.json({
        receipt: {
          attemptId,
          status: existing.moderationStatus ?? "pending",
          idempotentReplay: true,
        },
      });
    }
    const target = await getCurrentContributionTarget(placeId, menuItemId);
    if (!target) {
      return NextResponse.json({ error: "That menu item is no longer current" }, { status: 409 });
    }
    if (!target.behavioralPromptCandidate) {
      return NextResponse.json(
        { error: "This dish is no longer eligible for contributions" },
        { status: 409 }
      );
    }
    await updateContributionAttempt({
      attemptId,
      status: "upload_received",
      rightsVersion: CONTRIBUTION_RIGHTS_VERSION,
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "rights_grant_recorded",
      eventSource: "server",
      outcome: "observed",
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "server_upload_received",
      eventSource: "server",
      outcome: "observed",
    });
  } catch (error) {
    console.error("[contribution-funnel] authoritative receipt failed", error);
    return NextResponse.json(
      { error: "Upload audit is temporarily unavailable; please retry" },
      { status: 503 }
    );
  }

  const original = Buffer.from(await file.arrayBuffer());
  const duplicateHash = createHash("sha256").update(original).digest("hex");
  if (await hasDuplicatePhoto(placeId, duplicateHash)) {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "duplicate_result",
      eventSource: "server",
      outcome: "duplicate",
    }).catch((error) =>
      console.error("[contribution-funnel] duplicate receipt failed", error)
    );
    await updateContributionAttempt({ attemptId, status: "rejected" }).catch(() => {});
    return NextResponse.json({ error: "That photo is already on SeeFood." }, { status: 409 });
  }
  try {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "duplicate_result",
      eventSource: "server",
      // The synchronous SHA check can reject an exact duplicate, but it cannot
      // honestly clear perceptual/near duplicates. Keep that review pending.
      outcome: "pending",
    });
  } catch {
    return NextResponse.json(
      { error: "Upload audit is temporarily unavailable; please retry" },
      { status: 503 }
    );
  }
  const optimized = await optimizeImage(original).catch(() => null);
  if (!optimized) {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "server_optimization_result",
      eventSource: "server",
      outcome: "failure",
    }).catch((error) =>
      console.error("[contribution-funnel] optimization failure receipt failed", error)
    );
    await updateContributionAttempt({ attemptId, status: "client_failed" }).catch(() => {});
    return NextResponse.json({ error: "We could not process that image." }, { status: 422 });
  }
  try {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "server_optimization_result",
      eventSource: "server",
      outcome: "success",
    });
  } catch {
    return NextResponse.json(
      { error: "Upload audit is temporarily unavailable; please retry" },
      { status: 503 }
    );
  }
  const key = `user-uploads/${placeId}/${attemptId}.webp`;

  const url = await uploadPhotoBuffer(optimized.buffer, optimized.contentType, key);
  if (!url) {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "storage_result",
      eventSource: "server",
      outcome: "failure",
    }).catch((error) =>
      console.error("[contribution-funnel] storage failure receipt failed", error)
    );
    await updateContributionAttempt({ attemptId, status: "storage_failed" }).catch(() => {});
    return NextResponse.json({ error: "Upload failed — please try again" }, { status: 502 });
  }
  try {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "storage_result",
      eventSource: "server",
      outcome: "success",
    });
  } catch {
    return NextResponse.json(
      { error: "Saved securely, but audit recording failed; please retry" },
      { status: 503 }
    );
  }

  const tier = (tierRaw === "1" || tierRaw === "2" || tierRaw === "3" ? parseInt(String(tierRaw), 10) : 2) as 1 | 2 | 3;
  const target = await getCurrentContributionTarget(placeId, menuItemId);
  if (!target || !target.behavioralPromptCandidate) {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "post_storage_target_result",
      eventSource: "server",
      outcome: "failure",
    }).catch((error) =>
      console.error("[contribution-funnel] target invalidation receipt failed", error)
    );
    await updateContributionAttempt({ attemptId, status: "record_failed" }).catch(() => {});
    return NextResponse.json({ error: "That menu item is no longer current" }, { status: 409 });
  }
  try {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "post_storage_target_result",
      eventSource: "server",
      outcome: "success",
    });
  } catch {
    return NextResponse.json(
      { error: "Saved securely, but audit recording failed; please retry" },
      { status: 503 }
    );
  }

  const photo = await savePendingKnownDishPhoto({
    attemptId,
    rightsVersion: CONTRIBUTION_RIGHTS_VERSION,
    placeId,
    originUrl: url,
    dishName: typeof dishName === "string" && dishName ? dishName : null,
    dishDescription: typeof dishDescription === "string" && dishDescription ? dishDescription : null,
    isMenuMatch,
    tier,
    menuItemId,
    canonicalDishId: target.canonicalDishId,
    width: optimized.width,
    height: optimized.height,
    contributorId: typeof contributorId === "string" ? contributorId.slice(0, 100) : undefined,
    duplicateHash,
  });

  if (!photo) {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "photo_record_result",
      eventSource: "server",
      outcome: "failure",
    }).catch((error) =>
      console.error("[contribution-funnel] photo-record failure receipt failed", error)
    );
    await updateContributionAttempt({ attemptId, status: "record_failed" }).catch(() => {});
    return NextResponse.json({ error: "Saved the image but failed to record it — please retry" }, { status: 500 });
  }
  try {
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "photo_record_result",
      eventSource: "server",
      outcome: "success",
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "moderation_result",
      eventSource: "server",
      outcome: "pending",
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "item_match_result",
      eventSource: "server",
      outcome: "pending",
    });
    await updateContributionAttempt({ attemptId, status: "pending_review" });
  } catch (error) {
    console.error("[contribution-funnel] final receipt failed", error);
    return NextResponse.json(
      { error: "Your photo is safely pending review, but its receipt is incomplete" },
      { status: 503 }
    );
  }
  return NextResponse.json({
    receipt: { attemptId, status: "pending_review", idempotentReplay: false },
  });
}
