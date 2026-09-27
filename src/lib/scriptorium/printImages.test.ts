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

  it("shrinks a JPEG larger than print size", () => {
    expect(needsCompacting("https://cdn.example/art.jpg", natural, { width: 688, height: 1031 })).toBe(true);
  });
});
