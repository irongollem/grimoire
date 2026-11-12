import { describe, expect, it } from "vitest";
import { fitLongSide, maskSvg, pgmFromAlpha } from "./markAssets";

describe("markAssets", () => {
  it("scales the long side down to the limit and never up", () => {
    // Fails on: a mark enlarged past its source (soft, bigger file) or one left over the limit (a 6 MB page art).
    expect(fitLongSide(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitLongSide(900, 1800, 1600)).toEqual({ width: 800, height: 1600 });
    expect(fitLongSide(734, 743, 1600)).toEqual({ width: 734, height: 743 });
  });

  it("writes the paint as dark pixels for potrace, the paper as white", () => {
    // Fails on: an inverted bitmap, which traces the page around the flourish instead of the flourish.
    const pgm = pgmFromAlpha(Uint8Array.from([0, 255]), 2, 1);
    expect(pgm.subarray(0, 11).toString("ascii")).toBe("P5\n2 1\n255\n");
    expect([...pgm.subarray(11)]).toEqual([255, 0]);
  });

  describe("maskSvg", () => {
    const traced =
      '<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="914.000000pt" height="878.000000pt" viewBox="0 0 914.000000 878.000000">' +
      '<g transform="translate(0,878) scale(0.1,-0.1)" fill="#000000" stroke="none"><path d="M0 0 c1 1 2 2 3 3z"/></g></svg>';

    it("keeps the viewBox and drops the fixed size, so the box that draws it decides", () => {
      // Fails on: a width/height left in, which pins the mask to 914 pt however large the corner is drawn.
      const out = maskSvg(traced);
      expect(out).toContain('viewBox="0 0 914.000000 878.000000"');
      expect(out).not.toMatch(/\swidth=|\sheight=/);
      expect(out).toContain('fill="#000000" stroke="none"');
      expect(out).toContain('d="M0 0 c1 1 2 2 3 3z"');
    });

    it("refuses a trace with no viewBox or no path rather than writing an empty mask", () => {
      // Fails on: a flourish that vanishes silently from every page because potrace changed its output.
      expect(() => maskSvg("<svg></svg>")).toThrow("viewBox");
      expect(() => maskSvg('<svg viewBox="0 0 1 1"><g transform="x"></g></svg>')).toThrow("nothing");
    });
  });
});
