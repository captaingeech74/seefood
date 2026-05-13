/**
 * Shared URL → menu item name extractor.
 *
 * Fetches any URL (restaurant website, Yelp menu link, PDF link) and pulls
 * dish names out of schema.org LD+JSON structured data embedded in the page.
 *
 * Coverage: ~35–50% of restaurants with a website embed schema.org menu data.
 * Toast, Square, Squarespace, Wix, and Olo CMS platforms auto-generate it for SEO.
 *
 * Called by:
 *   - fetchMenuFromWebsite() in google.ts  (Place Details `website` field)
 *   - fetchYelpBusinessData() in yelp.ts   (Yelp business `attributes.menu_url`)
 */

export async function fetchMenuFromUrl(url: string): Promise<string[]> {
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

function parseSchemaOrgMenuItems(html: string): string[] {
  const results: string[] = [];

  // Extract every application/ld+json block in the page
  const pattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(html)) !== null) {
    try {
      results.push(...walkSchemaNode(JSON.parse(m[1])));
    } catch {
      // Malformed JSON — skip this block
    }
  }

  return (
    [...new Set(results)]
      .map((s) => s.trim())
      // Filter noise: must be 3–80 chars, no pure numbers
      .filter((s) => s.length > 2 && s.length < 80 && !/^\d+$/.test(s))
  );
}

/**
 * Recursively walks any schema.org node and collects MenuItem names.
 * Intentionally permissive — handles the many ways CMSes nest their menu data:
 *   Restaurant → hasMenu → Menu → hasMenuSection → MenuSection → hasMenuItem → MenuItem
 *   FoodEstablishment → menu → [ MenuItem, ... ]
 *   [ { @type: MenuItem, name: "..." }, ... ]
 */
function walkSchemaNode(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walkSchemaNode);

  const obj = node as Record<string, unknown>;
  const results: string[] = [];

  const type = String(obj["@type"] ?? "").toLowerCase();

  if (type === "menuitem" && typeof obj.name === "string" && obj.name.trim()) {
    results.push(obj.name.trim());
  }

  // Recurse into every object/array value regardless of the parent type
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object") {
      results.push(...walkSchemaNode(val));
    }
  }

  return results;
}
