import { NextResponse } from "next/server";
import { merchantProviderAvailability } from "@/lib/merchantProviders";

export async function GET() {
  return NextResponse.json({ providers: merchantProviderAvailability() }, { headers: { "Cache-Control": "no-store" } });
}
