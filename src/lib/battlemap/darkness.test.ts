import { describe, expect, it, vi } from "vitest";
import type { MakeCanvas } from "@/cartographer/drawFrame";
import { DM_VEIL, VEIL_RGB, paintLitVeil, paintPlayerVeil, paintZoneRings, veilAlpha, zoneIdAt } from "./darkness";

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

describe("paintPlayerVeil", () => {
  /** Canvases that record what is drawn onto them, in order, so the grey pass can be read back. */
  function recordingCanvas() {
    const log: string[] = [];
    const puts: Uint8ClampedArray[] = [];
    const makeCanvas: MakeCanvas = (w, h) => {
      const ctx = {
        filter: "none",
        globalCompositeOperation: "source-over",
        imageSmoothingEnabled: false,
        createImageData: (iw: number, ih: number) => ({ data: new Uint8ClampedArray(iw * ih * 4), width: iw, height: ih }),
        putImageData: (img: { data: Uint8ClampedArray }) => puts.push(img.data),
        stack: [] as { filter: string; globalCompositeOperation: string }[],
        save() {
          this.stack.push({ filter: this.filter, globalCompositeOperation: this.globalCompositeOperation });
        },
        restore() {
          Object.assign(this, this.stack.pop());
        },
        drawImage(this: { filter: string; globalCompositeOperation: string }, image: { tag?: string }) {
          log.push(`${image.tag ?? "canvas"}:${this.filter}:${this.globalCompositeOperation}`);
        },
      };
      return { canvas: { width: w, height: h } as unknown as HTMLCanvasElement, ctx: ctx as unknown as CanvasRenderingContext2D };
    };
    return { makeCanvas, log, puts };
  }

  const rect = { x: 0, y: 0, w: 40, h: 40 };
  const picture = (tag: string) => ({ image: { tag } as unknown as CanvasImageSource, rect });

  it("paints the veil at the player's strength: clear when seen, opaque when blind", () => {
    const { makeCanvas, puts } = recordingCanvas();
    const ctx = target();
    const vision = { seen: new Float32Array([1, 0.5, 0, 0.75]), grey: new Float32Array(4) };
    expect(paintPlayerVeil(ctx, rect, vision, 2, 2, makeCanvas, [])).toBe(true);
    const alphas = Array.from({ length: 4 }, (_, i) => puts[0][i * 4 + 3]);
    expect(alphas).toEqual([0, Math.round(0.45 * 255), 255, Math.round(0.225 * 255)]);
    expect(Array.from(puts[0].slice(0, 3))).toEqual([...VEIL_RGB]);
  });

  it("draws the pictures in grey, masked by the grey grid, before the veil", () => {
    const { makeCanvas, log } = recordingCanvas();
    const ctx = target();
    const vision = { seen: new Float32Array([0.5, 0.5, 0.5, 0.5]), grey: new Float32Array([1, 1, 0, 0]) };
    paintPlayerVeil(ctx, rect, vision, 2, 2, makeCanvas, [picture("ground"), picture("stand")]);
    // Both pictures drawn through the grayscale filter, then the mask destination-in.
    expect(log.slice(0, 3)).toEqual(["ground:grayscale(1):source-over", "stand:grayscale(1):source-over", "canvas:none:destination-in"]);
    // The grey layer and then the veil are drawn onto the target.
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("draws the veil alone when no picture has loaded, and nothing where all is seen and no grey", () => {
    const { makeCanvas } = recordingCanvas();
    const withGrey = { seen: new Float32Array([0.5, 0.5]), grey: new Float32Array([1, 1]) };
    const ctx = target();
    paintPlayerVeil(ctx, rect, withGrey, 2, 1, makeCanvas, []);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const clear = { seen: new Float32Array([1, 1]), grey: new Float32Array(2) };
    const none = target();
    expect(paintPlayerVeil(none, rect, clear, 2, 1, makeCanvas, [picture("ground")])).toBe(false);
    expect(none.drawImage).not.toHaveBeenCalled();
  });
});

describe("zoneIdAt and paintZoneRings", () => {
  const zones = [
    { id: "a", x: 5, y: 5, radius: 20 },
    { id: "b", x: 6, y: 5, radius: 10 },
  ];
  it("picks the topmost sphere holding the point, or none", () => {
    expect(zoneIdAt(zones, 6, 5)).toBe("b");
    expect(zoneIdAt(zones, 2, 5)).toBe("a");
    expect(zoneIdAt(zones, 20, 20)).toBeNull();
  });
  it("strokes one dashed ring per sphere at its radius", () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn(), strokeStyle: "", lineWidth: 0 };
    paintZoneRings(ctx, zones, 100, 50, 10);
    expect(ctx.setLineDash).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenNthCalledWith(1, 150, 100, 40, 0, Math.PI * 2);
    expect(ctx.arc).toHaveBeenNthCalledWith(2, 160, 100, 20, 0, Math.PI * 2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});
