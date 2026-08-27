import { describe, it, expect } from "vitest";

// google.ts reads GOOGLE_MAPS_API_KEY at module-load time (live-path
// requirement); the pure parsers under test here don't use it, but the
// import still needs a value present so the module doesn't throw on load.
process.env.GOOGLE_MAPS_API_KEY ??= "test-key";

const { parseNextFlightMenuItems, extractDoorDashItems, extractDoorDashStoreName } = await import("../google");

// Real shape recorded from BJ's Restaurant & Brewhouse's live DoorDash store
// page (July 2026) — confirms DoorDash's store pages moved from the old
// Pages Router __NEXT_DATA__ blob to Next.js App Router RSC "flight" chunks
// (self.__next_f.push([1,"..."])). Built programmatically (not hand-escaped)
// to guarantee the JSON-string-escaping matches what a real browser emits.
function buildFlightHtml(payload: unknown, opts?: { split?: boolean }): string {
  const json = JSON.stringify(payload);
  const jsStringLiteral = JSON.stringify(json).slice(1, -1); // escape for embedding inside another JS string
  if (opts?.split) {
    const mid = Math.floor(jsStringLiteral.length / 2);
    // Splitting mid-escape-sequence would corrupt the fixture; only split on a safe boundary.
    let cut = mid;
    while (cut > 0 && jsStringLiteral[cut - 1] === "\\") cut--;
    return `<html><body>
<script>self.__next_f.push([1,"unrelated-noise-chunk"])</script>
<script>self.__next_f.push([1,"${jsStringLiteral.slice(0, cut)}"])</script>
<script>self.__next_f.push([1,"${jsStringLiteral.slice(cut)}"])</script>
</body></html>`;
  }
  return `<html><body>
<script>self.__next_f.push([1,"unrelated-noise-chunk"])</script>
<script>self.__next_f.push([1,"${jsStringLiteral}"])</script>
</body></html>`;
}

const REAL_SHAPE_PAYLOAD = {
  itemLists: [
    {
      __typename: "MenuPageItemList",
      id: "popular-items",
      name: "Most Ordered",
      description: "The most commonly ordered items and dishes from this store",
      callout: null,
      footer: null,
      items: [
        {
          __typename: "MenuPageItem",
          id: "1095009333",
          name: "Pizookie® Trio",
          description: "Your choice of three mini Pizookies® | each served with a scoop of ice cream",
          displayPrice: "$14.49",
          displayStrikethroughPrice: "",
          logging: {
            fieldsMap: [["card_position", { nullValue: 0, numberValue: 0, stringValue: "", boolValue: false }]],
          },
        },
        {
          __typename: "MenuPageItem",
          id: "1095009334",
          name: "Avocado Egg Rolls",
          description: "Sliced avocado, sun-dried tomatoes, cilantro & spices",
          displayPrice: "$13.95",
        },
      ],
    },
  ],
};

describe("parseNextFlightMenuItems", () => {
  it("extracts named dishes from a real DoorDash RSC flight payload shape", () => {
    const html = buildFlightHtml(REAL_SHAPE_PAYLOAD);
    const items = parseNextFlightMenuItems(html, extractDoorDashItems);

    expect(items.map((i) => i.name).sort()).toEqual(["Avocado Egg Rolls", "Pizookie® Trio"].sort());

    const pizookie = items.find((i) => i.name.startsWith("Pizookie"));
    expect(pizookie?.description).toContain("mini Pizookies");
  });

  it("does not extract the category itself as a fake dish (MenuPageItemList has the same name+description shape as a real item)", () => {
    const html = buildFlightHtml(REAL_SHAPE_PAYLOAD);
    const items = parseNextFlightMenuItems(html, extractDoorDashItems);
    expect(items.map((i) => i.name)).not.toContain("Most Ordered");
  });

  it("survives the real payload split across multiple push() chunks", () => {
    const html = buildFlightHtml(REAL_SHAPE_PAYLOAD, { split: true });
    const items = parseNextFlightMenuItems(html, extractDoorDashItems);
    expect(items.map((i) => i.name).sort()).toEqual(["Avocado Egg Rolls", "Pizookie® Trio"].sort());
  });

  it("returns empty for a page with no RSC flight chunks (old-format or non-DoorDash page)", () => {
    expect(parseNextFlightMenuItems("<html><body>no data here</body></html>", extractDoorDashItems)).toEqual([]);
  });

  it("does not choke on a malformed/truncated push() chunk", () => {
    const html = `<script>self.__next_f.push([1,"{\\"broken`;
    expect(parseNextFlightMenuItems(html, extractDoorDashItems)).toEqual([]);
  });
});

describe("extractDoorDashStoreName", () => {
  it("reads the provider-declared store breadcrumb", () => {
    const payload = String.raw`1:{"breadcrumbs":[{"name":"Home","target":"https://www.doordash.com/"},{"name":"Red Robin Gourmet Burgers and Brews","target":"https://www.doordash.com/store/red-robin-temecula-123/"}]}`;
    const escaped = JSON.stringify(payload).slice(1, -1);
    expect(extractDoorDashStoreName(`<script>self.__next_f.push([1,"${escaped}"])</script>`))
      .toBe("Red Robin Gourmet Burgers and Brews");
  });

  it("fails closed when the page does not declare a store identity", () => {
    expect(extractDoorDashStoreName("<html></html>")).toBeNull();
  });
});
