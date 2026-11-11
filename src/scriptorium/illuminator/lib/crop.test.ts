// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { cropOf, cropPixels, croppedSize, drawBase } from "./crop";
import { hashSettings, normaliseSettings, parseSettings, type IlluminateSettings } from "./treatment";

const settings = (...steps: IlluminateSettings["steps"]): IlluminateSettings => ({ v: 1, seed: 1, steps });
const grade = { type: "grade", options: { brightness: 0, contrast: 0.2, saturation: 0, temperature: 0, hue: 0 } } as const;

describe("the crop in a recipe", () => {
  // Fails on: a crop that is not first among the steps being applied after them, so they would work on the uncropped picture.
  it("runs before every step but the AI base, whatever order the array lists them in", () => {
    const ai = { type: "ai", action: "ink", output: "ai.webp" } as const;
    const crop = { type: "crop", x: 0.1, y: 0.1, w: 0.5, h: 0.5 } as const;
    expect(normaliseSettings(settings(grade, crop, ai)).steps.map((s) => s.type)).toEqual(["ai", "crop", "grade"]);
  });

  // Fails on: a hand-edited or old document with a crop outside the picture baking to a blank or negative canvas.
  it("is clamped into the picture and never thinner than a sliver", () => {
    const parsed = parseSettings({ v: 1, seed: 1, steps: [{ type: "crop", x: -0.5, y: 0.9, w: 3, h: 0.5 }] });
    expect(cropOf(parsed)).toEqual({ type: "crop", x: 0, y: 0.5, w: 1, h: 0.5 });
    const sliver = cropOf(parseSettings({ v: 1, seed: 1, steps: [{ type: "crop", x: 0, y: 0, w: 0, h: 0.5 }] }));
    expect(sliver?.w).toBeGreaterThan(0);
  });

  // Fails on: a crop that keeps everything counting as an edit, so a picture is re-baked and treated for nothing.
  it("that keeps the whole picture is no crop at all", () => {
    expect(parseSettings({ v: 1, seed: 1, steps: [{ type: "crop", x: 0, y: 0, w: 1, h: 1 }] })?.steps).toEqual([]);
  });

  // Fails on: a moved crop leaving the bake looking current, so the page keeps showing the old cut.
  it("changes the hash, so a bake made for another crop is stale", () => {
    const a = hashSettings(settings({ type: "crop", x: 0, y: 0, w: 0.5, h: 0.5 }));
    const b = hashSettings(settings({ type: "crop", x: 0.1, y: 0, w: 0.5, h: 0.5 }));
    expect(a).not.toBe(b);
  });
});

describe("cropPixels and croppedSize", () => {
  it("is the whole picture without a crop", () => {
    expect(croppedSize({ width: 800, height: 600 }, settings(grade))).toEqual({ width: 800, height: 600 });
  });

  // Fails on: the size being the whole picture's, or rounding past the edge.
  it("is the kept part's pixels, never past the picture's edge", () => {
    const crop = { type: "crop", x: 0.5, y: 0.25, w: 0.5, h: 0.5 } as const;
    expect(cropPixels({ width: 801, height: 600 }, crop)).toEqual({ sx: 401, sy: 150, sw: 400, sh: 300 });
    expect(croppedSize({ width: 801, height: 600 }, settings(crop))).toEqual({ width: 400, height: 300 });
  });
});

describe("drawBase", () => {
  // Fails on: the whole picture being squeezed into the cropped canvas instead of the kept part filling it.
  it("draws the kept part over the whole canvas", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    const base = {} as HTMLImageElement;
    drawBase(ctx, base, { width: 1000, height: 500 }, settings({ type: "crop", x: 0.25, y: 0, w: 0.5, h: 1 }), 500, 500);
    expect(drawImage).toHaveBeenCalledWith(base, 250, 0, 500, 500, 0, 0, 500, 500);
  });
});
