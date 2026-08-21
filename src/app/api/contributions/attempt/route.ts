import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createContributionAttempt,
  getCurrentContributionTarget,
  recordContributionFunnelEvent,
} from "@/lib/db";
import {
  CLIENT_CONTRIBUTION_EVENTS,
  CONTRIBUTION_EXPERIMENT,
  CONTRIBUTION_VARIANT,
  classifyContributionTraffic,
  classifyContributionTarget,
  clientOutcomeAllowed,
  isUuid,
  type ClientContributionEvent,
} from "@/lib/contributionFunnel";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const attemptId = body?.attemptId;
  const eventName = body?.eventName as ClientContributionEvent | undefined;
  const outcome = typeof body?.outcome === "string" ? body.outcome : "";
  const visitorId =
    typeof body?.visitorId === "string" ? body.visitorId.slice(0, 100) : "";
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : "";
  const restaurantId =
    typeof body?.restaurantId === "string" ? body.restaurantId.slice(0, 180) : "";
  const menuItemId = Number(body?.menuItemId);

  if (
    !isUuid(attemptId) ||
    !eventName ||
    !CLIENT_CONTRIBUTION_EVENTS.has(eventName) ||
    !clientOutcomeAllowed(eventName, outcome) ||
    !visitorId ||
    !sessionId ||
    !restaurantId ||
    !Number.isSafeInteger(menuItemId)
  ) {
    return NextResponse.json({ error: "Invalid contribution receipt" }, { status: 400 });
  }

  try {
    const target = await getCurrentContributionTarget(restaurantId, menuItemId);
    if (!target) {
      return NextResponse.json({ error: "That menu item is no longer current" }, { status: 409 });
    }
    const trafficClass = classifyContributionTraffic({
      entityStatus: target.entityStatus,
      requestedClass: new Set(
        (process.env.SEEFOOD_INTERNAL_VISITOR_HASHES ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      ).has(createHash("sha256").update(visitorId).digest("hex"))
        ? "staff"
        : null,
      userAgent: req.headers.get("user-agent"),
    });
    const { targetClass, analysisEligibility } = classifyContributionTarget({
      behavioralPromptCandidate: target.behavioralPromptCandidate,
      trafficClass,
    });
    await createContributionAttempt({
      attemptId,
      visitorId,
      sessionId,
      restaurantId,
      menuItemId,
      trafficClass,
      entityStatus: target.entityStatus,
      experimentKey: CONTRIBUTION_EXPERIMENT,
      variantKey: CONTRIBUTION_VARIANT,
      targetClass,
      analysisEligibility,
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName: "analysis_eligibility_decision",
      eventSource: "server",
      outcome:
        analysisEligibility === "eligible_external"
          ? "eligible"
          : analysisEligibility === "unverified"
            ? "unverified"
            : "ineligible",
    }).catch((error) =>
      console.error("[contribution-funnel] eligibility receipt failed", error)
    );
    await recordContributionFunnelEvent({
      attemptId,
      eventName,
      eventSource: "client",
      outcome,
    }).catch((error) =>
      console.error("[contribution-funnel] client receipt failed", error)
    );
    return NextResponse.json({ recorded: true, trafficClass, targetClass });
  } catch (error) {
    console.error("[contribution-funnel] receipt failed", error);
    return NextResponse.json(
      { error: "Contribution measurement is temporarily unavailable" },
      { status: 503 }
    );
  }
}
