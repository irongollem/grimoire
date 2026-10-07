import { describe, expect, it } from "vitest";
import { darkChromeStyle } from "./hallGround";

describe("darkChromeStyle", () => {
  it("lays the stone over the shell, so overscroll shows wall rather than vellum's paper", () => {
    const style = darkChromeStyle("vellum");
    expect(style.backgroundImage).toContain("/assets/memorial/stone.jpg");
    expect(style.backgroundSize).toBe("24rem 24rem");
  });
});
