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
