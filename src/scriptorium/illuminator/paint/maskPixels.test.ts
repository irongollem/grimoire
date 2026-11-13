import { describe, expect, it } from "vitest";
import { TiledLayer } from "./engine/tiledLayer";
import { fillMaskFromPixels, maskHasPaint, maskToPixels } from "./maskPixels";

function pixels(w: number, h: number, alphaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alphaAt(x, y);
  return { width: w, height: h, data };
}

describe("the mask between recipe and session", () => {
  // Fails if a saved mask is not read back exactly (a tile boundary off by one would shift the erasure), or if
  // saving it again changes it: opening and saving must not drift the picture.
  it("round-trips alpha across tile edges, in white", () => {
    const mask = new TiledLayer(300, 70, 64);
    const src = pixels(300, 70, (x, y) => ((x * 7 + y * 3) % 5 === 0 ? 200 : 0));
    fillMaskFromPixels(mask, src);
    const out = maskToPixels(mask);
    for (let i = 0; i < src.data.length; i += 4) expect(out.data[i + 3]).toBe(src.data[i + 3]);
    expect(out.data[(0 * 300 + 0) * 4]).toBe(255);
  });

  // Fails if an untouched mask counts as having strokes, which would add a mask step to every recipe.
  it("an empty picture makes no tiles", () => {
    const mask = new TiledLayer(128, 128, 64);
    fillMaskFromPixels(mask, pixels(128, 128, () => 0));
    expect(maskHasPaint(mask)).toBe(false);
  });

  // Fails if a mask of the wrong size is accepted: it would be read with the wrong stride and scramble.
  it("refuses a picture that is not the layer's size", () => {
    expect(() => fillMaskFromPixels(new TiledLayer(64, 64, 64), pixels(32, 32, () => 255))).toThrow();
  });
});
