import { notFound } from "next/navigation";
import { getPlaceIdBySlug } from "@/lib/db";
import SeeFoodApp from "@/components/SeeFoodApp";

/** PRD §4.4 — stable shareable restaurant URL, e.g. /r/richies-diner-temecula. */
export default async function RestaurantSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const placeId = await getPlaceIdBySlug(slug).catch(() => null);
  if (!placeId) notFound();

  return <SeeFoodApp initialPlaceId={placeId} />;
}
