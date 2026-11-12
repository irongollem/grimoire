// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyPaperWash, washLayers } from "./paperWash";
import type { WashStep } from "./treatment";

const wash = (over: Partial<WashStep> = {}): WashStep => ({ type: "wash", from: "left", reach: 0.6, brush: 0.55, dry: 0.65, seed: 7, ...over });

/** The mean erase (0 to 1) of a column band, across the middle of the picture where no top edge is. */
function bandMean(erase: Uint8ClampedArray, w: number, h: number, x0: number, x1: number) {
  let sum = 0, n = 0;
  for (let y = Math.round(h * 0.4); y < Math.round(h * 0.9); y++) for (let x = Math.round(x0 * w); x < Math.round(x1 * w); x++) { sum += erase[y * w + x]; n++; }
  return sum / n / 255;
}

/** Where, as a fraction of the width, the erase falls below half, averaged over the rows of the middle band. */
function edgeFraction(w: number, h: number, step: WashStep) {
  const { erase } = washLayers(w, h, step);
  let total = 0, rows = 0;
  for (let y = Math.round(h * 0.4); y < Math.round(h * 0.9); y++) {
    let x = 0;
    while (x < w && erase[y * w + x] > 127) x++;
    total += x / w; rows++;
  }
  return total / rows;
}

describe("washLayers", () => {
  // Fails on: Math.random or iteration-order state in the strokes, so the bake, the preview and print would paint three different washes.
  it("draws the same wash for the same seed and another for a different seed", () => {
    const a = washLayers(120, 160, wash());
    expect(Array.from(washLayers(120, 160, wash()).erase)).toEqual(Array.from(a.erase));
    expect(Array.from(washLayers(120, 160, wash({ seed: 8 })).erase)).not.toEqual(Array.from(a.erase));
  });

  // Fails on: the geometry not following `from`, so a wash asked for on the right lands on the left.
  it("covers the side it comes in from and leaves the far side alone, for every side", () => {
    const w = 160, h = 160;
    const near = (from: WashStep["from"]) => {
      const { erase } = washLayers(w, h, wash({ from }));
      const at = (x: number, y: number) => erase[y * w + x];
      return { at, mid: at(w >> 1, h >> 1) };
    };
    const left = near("left"), right = near("right"), top = near("top"), bottom = near("bottom");
    expect(left.at(5, 100)).toBe(255);
    expect(left.at(w - 5, 100)).toBe(0);
    expect(right.at(w - 6, 100)).toBe(255);
    expect(right.at(5, 100)).toBe(0);
    // The top of the picture is kept for a left wash, so a top wash is measured in its own frame: the wash comes from the top edge down.
    expect(top.at(100, 5)).toBe(255);
    expect(top.at(100, h - 5)).toBe(0);
    expect(bottom.at(100, h - 6)).toBe(255);
    expect(bottom.at(100, 5)).toBe(0);
  });

  // Fails on: reach being ignored, so the slider does nothing.
  it("moves the edge with reach", () => {
    const short = edgeFraction(200, 280, wash({ reach: 0.35 }));
    const long = edgeFraction(200, 280, wash({ reach: 0.75 }));
    expect(long).toBeGreaterThan(short + 0.25);
  });

  // Fails on: stroke sizes in pixels, so a thumbnail preview shows a different wash than the full bake.
  it("puts the edge at the same fraction of the picture at preview and full size", () => {
    const small = edgeFraction(150, 212, wash({ reach: 0.6 }));
    const big = edgeFraction(600, 848, wash({ reach: 0.6 }));
    expect(Math.abs(small - big)).toBeLessThan(0.05);
  });

  // Fails on: the dry slider doing nothing to the edge: a wet brush should leave a harder edge than a dry one.
  it("leaves a more broken edge with a dry brush than a wet one", () => {
    const w = 300, h = 420;
    const ragged = (dry: number) => {
      const { erase } = washLayers(w, h, wash({ dry, reach: 0.6 }));
      let partial = 0;
      for (let i = 0; i < erase.length; i++) if (erase[i] > 20 && erase[i] < 235) partial++;
      return partial;
    };
    expect(ragged(1)).not.toBe(ragged(0));
  });

  // Fails on: the streaks being drawn onto the page edge side, outside the wash.
  it("draws no streaks on the picture side of the wash", () => {
    const w = 160, h = 160;
    const { streakAlpha } = washLayers(w, h, wash());
    expect(bandMean(streakAlpha, w, h, 0.9, 1)).toBe(0);
  });
});

describe("applyPaperWash", () => {
  function fakeCtx(w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([40, 30, 20, 255], i * 4);
    const ctx = { getImageData: () => ({ data, width: w, height: h }), putImageData: () => undefined };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, data };
  }

  // Fails on: the wash not making the picture transparent where it is, so the page's paper never shows through.
  it("makes the washed side transparent and leaves the far side opaque and untouched", () => {
    const w = 120, h = 160;
    const { ctx, data } = fakeCtx(w, h);
    applyPaperWash(ctx, w, h, wash());
    const px = (x: number, y: number) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
    expect(px(4, 100)[3]).toBeLessThan(40);
    expect(px(w - 4, 100)).toEqual([40, 30, 20, 255]);
  });
});
