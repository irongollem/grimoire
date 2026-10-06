import { describe, expect, it } from "vitest";
import { diffGlyph } from "./glyphCompare";
import { OPTIMIZE_LADDER, optimizeGlyph, runRung } from "./glyphOptimize";

// potrace's shape: nested transformed groups, integer x10 coordinates, newlines.
const traced =
  '<g transform="translate(6 6) scale(0.2)"><g transform="translate(0.000000,400.000000) scale(0.100000,-0.100000)"\n' +
  'fill="currentColor" stroke="none">\n<path d="M100 3900 c0 -50 50 -100 100 -100 l1500 0\n' +
  'c50 0 100 50 100 100 l0 1500 c0 50 -50 100 -100 100 l-1500 0 c-50 0 -100 -50 -100 -100 z"/>\n</g></g>';

describe("optimizeGlyph", () => {
  it("shrinks potrace markup, keeps the currentColor fill, and renders the same", async () => {
    const { markup, rung } = await optimizeGlyph(traced);
    expect(markup.length).toBeLessThan(traced.length);
    expect(markup).toContain('fill="currentColor"');
    expect(markup).not.toContain("\n");
    expect(rung).not.toBe("unchanged");
    expect((await diffGlyph(traced, markup, 96)).pixels).toBeLessThanOrEqual(12);
  });

  it("returns the input untouched when nothing smaller can be proven identical", async () => {
    const tiny = '<path fill="currentColor" d="M0 0h1v1z"/>';
    expect(await optimizeGlyph(tiny)).toEqual({ markup: tiny, rung: "unchanged" });
  });

  it("ends the ladder on a rung that keeps potrace's integer coordinates", () => {
    const last = OPTIMIZE_LADDER[OPTIMIZE_LADDER.length - 1];
    expect(last.applyTransforms).toBe(false);
    expect(runRung(traced, last)).toContain('d="M100 3900');
  });
});
