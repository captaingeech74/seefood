import { NextRequest, NextResponse } from "next/server";
import { getR2SignedUrl } from "@/lib/storage";

// The stable app URL signs and redirects. The browser receives the image
// bytes directly from R2, removing Vercel from the bandwidth path.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });

  const signedUrl = await getR2SignedUrl(key);
  if (!signedUrl) return new Response("Photo fetch failed", { status: 502 });
  return NextResponse.redirect(signedUrl, {
    status: 307,
    headers: { "Cache-Control": "public, max-age=3300" },
  });
}
