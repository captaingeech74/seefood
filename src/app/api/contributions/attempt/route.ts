import { NextRequest, NextResponse } from "next/server";
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
    if (!target.behavioralPromptCandidate) {
      return NextResponse.json(
        { error: "This dish is not eligible for contribution measurement" },
        { status: 409 }
      );
    }
    const trafficClass = classifyContributionTraffic({
      entityStatus: target.entityStatus,
      requestedClass: req.headers.get("x-seefood-traffic-class"),
      userAgent: req.headers.get("user-agent"),
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
      targetClass: "behavioral_prompt_candidate",
    });
    await recordContributionFunnelEvent({
      attemptId,
      eventName,
      eventSource: "client",
      outcome,
    });
    return NextResponse.json({ recorded: true, trafficClass });
  } catch (error) {
    console.error("[contribution-funnel] receipt failed", error);
    return NextResponse.json(
      { error: "Contribution measurement is temporarily unavailable" },
      { status: 503 }
    );
  }
}
