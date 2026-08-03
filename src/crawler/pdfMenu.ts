import { createHash } from "node:crypto";
import type { MenuItemData } from "../lib/types";

export type PdfMenuResult = {
  items: MenuItemData[];
  method: "pdf_text" | "paddleocr_vl" | "none";
  sha256: string;
  byteCount: number;
  pageCount: number;
  textCharacterCount: number;
  error?: string;
};

const PRICE_AT_END = /(?:\s|^)(?:\$|USD\s*)?(\d{1,3}(?:\.\d{2}))\s*$/i;
const PRICE_ANYWHERE = /(?:\$|USD\s*)\s*\d{1,3}(?:\.\d{2})?/i;
const NON_ITEM = /^(menu|food|drinks?|beverages?|breakfast|brunch|lunch|dinner|desserts?|appetizers?|entrees?|sides?|salads?|soups?|sandwiches?|burgers?|pizza|pastas?|cocktails?|wine|beer|prices?|hours?|order online|catering)$/i;

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/[`|]+/g, " ").replace(/\s+/g, " ").trim();
}

function likelyDishTitle(value: string): boolean {
  if (value.length < 2 || value.length > 90 || NON_ITEM.test(value)) return false;
  if (PRICE_ANYWHERE.test(value) || /^(?:and|with|served|topped|choice|includes?|add|extra|&)/i.test(value)) return false;
  const letters = value.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 2) return false;
  const capitals = value.match(/[A-Z]/g)?.length ?? 0;
  const words = value.split(/\s+/);
  return words.length <= 10 && (capitals / letters.length >= 0.65 || words.every((word) => !/[a-z]/.test(word[0] ?? "")));
}

/** Parse the common restaurant-menu shape: dish name, optional description, price. */
export function parseMenuText(text: string): MenuItemData[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const results: MenuItemData[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const priceMatch = line.match(PRICE_AT_END);
    if (!priceMatch) continue;
    let rawName = clean(line.slice(0, priceMatch.index));
    if (PRICE_ANYWHERE.test(rawName)) continue;
    const previous = lines[index - 1];
    if (previous && likelyDishTitle(previous) && (
      rawName.split(/\s+/).length > 7 ||
      /^[a-z&]/.test(rawName) ||
      /^(?:served|topped|with|our|a |an |choice|includes?)/i.test(rawName)
    )) rawName = previous;
    if (rawName.length < 2 || rawName.length > 120 || NON_ITEM.test(rawName)) continue;
    if (/^(add|extra|substitute|choice of|market price|mp\b|&)/i.test(rawName)) continue;
    if ((rawName.match(/[A-Za-z]/g) ?? []).length < 2) continue;
    const item: MenuItemData = {
      name: rawName.replace(/[.·•\-–—]+$/g, "").trim(),
      price: Number(priceMatch[1]),
      source: "menu_ocr",
    };
    const following = lines[index + 1];
    if (following && !PRICE_ANYWHERE.test(following) && following.length >= 8 && following.length <= 350 && !NON_ITEM.test(following)) {
      item.description = following;
    }
    results.push(item);
  }
  const deduped = new Map<string, MenuItemData>();
  for (const item of results) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()].slice(0, 500);
}

/** PaddleOCR-VL preserves document reading order and Markdown headings. Many
 * restaurant PDFs intentionally omit prices, so calorie-labelled dishes are
 * still useful menu evidence even when there is no dollar amount. */
export function parseVisionMenuText(text: string): MenuItemData[] {
  const results: MenuItemData[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = clean(rawLine.replace(/^#{1,6}\s*/, ""));
    const calorie = line.match(/^(.*?)(?:\s+|(?<=\D))(\d{1,4}(?:\s*[-–]\s*\d{1,4})?)\s*CAL(?:ORIES)?\b/i);
    if (!calorie) continue;
    let name = clean(calorie[1])
      .replace(/\b(?:BRISKET UPCHARGE|CHOPPED OR SLICED|WITH .*)$/i, "")
      .replace(/\s+\d{1,4}\s*[-–]\s*$/, "")
      .trim();
    if (!likelyDishTitle(name) || /^(?:add extras?|choice of|calories?|feeds?\b)/i.test(name)) continue;
    results.push({ name, source: "menu_ocr" });
  }
  const deduped = new Map<string, MenuItemData>();
  for (const item of results) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()].slice(0, 500);
}

function menuQuality(items: MenuItemData[]): number {
  if (!items.length) return 0;
  const plausible = items.filter((item) => likelyDishTitle(item.name)).length;
  return plausible / items.length;
}

async function extractPdfText(bytes: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 30); pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const positioned = (content.items as Array<Record<string, unknown>>)
      .filter((item) => typeof item.str === "string" && Array.isArray(item.transform))
      .map((item) => ({
        text: clean(item.str as string),
        x: Number((item.transform as number[])[4] ?? 0),
        y: Number((item.transform as number[])[5] ?? 0),
      }))
      .filter((item) => item.text);
    const rows = new Map<number, typeof positioned>();
    for (const item of positioned) {
      const key = Math.round(item.y / 3) * 3;
      const row = rows.get(key) ?? [];
      row.push(item);
      rows.set(key, row);
    }
    pageTexts.push(
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
        .join("\n")
    );
  }
  return { text: pageTexts.join("\n"), pages: document.numPages };
}

async function paddleOcrFallback(bytes: Buffer): Promise<{ text: string; pages: number } | null> {
  const endpoint = (process.env.PADDLEOCR_VL_URL ?? "http://127.0.0.1:8119").replace(/\/$/, "");
  if (!endpoint) return null;
  try {
    const response = await fetch(`${endpoint}/document/parse`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      signal: AbortSignal.timeout(15 * 60_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { markdown?: string; text?: string; pageCount?: number };
    const text = payload.markdown ?? payload.text ?? "";
    return text ? { text, pages: payload.pageCount ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function extractPdfMenu(url: string): Promise<PdfMenuResult> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "application/pdf,application/octet-stream;q=0.8" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 25 * 1024 * 1024) throw new Error("pdf_too_large");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 25 * 1024 * 1024) throw new Error("pdf_too_large");
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("not_a_pdf");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const embedded = await extractPdfText(bytes);
    let items = parseMenuText(embedded.text);
    const embeddedQuality = menuQuality(items);
    if (items.length >= 2 && embeddedQuality >= 0.45) {
      return { items, method: "pdf_text", sha256, byteCount: bytes.length, pageCount: embedded.pages, textCharacterCount: embedded.text.length };
    }
    // Whole-document vision parsing is expensive. Restaurant menus are usually
    // short; oversized brochures stay recorded for a later, explicitly bounded pass.
    const ocr = embedded.pages <= 12 ? await paddleOcrFallback(bytes) : null;
    if (ocr) {
      const ocrItems = mergeParsedItems(parseMenuText(ocr.text), parseVisionMenuText(ocr.text));
      if (menuQuality(ocrItems) >= embeddedQuality || items.length < 2) {
        items = ocrItems;
        return { items, method: "paddleocr_vl", sha256, byteCount: bytes.length, pageCount: ocr.pages || embedded.pages, textCharacterCount: ocr.text.length };
      }
    }
    return { items, method: items.length ? "pdf_text" : "none", sha256, byteCount: bytes.length, pageCount: embedded.pages, textCharacterCount: embedded.text.length };
  } catch (error) {
    return { items: [], method: "none", sha256: "", byteCount: 0, pageCount: 0, textCharacterCount: 0, error: String(error instanceof Error ? error.message : error) };
  }
}

function mergeParsedItems(...batches: MenuItemData[][]): MenuItemData[] {
  const merged = new Map<string, MenuItemData>();
  for (const item of batches.flat()) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const current = merged.get(key);
    if (!current || Number(Boolean(item.price)) + Number(Boolean(item.description)) > Number(Boolean(current.price)) + Number(Boolean(current.description))) {
      merged.set(key, item);
    }
  }
  return [...merged.values()];
}
