import { describe, expect, it } from "vitest";
import { isDirectBackdropEvent } from "../modalEvents";

describe("modal backdrop dismissal", () => {
  it("closes for a direct backdrop tap", () => {
    const backdrop = new EventTarget();
    expect(isDirectBackdropEvent(backdrop, backdrop)).toBe(true);
  });

  it("does not close for a camera input event bubbling through a portal", () => {
    expect(isDirectBackdropEvent(new EventTarget(), new EventTarget())).toBe(false);
  });
});
