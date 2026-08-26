import { describe, expect, it } from "vitest";
import { formatPhotoSourceList } from "../labels";

describe("photo source labels", () => {
  it("reports only the sources actually present and removes repeats", () => {
    expect(formatPhotoSourceList(["doordash", "doordash", "schema_org"]))
      .toBe("DoorDash · Restaurant");
  });
});
