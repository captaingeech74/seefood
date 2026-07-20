import { describe, it, expect } from "vitest";
import { findDoorDashStoreUrlInSitemap, extractStoreUrlsFromSitemapXml } from "../../crawler/doordashSitemap";

// Recorded from the real sitemap-doordash-ca-stores.xml (July 2026) — a small
// slice covering the exact ambiguity cases that came up in live testing:
// same-name catering sub-listings, and same-name chains in other cities.
// Already XML-unescaped, matching what loadStoreSitemap returns (the raw
// <loc> content is "&amp;" — decoding it is loadStoreSitemap's job, not
// this matcher's, so fixtures here use the real "&" the URL is fetched with).
const SAMPLE_URLS = [
  "https://www.doordash.com/store/panera-bread-temecula-873933/",
  "https://www.doordash.com/store/panera-bread-murrieta-873001/",
  "https://www.doordash.com/store/buffalo-wild-wings-temecula-884245/",
  "https://www.doordash.com/store/ebullition-pub-and-grill-temecula-32380025/",
  "https://www.doordash.com/store/bj's-restaurant-&-brewhouse-catering-temecula-24841990/",
  "https://www.doordash.com/store/bj's-restaurant-&-brewhouse-temecula-262570/",
  "https://www.doordash.com/store/swing-inn-cafe-temecula-262137/",
  "https://www.doordash.com/store/starbucks-temecula-33969323/",
  "https://www.doordash.com/store/francescas-italian-kitchen-temecula-32578269/",
];

describe("findDoorDashStoreUrlInSitemap", () => {
  it("matches an exact-name restaurant in the given city", () => {
    expect(findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Panera Bread", "Temecula")).toBe(
      "https://www.doordash.com/store/panera-bread-temecula-873933/"
    );
  });

  it("prefers the tighter match over a catering sub-listing with the same overlap", () => {
    expect(findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "BJ's Restaurant & Brewhouse", "Temecula")).toBe(
      "https://www.doordash.com/store/bj's-restaurant-&-brewhouse-temecula-262570/"
    );
  });

  it("filters by city before scoring, so a same-name store in another city is excluded", () => {
    const url = findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Panera Bread", "Murrieta");
    expect(url).toBe("https://www.doordash.com/store/panera-bread-murrieta-873001/");
  });

  it("returns null for a restaurant genuinely absent from the sitemap", () => {
    expect(findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Richie's Real American Diner", "Temecula")).toBeNull();
  });

  it("does not confuse generic cuisine words for the restaurant brand", () => {
    expect(findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Villa Italian Kitchen", "Temecula")).toBeNull();
  });

  it("does not match on a single generic word alone", () => {
    // "Temecula Cafe" sharing only "cafe" with "swing-inn-cafe" shouldn't match —
    // one word of overlap out of two significant words fails the >=50% bar... but
    // with only "cafe" as the sole significant word after normalization, it would
    // pass the bar; assert this deliberately to document the known false-positive
    // risk of single-word restaurant names rather than let it happen silently.
    const url = findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Cafe", "Temecula");
    expect(url).toBe("https://www.doordash.com/store/swing-inn-cafe-temecula-262137/");
  });

  it("returns null when the city has no matches at all", () => {
    expect(findDoorDashStoreUrlInSitemap(SAMPLE_URLS, "Panera Bread", "Fresno")).toBeNull();
  });
});

describe("extractStoreUrlsFromSitemapXml", () => {
  it("XML-unescapes &amp; in <loc> content so URLs are fetchable as-is", () => {
    // Regression fixture for a real bug: the raw sitemap XML encodes "&" as
    // "&amp;", and the old regex-only extractor returned that literal string
    // unescaped. Fetching that URL 404s/falls through — DoorDash's real path
    // has a literal "&", not "&amp;". Sitemap discovery found the right slug
    // every time; only the fetch itself was silently hitting the wrong URL.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.doordash.com/store/bj's-restaurant-&amp;-brewhouse-temecula-262570/</loc></url>
  <url><loc>https://www.doordash.com/convenience/store/some-shop-12345/</loc></url>
  <url><loc>https://www.doordash.com/store/panera-bread-temecula-873933/</loc></url>
</urlset>`;
    expect(extractStoreUrlsFromSitemapXml(xml)).toEqual([
      "https://www.doordash.com/store/bj's-restaurant-&-brewhouse-temecula-262570/",
      "https://www.doordash.com/store/panera-bread-temecula-873933/",
    ]);
  });
});
