import { describe, it, expect, vi } from "vitest";
import {
  applyColourGrading,
  DEFAULT_COLOUR_GRADING,
  GRADING_PRESETS,
  type ColourGradingOptions,
} from "@/lib/illuminate/colourGrading";

// happy-dom's canvas.getContext("2d") returns null, so tests supply a minimal
// fake context backed by a real ImageData (happy-dom does implement the
// ImageData constructor). getImageData/putImageData are spies so we can both
// assert on call counts (fast-path tests) and recover the mutated pixel data.

function makeCtx(pixels: number[]): {
  ctx: CanvasRenderingContext2D;
  getImageData: ReturnType<typeof vi.fn>;
  readResult: () => number[];
} {
  const width = pixels.length / 4;
  const data = new Uint8ClampedArray(pixels);
  let out = data;
  const getImageData = vi.fn(() => new ImageData(data, width, 1));
  const putImageData = vi.fn((imageData: ImageData) => {
    out = imageData.data;
  });
  const ctx = { getImageData, putImageData };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    getImageData,
    readResult: () => Array.from(out),
  };
}

function grading(over: Partial<ColourGradingOptions>): ColourGradingOptions {
  return { ...DEFAULT_COLOUR_GRADING, ...over };
}

describe("applyColourGrading — fast path", () => {
  it("never reads pixel data when every option is at its default", () => {
    const { ctx, getImageData } = makeCtx([100, 100, 100, 255]);
    applyColourGrading(ctx, 1, 1, DEFAULT_COLOUR_GRADING);
    expect(getImageData).not.toHaveBeenCalled();
  });
});

describe("applyColourGrading — brightness", () => {
  it("adds an offset scaled by 128 to every RGB channel", () => {
    const { ctx, readResult } = makeCtx([100, 100, 100, 200]);
    applyColourGrading(ctx, 1, 1, grading({ brightness: 0.5 }));
    expect(readResult()).toEqual([164, 164, 164, 200]);
  });

  it("clamps at 255 for a strong positive brightness", () => {
    const { ctx, readResult } = makeCtx([250, 250, 250, 255]);
    applyColourGrading(ctx, 1, 1, grading({ brightness: 1 }));
    expect(readResult()).toEqual([255, 255, 255, 255]);
  });

  it("clamps at 0 for a strong negative brightness", () => {
    const { ctx, readResult } = makeCtx([10, 10, 10, 255]);
    applyColourGrading(ctx, 1, 1, grading({ brightness: -1 }));
    expect(readResult()).toEqual([0, 0, 0, 255]);
  });
});

describe("applyColourGrading — contrast", () => {
  it("collapses every channel to mid-grey at contrast -1 (factor 0)", () => {
    const { ctx, readResult } = makeCtx([10, 200, 77, 255]);
    applyColourGrading(ctx, 1, 1, grading({ contrast: -1 }));
    expect(readResult()).toEqual([128, 128, 128, 255]);
  });

  it("scales deviation from mid-grey, clamping out-of-range channels", () => {
    const { ctx, readResult } = makeCtx([200, 50, 128, 255]);
    // factor = (contrast + 1)^2 = 4
    applyColourGrading(ctx, 1, 1, grading({ contrast: 1 }));
    expect(readResult()).toEqual([255, 0, 128, 255]);
  });
});

describe("applyColourGrading — temperature", () => {
  it("warms the image by adding to R and subtracting from B", () => {
    const { ctx, readResult } = makeCtx([100, 100, 100, 255]);
    applyColourGrading(ctx, 1, 1, grading({ temperature: 1 }));
    expect(readResult()).toEqual([130, 100, 70, 255]);
  });

  it("cools the image by subtracting from R and adding to B", () => {
    const { ctx, readResult } = makeCtx([100, 100, 100, 255]);
    applyColourGrading(ctx, 1, 1, grading({ temperature: -1 }));
    expect(readResult()).toEqual([70, 100, 130, 255]);
  });
});

