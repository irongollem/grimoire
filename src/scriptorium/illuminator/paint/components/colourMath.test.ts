import { describe, expect, it } from "vitest";
import { hsvToRgb, parseHex, rgbToHex, rgbToHsv } from "./colourMath";

describe("parseHex", () => {
  it("rejects junk instead of turning it into black", () => {
    for (const bad of ["", "#", "#12", "#12345", "#1234567", "#gggggg", "red", "#12 456"]) expect(parseHex(bad)).toBeNull();
  });
  it("expands shorthand and ignores the hash and case", () => {
    expect(parseHex("#fa0")).toEqual({ r: 255, g: 170, b: 0 });
    expect(parseHex(" C8A24A ")).toEqual({ r: 200, g: 162, b: 74 });
  });
  it("round-trips through rgbToHex", () => {
    const c = { r: 12, g: 200, b: 255 };
    expect(parseHex(rgbToHex(c))).toEqual(c);
  });
});

describe("hsv", () => {
  it("round-trips every colour on a coarse grid (a wrong sextant shows as a drifted channel)", () => {
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
      expect(hsvToRgb(rgbToHsv({ r, g, b }))).toEqual({ r, g, b });
    }
  });
  it("puts the primaries at their hues", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBe(0);
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240);
  });
  it("keeps negative hues in range", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 10 }).h).toBeGreaterThan(300);
  });
});
