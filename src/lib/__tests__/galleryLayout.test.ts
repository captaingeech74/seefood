import { describe, expect, it } from "vitest";
import { balanceGalleryColumns } from "../galleryLayout";

describe("balanced gallery layout", () => {
  it("keeps the first row ranked and fills the shorter column next", () => {
    const landscape = { id: "landscape", width: 4, height: 3 };
    const portrait = { id: "portrait", width: 3, height: 5 };
    const nextPortrait = { id: "next-portrait", width: 3, height: 5 };
    const nextLandscape = { id: "next-landscape", width: 4, height: 3 };

    const columns = balanceGalleryColumns(
      [landscape, portrait, nextPortrait, nextLandscape],
      2
    );

    expect(columns.map((column) => column.map((item) => item.id))).toEqual([
      ["landscape", "next-portrait"],
      ["portrait", "next-landscape"],
    ]);
  });

  it("supports responsive column counts without dropping or duplicating items", () => {
    const items = Array.from({ length: 11 }, (_, index) => ({
      id: index,
      width: index % 2 ? 3 : 4,
      height: index % 2 ? 5 : 3,
    }));
    const columns = balanceGalleryColumns(items, 4);
    const placed = columns.flat().map((item) => item.id).sort((a, b) => a - b);

    expect(columns).toHaveLength(4);
    expect(placed).toEqual(items.map((item) => item.id));
  });
});
