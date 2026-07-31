import { describe, expect, it } from "vitest";
import { normalizeMerchantItems } from "../merchantProviders";

describe("merchant provider normalization", () => {
  it("joins Square item image IDs to catalog image URLs", () => {
    const items = normalizeMerchantItems("square", {
      objects: [{ type: "ITEM", item_data: { name: "Truffle Burger", image_ids: ["img-1"] } }],
      related_objects: [{ id: "img-1", image_data: { url: "https://cdn.example/burger.jpg" } }],
    });
    expect(items).toEqual([{ name: "Truffle Burger", description: undefined, imageUrl: "https://cdn.example/burger.jpg", source: "square" }]);
  });

  it("normalizes nested Google Business menu sections", () => {
    const items = normalizeMerchantItems("google_business", {
      menus: [{ sections: [{ items: [{ name: "House Salad", description: "Local greens" }] }] }],
    });
    expect(items[0]).toMatchObject({ name: "House Salad", description: "Local greens", source: "merchant" });
  });

  it("normalizes Flipdish menu sections and image URLs", () => {
    const items = normalizeMerchantItems("flipdish", {
      MenuSections: [{ MenuItems: [{ Name: "Fish Tacos", Description: "Two tacos", ImageUrl: "https://cdn.example/tacos.jpg" }] }],
    });
    expect(items[0]).toMatchObject({ name: "Fish Tacos", imageUrl: "https://cdn.example/tacos.jpg", source: "flipdish" });
  });
});
