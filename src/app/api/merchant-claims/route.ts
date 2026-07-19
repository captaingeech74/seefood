import { NextRequest, NextResponse } from "next/server";
import { createMerchantClaim } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { placeId, contactName, email, phone, businessRole, plan, authorityAttested, paymentAttested } = body;
  if (typeof placeId !== "string" || !placeId || typeof contactName !== "string" || !contactName.trim()) {
    return NextResponse.json({ error: "Restaurant and contact name are required" }, { status: 400 });
  }
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid business email" }, { status: 400 });
  }
  if (typeof businessRole !== "string" || !businessRole.trim()) {
    return NextResponse.json({ error: "Your role is required" }, { status: 400 });
  }
  if (plan !== "standard" && plan !== "growth") {
    return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
  }
  if (authorityAttested !== true || paymentAttested !== true) {
    return NextResponse.json({ error: "Both attestations are required" }, { status: 400 });
  }
  const claimId = await createMerchantClaim({
    placeId,
    contactName: contactName.trim().slice(0, 100),
    email: email.trim().slice(0, 200),
    phone: typeof phone === "string" ? phone.trim().slice(0, 40) : undefined,
    businessRole: businessRole.trim().slice(0, 80),
    plan,
    authorityAttested,
    paymentAttested,
  });
  if (!claimId) return NextResponse.json({ error: "Could not submit claim" }, { status: 500 });
  return NextResponse.json({ claimId, status: "pending" });
}
