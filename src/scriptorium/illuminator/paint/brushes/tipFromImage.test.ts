import { describe, expect, it } from "vitest";
import { MAX_TIP_EDGE, NO_MARK, NOT_ON_PAPER, quadrantOf, tipFromImage, type RgbaPixels } from "./tipFromImage";

/** A grey picture with shapes drawn on it: `paint` returns a grey (or null to leave the ground) per pixel. */
function picture(w: number, h: number, ground: number, paint: (x: number, y: number) => number | null, alpha = 255): RgbaPixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = paint(x, y) ?? ground;
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = alpha;
    }
  }
  return { width: w, height: h, data };
}
const dot = (cx: number, cy: number, r: number, ink: number) => (x: number, y: number) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? ink : null);

describe("tipFromImage", () => {
  it("turns a dark dot on white into a square tip that is solid in the middle and clear at the corners", () => {
    // Fails on: coverage not following the ink, or a tip that is not trimmed to a square round the mark.
    const r = tipFromImage(picture(200, 120, 255, dot(100, 60, 30, 20)));
    if (!r.ok) throw new Error(r.message);
    expect(r.tip.width).toBe(r.tip.height);
    expect(r.tip.width).toBeLessThan(80);
    const mid = r.tip.alpha[Math.floor(r.tip.height / 2) * r.tip.width + Math.floor(r.tip.width / 2)];
    expect(mid).toBeGreaterThan(240);
    expect(r.tip.alpha[0]).toBe(0);
  });

  it("finds a small dab in a big photo, and ignores a few specks of dust", () => {
    // Fails on: an ink level taken from too many pixels, so a dab under one percent of the photo reads as no mark; or from too few, so one dark speck becomes the brush.
    const small = tipFromImage(picture(600, 600, 255, dot(300, 300, 14, 20)));
    if (!small.ok) throw new Error(small.message);
    expect(small.tip.width).toBeLessThan(40);
    const dust = tipFromImage(picture(600, 600, 255, (x, y) => ((x === 100 && y === 100) || (x === 400 && y === 250) ? 0 : null)));
    expect(dust).toEqual({ ok: false, message: NO_MARK });
  });

  it("keeps a tinted paper clear: the paper's own grey is not ink", () => {
    // Fails on: reading paper against pure white, which would make a cream or grey sheet a solid black tip.
    const r = tipFromImage(picture(160, 160, 190, dot(80, 80, 25, 40)));
    if (!r.ok) throw new Error(r.message);
    expect(r.tip.alpha[0]).toBe(0);
    expect(r.tip.alpha[r.tip.width - 1]).toBe(0);
    const mid = r.tip.alpha[Math.floor(r.tip.height / 2) * r.tip.width + Math.floor(r.tip.width / 2)];
    expect(mid).toBeGreaterThan(240);
  });

  it("refuses a blank sheet of paper", () => {
    // Fails on: producing an empty or noise-only brush from a picture with nothing on it.
    const r = tipFromImage(picture(100, 100, 255, () => null));
    expect(r).toEqual({ ok: false, message: NO_MARK });
  });

  it("refuses a light mark on a dark ground rather than making a brush of the background", () => {
    // Fails on: a light-on-dark picture being read as a dark mark shaped like everything but the dot.
    const r = tipFromImage(picture(100, 100, 30, dot(50, 50, 15, 230)));
    expect(r).toEqual({ ok: false, message: NO_MARK });
  });

  it("refuses a mark that runs off every edge", () => {
    // Fails on: accepting a picture that is not one mark on paper (a photo of a pattern or a close crop).
    const arm = (v: number) => Math.abs(v - 50) < 14;
    const r = tipFromImage(picture(100, 100, 255, (x, y) => (arm(x) || arm(y) ? 10 : null)));
    expect(r).toEqual({ ok: false, message: NOT_ON_PAPER });
  });

  it("counts a see-through pixel as paper, whatever colour it holds", () => {
    // Fails on: a transparent PNG's hidden black turning the whole picture into a solid tip.
    const px = picture(80, 80, 255, dot(40, 40, 12, 20));
    for (let i = 0; i < 80 * 80; i++) if (px.data[i * 4] === 255) (px.data as Uint8ClampedArray)[i * 4 + 3] = 0;
    const clear = tipFromImage(px);
    if (!clear.ok) throw new Error(clear.message);
    expect(clear.tip.alpha[0]).toBe(0);
    expect(Math.max(...clear.tip.alpha)).toBeGreaterThan(240);
  });

  it("never makes a tip larger than 512 on a side, and keeps its shape when it shrinks", () => {
    // Fails on: a 4000 px photo becoming a 4000 px tip the engine stamps slowly, or a squashed mark.
    const r = tipFromImage(picture(2000, 1200, 255, dot(1000, 600, 500, 10)));
    if (!r.ok) throw new Error(r.message);
    expect(r.tip.width).toBe(MAX_TIP_EDGE);
    expect(r.tip.height).toBe(MAX_TIP_EDGE);
    expect(r.tip.alpha[Math.floor(MAX_TIP_EDGE / 2) * MAX_TIP_EDGE + MAX_TIP_EDGE / 2]).toBeGreaterThan(240);
  });

  it("pads a wide mark to a square, centred", () => {
    // Fails on: a bar tip stretched to a square, or pushed against one side.
    const r = tipFromImage(picture(200, 100, 255, (x, y) => (x > 40 && x < 160 && y > 45 && y < 55 ? 10 : null)));
    if (!r.ok) throw new Error(r.message);
    expect(r.tip.width).toBe(r.tip.height);
    const rows = Array.from({ length: r.tip.height }, (_, y) => r.tip.alpha.slice(y * r.tip.width, (y + 1) * r.tip.width).some((v) => v > 128));
    const first = rows.indexOf(true);
    const last = rows.lastIndexOf(true);
    expect(Math.abs(first + last - (r.tip.height - 1))).toBeLessThanOrEqual(2);
  });
});

describe("quadrantOf", () => {
  it("cuts each quarter of a sheet out on its own", () => {
    // Fails on: quadrants swapped or overlapping, so two of the four tips would be the same mark.
    const sheet = picture(100, 100, 255, (x, y) => (x < 50 && y < 50 ? 1 : x >= 50 && y < 50 ? 2 : x < 50 ? 3 : 4));
    expect([0, 1, 2, 3].map((i) => quadrantOf(sheet, i as 0 | 1 | 2 | 3).data[0])).toEqual([1, 2, 3, 4]);
    expect(quadrantOf(sheet, 3).width).toBe(50);
  });
});
