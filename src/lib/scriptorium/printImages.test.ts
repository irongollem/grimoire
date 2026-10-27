import { describe, it, expect } from "vitest";
import { needsCompacting, printPixelSize, PRINT_PPI } from "./printImages";

describe("printPixelSize", () => {
  it("resamples to 300 ppi of the printed size", () => {
    // 220 CSS px is 2.29 inches, so 688 pixels at 300 ppi.
    expect(printPixelSize({ width: 1024, height: 1536 }, { width: 220, height: 330 })).toEqual({
      width: 688,
      height: 1031,
    });
    expect(PRINT_PPI).toBe(300);
  });

  it("never upscales a picture smaller than print size", () => {
    expect(printPixelSize({ width: 400, height: 600 }, { width: 794, height: 1123 })).toEqual({
      width: 400,
      height: 600,
    });
  });

  it("is at least one pixel on each side, however small the printed box", () => {
    // A 100000 x 1 strip in a box 0.01px tall scales by 0.03125: 3125 wide, and 0.03 tall rounds to 0.
    expect(printPixelSize({ width: 100000, height: 1 }, { width: 1, height: 0.01 })).toEqual({ width: 3125, height: 1 });
    expect(printPixelSize({ width: 1, height: 100000 }, { width: 0.01, height: 1 })).toEqual({ width: 1, height: 3125 });
  });

  it("keeps enough pixels to fill a cropped cover box on its tighter axis", () => {
    // A tall picture covering a wide box is cropped top and bottom: its width
    // decides the size it needs.
    const size = printPixelSize({ width: 3000, height: 6000 }, { width: 600, height: 300 });
    expect(size.width).toBe(1875);
    expect(size.height).toBe(3750);
  });
});

describe("needsCompacting", () => {
  const natural = { width: 1024, height: 1536 };

  it("redraws a WebP even at print size, since the print pipeline stores it losslessly", () => {
    expect(needsCompacting("https://cdn.example/art.webp", natural, natural)).toBe(true);
  });

  it("leaves a JPEG already at print size untouched", () => {
    expect(needsCompacting("https://cdn.example/art.jpeg", natural, natural)).toBe(false);
    expect(needsCompacting("https://cdn.example/art.JPG?v=2", natural, natural)).toBe(false);
  });

  it("treats a JPEG data URI like a JPEG file", () => {
    expect(needsCompacting("data:image/jpeg;base64,AAAA", natural, natural)).toBe(false);
  });

  it("does not mistake a file whose name merely contains .jpg for a JPEG", () => {
    expect(needsCompacting("https://cdn.example/art.jpg.webp", natural, natural)).toBe(true);
  });

  it("shrinks a JPEG larger than print size", () => {
    expect(needsCompacting("https://cdn.example/art.jpg", natural, { width: 688, height: 1031 })).toBe(true);
  });
});
