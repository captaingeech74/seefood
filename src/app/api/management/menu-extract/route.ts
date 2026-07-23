import { NextRequest, NextResponse } from "next/server";
import { optimizeImage } from "@/lib/imageOptimization";
import { uploadPhotoBuffer } from "@/lib/storage";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const VISION_KEY = (process.env.VISION_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();

interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: string;
  confidence: "high" | "medium" | "low";
}

function parseGeminiItems(text: string): ExtractedItem[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  const rawItems = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set<string>();
  return rawItems.flatMap((raw) => {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 120) : "";
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!name || !key || seen.has(key)) return [];
    seen.add(key);
    const numericPrice = typeof raw.price === "number"
      ? raw.price
      : typeof raw.price === "string"
        ? Number(raw.price.replace(/[^0-9.]/g, ""))
        : NaN;
    return [{
      name,
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 500) : "",
      price: Number.isFinite(numericPrice) ? numericPrice : null,
      category: typeof raw.category === "string" ? raw.category.trim().slice(0, 80) : "Other",
      confidence: raw.confidence === "high" || raw.confidence === "low" ? raw.confidence : "medium",
    } satisfies ExtractedItem];
  }).slice(0, 150);
}

async function extractMenuPage(buffer: Buffer, contentType: string): Promise<{ items: ExtractedItem[]; unavailable: boolean }> {
  const prompt = `Read this restaurant menu page and extract every distinct item a customer can order.

Return strict JSON with this shape:
{"items":[{"name":"exact printed item name","description":"exact printed description or empty string","price":12.5,"category":"nearest printed section heading or Other","confidence":"high"}]}

Rules:
- Include food, drinks, cocktails, desserts, sides, and separately orderable add-ons.
- Do not include section headings as items.
- Do not invent missing words, ingredients, descriptions, or prices.
- Use null for a missing or unreadable price.
- Merge obvious wrapped lines belonging to one item.
- Ignore addresses, hours, social handles, disclaimers, and decorative text.
- Mark confidence low when the name itself is uncertain.
- Return JSON only.`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: contentType, data: buffer.toString("base64") } },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let unavailable = false;
  for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite"]) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        }
      );
      if (!response.ok) {
        if (response.status === 429 || response.status === 402) unavailable = true;
        console.error(`[management menu extract] ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
        continue;
      }
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim() ?? "";
      if (!text) continue;
      const items = parseGeminiItems(text);
      if (items.length) return { items, unavailable: false };
    } catch (error) {
      console.error(`[management menu extract] ${model} failed`, error);
    }
  }
  return { items: [], unavailable };
}

export async function POST(request: NextRequest) {
  if (!VISION_KEY) return NextResponse.json({ error: "Menu reading is not configured." }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("page");
  const placeId = form?.get("placeId");
  const pageNumber = Number(form?.get("pageNumber") || 1);
  if (!(file instanceof File) || typeof placeId !== "string" || !placeId.trim()) {
    return NextResponse.json({ error: "A menu page and restaurant are required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Please use a photo of the menu." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That page is too large. Please retake it closer to the menu." }, { status: 413 });
  }

  try {
    const optimized = await optimizeImage(Buffer.from(await file.arrayBuffer()));
    const extracted = await extractMenuPage(optimized.buffer, optimized.contentType);
    const items = extracted.items;
    if (extracted.unavailable) {
      return NextResponse.json(
        { error: "Automatic menu reading is temporarily unavailable. Your page is fine; SeeFood’s AI service needs attention." },
        { status: 503 }
      );
    }
    if (!items.length) {
      return NextResponse.json({ error: "No menu items could be read from this page. Try a brighter, straighter photo." }, { status: 422 });
    }
    const safePlace = placeId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const key = `management-menu-pages/${safePlace}/${Date.now()}-page-${Math.max(1, pageNumber)}.webp`;
    const pageUrl = await uploadPhotoBuffer(optimized.buffer, optimized.contentType, key);
    return NextResponse.json({ items, pageUrl, pageNumber });
  } catch (error) {
    console.error("[management menu extract] failed", error);
    return NextResponse.json({ error: "This menu page could not be processed." }, { status: 500 });
  }
}