describe("applyColourGrading — saturation", () => {
  it("fully desaturates to the perceptual luminance at saturation -1", () => {
    const { ctx, readResult } = makeCtx([255, 0, 0, 255]);
    applyColourGrading(ctx, 1, 1, grading({ saturation: -1 }));
    // luminance of pure red = 0.299 * 255 = 76.245 -> rounds to 76
    expect(readResult()).toEqual([76, 76, 76, 255]);
  });

  it("pushes channels further from luminance at positive saturation", () => {
    const { ctx, readResult } = makeCtx([150, 100, 100, 255]);
    applyColourGrading(ctx, 1, 1, grading({ saturation: 1 }));
    const [r, g, b, a] = readResult();
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
    expect(a).toBe(255);
  });
});

describe("applyColourGrading — hue", () => {
  it("rotates pure red by 180 degrees into cyan", () => {
    const { ctx, readResult } = makeCtx([255, 0, 0, 255]);
    applyColourGrading(ctx, 1, 1, grading({ hue: 180 }));
    const [r, g, b, a] = readResult();
    expect(r).toBeCloseTo(0, 0);
    expect(g).toBeCloseTo(255, 0);
    expect(b).toBeCloseTo(255, 0);
    expect(a).toBe(255);
  });

  it("wraps a large positive hue back into 0-360 range", () => {
    const a = makeCtx([255, 0, 0, 255]);
    applyColourGrading(a.ctx, 1, 1, grading({ hue: 180 }));
    const b = makeCtx([255, 0, 0, 255]);
    applyColourGrading(b.ctx, 1, 1, grading({ hue: 180 - 360 }));
    // hue -180 and hue +180 land on the same angle modulo 360
    expect(a.readResult()).toEqual(b.readResult());
  });
});

describe("applyColourGrading — alpha channel", () => {
  it("is never modified, regardless of which transforms run", () => {
    const { ctx, readResult } = makeCtx([100, 100, 100, 222]);
    applyColourGrading(
      ctx,
      1,
      1,
      grading({ brightness: 0.5, contrast: 0.5, temperature: 0.5, saturation: 0.5, hue: 45 }),
    );
    expect(readResult()[3]).toBe(222);
  });
});

describe("applyColourGrading — transform order", () => {
  it("applies brightness before contrast, per the documented pipeline order", () => {
    const { ctx, readResult } = makeCtx([100, 100, 100, 255]);
    // brightness (+0.5 -> +64) first: 100 -> 164
    // contrast (+0.5 -> factor 2.25) second: (164 - 128) * 2.25 + 128 = 209
    // Reversing the order would instead yield 129 - the two are far apart,
    // so this pins the order rather than merely the maths.
    applyColourGrading(ctx, 1, 1, grading({ brightness: 0.5, contrast: 0.5 }));
    expect(readResult()).toEqual([209, 209, 209, 255]);
  });
});

describe("GRADING_PRESETS", () => {
  it("keeps every preset value within its documented range", () => {
    for (const preset of GRADING_PRESETS) {
      const { values } = preset;
      expect(values.brightness).toBeGreaterThanOrEqual(-1);
      expect(values.brightness).toBeLessThanOrEqual(1);
      expect(values.contrast).toBeGreaterThanOrEqual(-1);
      expect(values.contrast).toBeLessThanOrEqual(1);
      expect(values.saturation).toBeGreaterThanOrEqual(-1);
      expect(values.saturation).toBeLessThanOrEqual(1);
      expect(values.temperature).toBeGreaterThanOrEqual(-1);
      expect(values.temperature).toBeLessThanOrEqual(1);
      expect(values.hue).toBeGreaterThanOrEqual(-180);
      expect(values.hue).toBeLessThanOrEqual(180);
    }
  });

  it("gives every preset a non-empty label", () => {
    for (const preset of GRADING_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});
