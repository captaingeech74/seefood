/**
 * Shared URL → MenuItemData[] extractor.
 *
 * Fetches any URL (restaurant website, Yelp menu link) and pulls
 * dish names, descriptions, and photo URLs from schema.org LD+JSON.
 *
 * Coverage: ~35–50% of restaurants with a website embed schema.org menu data.
 * Toast, Square, Squarespace, Wix, and Olo CMSes auto-generate it for SEO.
 *
 * Called by:
 *   - google.ts  → restaurant's own website (Place Details `website` field)
 *   - yelp.ts    → Yelp business `attributes.menu_url`
 */

import { MenuItemData } from "./types";

export async function fetchMenuFromUrl(url: string): Promise<MenuItemData[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SeeFood/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseSchemaOrgMenuItems(html);
  } catch {
    return [];
  }
}

// ── Schema.org parser ─────────────────────────────────────────────────────────

function parseSchemaOrgMenuItems(html: string): MenuItemData[] {
  const results: MenuItemData[] = [];
  const pattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    try {
      results.push(...walkSchemaNode(JSON.parse(m[1])));
    } catch {
      // Malformed JSON block — skip
    }
  }

  // Deduplicate by lowercase name; filter noise
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key) || item.name.length < 3 || item.name.length > 80) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Recursively walks any schema.org node and collects MenuItem data.
 * Extracts name, description, and image for each MenuItem found.
 */
function walkSchemaNode(node: unknown): MenuItemData[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walkSchemaNode);

  const obj = node as Record<string, unknown>;
  const results: MenuItemData[] = [];
  const type = String(obj["@type"] ?? "").toLowerCase();

  if (type === "menuitem" && typeof obj.name === "string" && obj.name.trim()) {
    const item: MenuItemData = { name: obj.name.trim() };

    if (typeof obj.description === "string" && obj.description.trim()) {
      item.description = obj.description.trim().substring(0, 300);
    }

    // image can be a string, array of strings, or {url: string} object
    const img = obj.image;
    if (typeof img === "string" && img.startsWith("http")) {
      item.imageUrl = img;
    } else if (
      Array.isArray(img) &&
      typeof img[0] === "string" &&
      (img[0] as string).startsWith("http")
    ) {
      item.imageUrl = img[0] as string;
    } else if (img && typeof img === "object") {
      const imgObj = img as Record<string, unknown>;
      if (typeof imgObj.url === "string" && imgObj.url.startsWith("http")) {
        item.imageUrl = imgObj.url;
      }
    }

    results.push(item);
  }

  // Recurse into all object/array child values
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object") results.push(...walkSchemaNode(val));
  }
  return results;
}
