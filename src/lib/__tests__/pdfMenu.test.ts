import { describe, expect, it } from "vitest";
import { parseMenuText, parseVisionMenuText } from "../../crawler/pdfMenu";

describe("PDF menu text parsing", () => {
  it("extracts dish names, descriptions, and prices without treating headings as dishes", () => {
    const items = parseMenuText(`
      APPETIZERS
      Crispy Calamari $16.00
      Lemon, herbs, and roasted garlic aioli
      Burrata & Heirloom Tomatoes 14.50
      Basil, sea salt, and olive oil
      DINNER
    `);
    expect(items).toEqual([
      expect.objectContaining({ name: "Crispy Calamari", price: 16, description: "Lemon, herbs, and roasted garlic aioli" }),
      expect.objectContaining({ name: "Burrata & Heirloom Tomatoes", price: 14.5, description: "Basil, sea salt, and olive oil" }),
    ]);
  });

  it("deduplicates repeated menu items", () => {
    expect(parseMenuText("Tacos $12.00\nTacos $12.00")).toHaveLength(1);
  });

  it("accepts whole-dollar prices commonly recovered from image menus", () => {
    expect(parseMenuText("Classic Caesar 16\nromaine, croutons, lemon, parmesan"))
      .toEqual([expect.objectContaining({ name: "Classic Caesar", price: 16 })]);
  });

  it("rejects flattened columns, description fragments, and add-on labels", () => {
    expect(parseMenuText(`
      Individual 4.50 Whole 69.99
      and sautéed seasonal vegetables 13.99
      BEEF RIBS (3 BONES), ADD 8.00
      Abeja Merlot ..... 75 Baron Red Blend 78
      Girlan Pinot Noir ..... 75
      with the next column accidentally flattened 98
      Sp] Spicy Lamb Rigatoni 28
      Spicy Lamb Rigatoni 28
      NY Four Cheese Pizza 14.85
    `).map((item) => item.name)).toEqual(["Girlan Pinot Noir", "Spicy Lamb Rigatoni", "NY Four Cheese Pizza"]);
  });
});

describe("parseVisionMenuText", () => {
  it("keeps OCR menu dishes when a restaurant PDF has calories but no prices", () => {
    const items = parseVisionMenuText(`
## SANDWICHES
##### Classic 350-1630 CAL
CHOICE OF 1 MEAT ON A BRIOCHE BUN
Hand-Cut Fries 340-680 CAL
2,000 calories a day is used for general nutrition advice
`);
    expect(items.map((item) => item.name)).toEqual(["Classic", "Hand-Cut Fries"]);
  });

  it("keeps bilingual dish rows from a tier-priced image menu", () => {
    const items = parseVisionMenuText(`
### PREMIUM A $52.99
Ribeye Steak 꽃돌싱 스테이크
Beef Short Rib 생갈비
For the first 100 guests, Limited supply
Corn Cheese 콘치즈
`);
    expect(items.map((item) => item.name)).toEqual(["Ribeye Steak", "Beef Short Rib", "Corn Cheese"]);
  });
});
