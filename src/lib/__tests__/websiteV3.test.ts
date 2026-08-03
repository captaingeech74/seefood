import { describe, expect, it } from "vitest";
import { chooseAdaptiveRoute, normalizeMenuItemName, safePublicUrl } from "../../crawler/websiteV3";

describe("website acquisition V3 routing", () => {
  it("escalates a blocked direct request through progressively stronger free fetchers", () => {
    expect(chooseAdaptiveRoute({ httpOk: false, blocked: true, htmlLength: 0, itemCount: 0, platforms: [], renderedAlready: false }))
      .toEqual(["curl_cffi", "patchright", "scrapling"]);
  });

  it("uses browser/network capture for a detected ordering platform", () => {
    expect(chooseAdaptiveRoute({ httpOk: true, blocked: false, htmlLength: 10_000, itemCount: 3, platforms: ["toast"], renderedAlready: false }))
      .toEqual(["patchright"]);
  });

  it("does not pay the browser cost when direct structured extraction succeeded", () => {
    expect(chooseAdaptiveRoute({ httpOk: true, blocked: false, htmlLength: 10_000, itemCount: 20, platforms: [], renderedAlready: false }))
      .toEqual([]);
  });
});

describe("website acquisition V3 normalization", () => {
  it("normalizes equivalent dish labels deterministically", () => {
    expect(normalizeMenuItemName("  Crème-Brûlée!! ")).toBe("creme brulee");
  });

  it("accepts only public HTTP URLs", () => {
    expect(safePublicUrl("/menus/dinner.pdf", "https://example.com")).toBe("https://example.com/menus/dinner.pdf");
    expect(safePublicUrl("data:text/plain,nope")).toBeUndefined();
  });
});
