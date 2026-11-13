import { describe, expect, it } from "vitest";
import { clampDrawerWidth, DRAWER_DEFAULT_REM, DRAWER_MAX_REM, DRAWER_MIN_REM } from "./drawer";

describe("clampDrawerWidth", () => {
  it("holds a drag inside the bounds, so the drawer never swallows the flow or shrinks past its content", () => {
    expect(clampDrawerWidth(5)).toBe(DRAWER_MIN_REM);
    expect(clampDrawerWidth(99)).toBe(DRAWER_MAX_REM);
    expect(clampDrawerWidth(30)).toBe(30);
  });

  it("falls back to the default for a width storage handed back unreadable", () => {
    expect(clampDrawerWidth(Number.NaN)).toBe(DRAWER_DEFAULT_REM);
  });
});
