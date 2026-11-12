import { describe, expect, it } from "vitest";
import type { PaintAssets, TipImage } from "../paint/engine/types";
import { paintWashLayers } from "./paperWash";
import type { WashStep } from "./treatment";

/** Soft round tips and a flat grain: the engine's real brushes, with art that needs no decoding. */
function disc(size: number): TipImage {
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    alpha[y * size + x] = Math.round(255 * Math.max(0, 1 - d * d));
  }
  return { width: size, height: size, alpha };
}
const assets: PaintAssets = {
  tip: () => disc(32),
  grain: () => ({ width: 2, height: 2, value: new Uint8Array([255, 255, 255, 255]) }),
};

const wash = (over: Partial<WashStep> = {}): WashStep => ({ type: "wash", from: "left", reach: 0.6, brush: 0.55, dry: 0.65, seed: 7, ...over });
const erase = (w: number, h: number, step: WashStep) => paintWashLayers(w, h, step, assets).erase;

/** Where, as a fraction of the width, the erase falls below half, averaged over the rows of the middle band. */
function edgeFraction(w: number, h: number, step: WashStep) {
  const e = erase(w, h, step);
  let total = 0, rows = 0;
  for (let y = Math.round(h * 0.4); y < Math.round(h * 0.9); y++) {
    let x = 0;
    while (x < w && e[y * w + x] > 127) x++;
    total += x / w; rows++;
  }
  return total / rows;
}

describe("paintWashLayers", () => {
  // Fails on: Math.random or iteration-order state in the strokes, so the bake, the preview and print would paint three different washes.
  it("paints the same wash for the same seed and another for a different seed", () => {
    const a = erase(120, 160, wash());
    expect(Array.from(erase(120, 160, wash()))).toEqual(Array.from(a));
    expect(Array.from(erase(120, 160, wash({ seed: 8 })))).not.toEqual(Array.from(a));
  });

  // Fails on: brush sizes in pixels of the output, so a thumbnail preview shows a different wash than the full bake; compared as a mask, not just an edge position.
  it("paints the same mask at two sizes of the same picture", () => {
    const small = erase(100, 141, wash());
    const big = erase(400, 564, wash());
    // Sample the big mask at the small one's pixel centres.
    let diff = 0;
    for (let y = 0; y < 141; y++) for (let x = 0; x < 100; x++) {
      diff += Math.abs(small[y * 100 + x] - big[(y * 4 + 2) * 400 + x * 4 + 2]) / 255;
    }
    expect(diff / (100 * 141)).toBeLessThan(0.03);
  });

  // Fails on: the geometry not following `from`, so a wash asked for on the right lands on the left.
  it("covers the body at the side it comes in from and leaves the far side, for every side", () => {
    const w = 160, h = 160;
    const at = (from: WashStep["from"]) => {
      const e = erase(w, h, wash({ from }));
      return (x: number, y: number) => e[y * w + x];
    };
    const left = at("left"), right = at("right"), top = at("top"), bottom = at("bottom");
    expect(left(5, 100)).toBe(255);
    expect(left(w - 5, 100)).toBe(0);
    expect(right(w - 6, 100)).toBe(255);
    expect(right(5, 100)).toBe(0);
    expect(top(100, 5)).toBe(255);
    expect(top(100, h - 5)).toBe(0);
    expect(bottom(100, h - 6)).toBe(255);
    expect(bottom(100, 5)).toBe(0);
  });

  // Fails on: reach being ignored, so the slider does nothing.
  it("moves the edge with reach", () => {
    const short = edgeFraction(200, 280, wash({ reach: 0.35 }));
    const long = edgeFraction(200, 280, wash({ reach: 0.75 }));
    expect(long).toBeGreaterThan(short + 0.25);
  });

  // Fails on: the body not being solid, so the text sits on a see-through wash.
  it("erases the body well inside the reach completely", () => {
    const w = 200, h = 280;
    const e = erase(w, h, wash({ reach: 0.7 }));
    for (let y = Math.round(h * 0.4); y < Math.round(h * 0.9); y += 7) for (let x = 0; x < w * 0.35; x += 5) expect(e[y * w + x]).toBe(255);
  });

  // Fails on: dry doing nothing to the edge: a dry brush breaks up into streaks, a wet one leaves a more solid edge.
  it("leaves a different edge with a dry brush than a wet one", () => {
    const w = 300, h = 420;
    const partial = (dry: number) => {
      const e = erase(w, h, wash({ dry }));
      let n = 0;
      for (let i = 0; i < e.length; i++) if (e[i] > 20 && e[i] < 235) n++;
      return n;
    };
    expect(partial(1)).not.toBe(partial(0));
  });

  // Fails on: the streaks painted outside the wash, on the picture side.
  it("keeps the streaks (bar a faint soft-tip tail) out of the picture side of the wash", () => {
    const w = 160, h = 160;
    const { light, dark } = paintWashLayers(w, h, wash(), assets);
    for (let y = 0; y < h; y++) for (let x = Math.round(w * 0.95); x < w; x++) {
      expect(light[y * w + x]).toBeLessThan(8);
      expect(dark[y * w + x]).toBeLessThan(8);
    }
  });
});
