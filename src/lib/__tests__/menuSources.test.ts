import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseMenufyItemCards,
  parseMenufyApiData,
  parseSchemaOrgMenuItems,
  detectOrderingPlatform,
  extractEmbeddedJsonMenuItems,
} from "../menuSources";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("Menufy — item cards (Scrapfly-rendered DOM)", () => {
  it("extracts name, short description, price, and upscaled image from real recorded structure", () => {
    const items = parseMenufyItemCards(fixture("menufy-item-cards.html"));
    expect(items).toHaveLength(3);

    const ribs = items.find((i) => i.name.startsWith("Baby Back"));
    expect(ribs?.name).toBe("Baby Back BBQ Ribs (5people)");
    expect(ribs?.price).toBe(89.95);
    expect(ribs?.imageUrl).toContain("width=800,height=800");
    expect(ribs?.source).toBe("menufy");

    const burger = items.find((i) => i.name === "Truffle Burger");
    expect(burger?.description).toContain("Wagyu Burger");
  });

  it("returns empty array when no item cards are present", () => {
    expect(parseMenufyItemCards("<html><body>no menu here</body></html>")).toEqual([]);
  });
});

describe("Menufy — direct API (categories vs items)", () => {
  it("does NOT misread category listings as dishes (categories have no price)", () => {
    const raw = fixture("menufy-categories.json");
    const items = parseMenufyApiData(JSON.parse(raw));
    expect(items).toEqual([]);
  });
});

describe("Schema.org LD+JSON", () => {
  it("extracts nested MenuItem entries with description, image, and price", () => {
    const items = parseSchemaOrgMenuItems(fixture("schema-org-menu.html"));
    expect(items).toHaveLength(2);

    const truffle = items.find((i) => i.name === "Truffle Burger");
    expect(truffle?.description).toContain("Wagyu");
    expect(truffle?.imageUrl).toBe("https://cdn.example.com/truffle-burger.jpg");
    expect(truffle?.price).toBe(16.95);
    expect(truffle?.source).toBe("schema_org");

    const cheeseburger = items.find((i) => i.name === "Classic Cheeseburger");
    expect(cheeseburger?.price).toBe(12.5);
  });
});

describe("Ordering platform detection", () => {
  it.each([
    ["toast-menu.html", "toast"],
    ["chownow-menu.html", "chownow"],
    ["olo-menu.html", "olo"],
    ["clover-menu.html", "clover"],
    ["square-menu.html", "square"],
    ["popmenu-menu.html", "popmenu"],
  ] as const)("detects %s as %s", (file, expected) => {
    expect(detectOrderingPlatform(fixture(file))).toBe(expected);
  });

  it("returns null when no known platform signature is present", () => {
    expect(detectOrderingPlatform("<html><body>plain site</body></html>")).toBeNull();
  });
});

describe("Ordering platform extraction (generic embedded-JSON walk)", () => {
  it("extracts Toast menu items from nested menus/groups/items", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("toast-menu.html"), "toast");
    expect(items).toHaveLength(2);
    const brisket = items.find((i) => i.name === "Smoked Brisket Plate");
    expect(brisket?.price).toBe(22.5);
    expect(brisket?.source).toBe("toast");
  });

  it("extracts ChowNow items from nested categories", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("chownow-menu.html"), "chownow");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Al Pastor Taco");
    expect(items[0].price).toBe(4.5);
  });

  it("extracts Olo items using basePrice/thumbnailUrl field fallbacks", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("olo-menu.html"), "olo");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("BBQ Wings");
    expect(items[0].price).toBe(11.99);
  });

  it("extracts Clover items using itemName/desc/cost field fallbacks", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("clover-menu.html"), "clover");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Loaded Fries");
    expect(items[0].description).toContain("bacon");
    expect(items[0].price).toBe(8.5);
  });

  it("extracts Square items using title field fallback", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("square-menu.html"), "square");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Iced Vanilla Latte");
  });

  it("extracts PopMenu items from nested menuSections/menuItems", () => {
    const items = extractEmbeddedJsonMenuItems(fixture("popmenu-menu.html"), "popmenu");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Tiramisu");
  });

  it("does not misread price-less objects as menu items", () => {
    const html = `<script type="application/json">{"name": "Some Section", "description": "no price here"}</script>`;
    expect(extractEmbeddedJsonMenuItems(html, "toast")).toEqual([]);
  });
});
