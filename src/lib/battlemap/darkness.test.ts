import { describe, expect, it, vi } from "vitest";
import type { MakeCanvas } from "@/cartographer/drawMap";
import { DM_VEIL, VEIL_RGB, paintLitVeil, veilAlpha } from "./darkness";

/** A canvas factory whose image data is a plain array, so the painted pixels can be read back. */
function fakeCanvas() {
  const puts: { data: Uint8ClampedArray; w: number; h: number }[] = [];
  const makeCanvas: MakeCanvas = (w, h) => ({
    canvas: { w, h } as unknown as CanvasImageSource,
    ctx: {
      createImageData: (iw: number, ih: number) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih }),
      putImageData: (img: { data: Uint8ClampedArray }) => puts.push({ data: img.data, w, h }),
    } as unknown as CanvasRenderingContext2D,
  });
  return { makeCanvas, puts };
}

const target = () => ({ save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: false });

describe("darkness veil", () => {
  it("gets stronger from dim to dark and stays translucent for the DM", () => {
    expect(DM_VEIL.daylight).toBe(0);
    expect(DM_VEIL.dim).toBeGreaterThan(DM_VEIL.daylight);
    expect(DM_VEIL.dark).toBeGreaterThan(DM_VEIL.dim);
    expect(DM_VEIL.dark).toBeLessThan(1);
  });

  it("maps light levels to the veil's strength", () => {
    expect(veilAlpha(1)).toBe(0);
    expect(veilAlpha(0.5)).toBeCloseTo(DM_VEIL.dim, 9);
    expect(veilAlpha(0)).toBe(DM_VEIL.dark);
  });

  it("paints the grid as one smoothed image over the rect", () => {
    const { makeCanvas, puts } = fakeCanvas();
    const ctx = target();
    const grid = new Float32Array([0, 0.5, 1, 0]);
    expect(paintLitVeil(ctx, { x: 5, y: 6, w: 40, h: 20 }, grid, 2, 2, makeCanvas)).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 5, 6, 40, 20);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    const px = puts[0].data;
    expect(Array.from(px.slice(0, 4))).toEqual([...VEIL_RGB, Math.round(DM_VEIL.dark * 255)]);
    expect(px[7]).toBe(Math.round(DM_VEIL.dim * 255));
    expect(px[11]).toBe(0);
  });

  it("draws nothing when the grid is bright everywhere, the rect is empty or no canvas can be made", () => {
    const { makeCanvas } = fakeCanvas();
    const ctx = target();
    expect(paintLitVeil(ctx, { x: 0, y: 0, w: 10, h: 10 }, new Float32Array([1, 1]), 2, 1, makeCanvas)).toBe(false);
    expect(paintLitVeil(ctx, { x: 0, y: 0, w: 0, h: 10 }, new Float32Array([0, 0]), 2, 1, makeCanvas)).toBe(false);
    expect(paintLitVeil(ctx, { x: 0, y: 0, w: 10, h: 10 }, new Float32Array([0, 0]), 2, 1, undefined)).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
