import { NextRequest } from "next/server";
import { getR2ObjectStream } from "@/lib/storage";

// Proxies R2 object bytes the same way /api/photo proxies Google's — R2's
// "public bucket" feature needs a dashboard-provisioned pub-<hash>.r2.dev
// domain or a custom domain, neither of which exists here, so uploaded
// photos (user uploads, fixture ingests) are served through our own S3
// GetObject call instead. Client requests /api/r2-photo?key=<object key>.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });

  const result = await getR2ObjectStream(key);
  if (!result) return new Response("Photo fetch failed", { status: 502 });

  return new Response(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
