import { describe, expect, it } from "vitest";
import { aboveQuery, belowQuery, BREAKPOINTS, type Breakpoint } from "./useBreakpoint";

describe("useBreakpoint queries", () => {
  it("measures in rem, the unit Tailwind's own breakpoints compile to", () => {
    // `lg:` is `(width >= 64rem)`. A px query here agrees with it only at a
    // 16px default font size, and disagrees for anyone who enlarged theirs.
    expect(aboveQuery("lg")).toBe("(width >= 64rem)");
    expect(belowQuery("lg")).toBe("(width < 64rem)");
    expect(aboveQuery("md")).toBe("(width >= 48rem)");
  });

  it("never states a breakpoint in pixels", () => {
    for (const bp of Object.keys(BREAKPOINTS) as Breakpoint[]) {
      expect(aboveQuery(bp)).not.toContain("px");
      expect(belowQuery(bp)).not.toContain("px");
    }
  });

  it("matches Tailwind v4's default scale", () => {
    expect(BREAKPOINTS).toEqual({ sm: 40, md: 48, lg: 64, xl: 80, "2xl": 96 });
  });
});
