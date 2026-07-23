import { NextRequest, NextResponse } from "next/server";
import {
  getManagementMenu,
  saveManagementMenuImport,
  saveManagementPopularItems,
} from "@/lib/db";
import type { MenuItemData } from "@/lib/types";

interface PublishItem {
  name?: unknown;
  description?: unknown;
  price?: unknown;
}

function cleanItems(value: unknown): MenuItemData[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw: PublishItem) => {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 120) : "";
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!name || !key || seen.has(key)) return [];
    seen.add(key);
    const description = typeof raw.description === "string"
      ? raw.description.trim().slice(0, 500)
      : "";
    const price = typeof raw.price === "number" && Number.isFinite(raw.price)
      ? Math.max(0, Math.min(10000, raw.price))
      : undefined;
    return [{ name, description: description || undefined, price, source: "merchant" as const }];
  }).slice(0, 500);
}

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();
  if (!placeId) return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  try {
    return NextResponse.json({ items: await getManagementMenu(placeId) });
  } catch (error) {
    console.error("[management menu] read failed", error);
    return NextResponse.json({ error: "The management menu could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const placeId = typeof body?.placeId === "string" ? body.placeId.trim() : "";
  if (!placeId) return NextResponse.json({ error: "placeId is required" }, { status: 400 });

  try {
    if (body.action === "rank") {
      const names = Array.isArray(body.names)
        ? body.names.filter((name: unknown): name is string => typeof name === "string")
        : [];
      if (names.length > 7) {
        return NextResponse.json({ error: "Management may rank up to seven items." }, { status: 400 });
      }
      await saveManagementPopularItems(placeId, names);
      return NextResponse.json({ ok: true, count: names.length });
    }

    if (body.action === "publish") {
      const items = cleanItems(body.items);
      if (!items.length) {
        return NextResponse.json({ error: "At least one menu item is required." }, { status: 400 });
      }
      const pageUrls = Array.isArray(body.pageUrls)
        ? body.pageUrls.filter((url: unknown): url is string => typeof url === "string").slice(0, 20)
        : [];
      await saveManagementMenuImport({ placeId, items, pageUrls });
      return NextResponse.json({ ok: true, count: items.length });
    }

    return NextResponse.json({ error: "Unknown management menu action." }, { status: 400 });
  } catch (error) {
    console.error("[management menu] save failed", error);
    return NextResponse.json({ error: "The management menu could not be saved." }, { status: 500 });
  }
}
