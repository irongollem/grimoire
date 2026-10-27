import { describe, expect, it } from "vitest";
import { compareSets, diffGlyph, MAX_DIFF_PIXELS } from "./glyphCompare";

const square = (d: number) => `<path fill="currentColor" d="M10 10h${d}v${d}h-${d}z"/>`;

describe("diffGlyph", () => {
  it("finds nothing between identical markup", async () => {
    expect(await diffGlyph(square(60), square(60), 96)).toEqual({ pixels: 0, maxLevel: 0 });
  });

  it("counts the pixels of a visibly moved edge", async () => {
    expect((await diffGlyph(square(60), square(70), 96)).pixels).toBeGreaterThan(MAX_DIFF_PIXELS);
  });
});

// A flat grey page: with r = g = b the greyscale level is the fill itself, so the gap is exact.
const grey = (level: number) => `<rect width="100" height="100" fill="rgb(${level},${level},${level})"/>`;
// 12.5 x 1.0417 units are 12 x 1 whole pixels at 96px, so the count is exact and nothing is anti-aliased.
const pixels = (count: number) => `<rect width="${(count * 100) / 96}" height="${100 / 96}" fill="#000"/>`;

describe("diffGlyph thresholds", () => {
  it("counts a grey-level move above the tolerance and not one equal to it", async () => {
    expect(await diffGlyph(grey(100), grey(132), 24)).toEqual({ pixels: 0, maxLevel: 32 });
    expect((await diffGlyph(grey(100), grey(133), 24)).pixels).toBe(24 * 24);
  });

  it("reports the largest move of any pixel, not the smallest", async () => {
    const { maxLevel } = await diffGlyph(`${grey(100)}<rect width="50" height="100" fill="rgb(200,200,200)"/>`, grey(100), 24);
    expect(maxLevel).toBe(100);
  });
});

describe("compareSets ceiling", () => {
  it("passes a glyph that moved exactly MAX_DIFF_PIXELS pixels and fails one that moved one more", async () => {
    const blank = [["a", ""]] as const;
    expect((await diffGlyph("", pixels(MAX_DIFF_PIXELS), 96)).pixels).toBe(MAX_DIFF_PIXELS);
    expect((await compareSets(blank, [["a", pixels(MAX_DIFF_PIXELS)]])).ok).toBe(true);
    expect((await compareSets(blank, [["a", pixels(MAX_DIFF_PIXELS + 1)]])).ok).toBe(false);
  });
});

describe("compareSets", () => {
  it("names the worst glyph per size and fails past the ceiling", async () => {
    const before = [["a", square(60)], ["b", square(60)]] as const;
    const result = await compareSets(before, [["a", square(60)], ["b", square(70)]]);
    expect(result.worst[96].name).toBe("b");
    expect(result.ok).toBe(false);
  });

  it("refuses a glyph with no original", async () => {
    await expect(compareSets([["a", square(60)]], [["z", square(60)]])).rejects.toThrow("no original");
  });
});
