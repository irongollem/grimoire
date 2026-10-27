import { describe, expect, it } from "vitest";
import { darkTwinStyle } from "@/lib/themeRuntime";
import { darkChromeStyle } from "./hallGround";

describe("darkChromeStyle", () => {
  it("renders the shell in the theme's dark twin, with the stone laid over it so overscroll shows wall rather than vellum's paper", () => {
    const twin = darkTwinStyle("vellum");
    expect(Object.keys(twin).length, "vellum should have a dark twin to paint").toBeGreaterThan(0);
    const style = darkChromeStyle("vellum");
    expect(style).toMatchObject(twin);
    expect(style.backgroundImage).toContain("/assets/memorial/stone.jpg");
  });
});
