import * as cheerio from "cheerio";

const normalize = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Deliberately narrow automatic identity proof. A directory/multiple branches
 * is not proof that the menu applies to the requested location. */
export function structuredLocationProof(html: string, name: string, address?: string): string | undefined {
  if (!address) return;
  const $ = cheerio.load(html);
  const venues: any[] = [];
  function visit(value: any) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((t: string) => /^(Restaurant|CafeOrCoffeeShop|Bakery|BarOrPub|FoodEstablishment|FastFoodRestaurant)$/.test(t))) venues.push(value);
    Object.values(value).forEach(visit);
  }
  $('script[type="application/ld+json"]').each((_, el) => { try { visit(JSON.parse($(el).text())); } catch {} });
  const identities = new Map<string, any>();
  for (const venue of venues) identities.set(JSON.stringify([venue.name, venue.address]), venue);
  if (identities.size !== 1) return;
  const venue = [...identities.values()][0];
  if (typeof venue.name !== "string" || normalize(venue.name) !== normalize(name)) return;
  const street = venue.address?.streetAddress, city = venue.address?.addressLocality;
  if (typeof street !== "string" || typeof city !== "string" || !/\d/.test(street)) return;
  // Require a complete street and locality, not a matching city or brand alone.
  const target = ` ${normalize(address)} `;
  if (!target.includes(` ${normalize(street)} `) || !target.includes(` ${normalize(city)} `)) return;
  return `Single restaurant JSON-LD identity: ${venue.name}; ${street}; ${city}`;
}

export type RouteState = { at: string; status: string; hasPlatform?: boolean };
export function routeIsDue(state: RouteState | undefined, now = Date.now()): boolean {
  if (!state) return true;
  const days = state.status === "failed" || state.status === "blocked" ? 7 : state.hasPlatform ? 30 : 90;
  const age = now - Date.parse(state.at);
  return !Number.isFinite(age) || age >= days * 86400000;
}

export function automaticItemEligible(item: {confidence: number; method: string; evidenceUrl: string; item: {imageUrl?: string}}, provenUrls: Set<string>): boolean {
  return item.confidence >= 0.85 && Boolean(item.item.imageUrl) && provenUrls.has(item.evidenceUrl)
    && /schema_org|network_json|embedded_json|platform_/.test(item.method);
}
