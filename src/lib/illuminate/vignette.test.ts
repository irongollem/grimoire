import { describe, it, expect, vi } from "vitest";
import { applyVignette, DEFAULT_VIGNETTE, type VignetteOptions } from "@/lib/illuminate/vignette";

// happy-dom's canvas.getContext("2d") returns null, so tests supply a minimal
// fake context backed by a real ImageData (happy-dom implements the ImageData
// constructor even though it doesn't implement real 2d rendering).

function makeCtx(
  width: number,
  height: number,
  fill: [number, number, number, number],
): {
  ctx: CanvasRenderingContext2D;
  getImageData: ReturnType<typeof vi.fn>;
  pixelAt: (x: number, y: number) => [number, number, number, number];
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  let out = data;
  const getImageData = vi.fn(() => new ImageData(data, width, height));
  const putImageData = vi.fn((imageData: ImageData) => {
    out = imageData.data;
  });
  const ctx = { getImageData, putImageData };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    getImageData,
    pixelAt: (x, y) => {
      const i = (y * width + x) * 4;
      return [out[i], out[i + 1], out[i + 2], out[i + 3]];
    },
  };
}

function vignette(over: Partial<VignetteOptions>): VignetteOptions {
  return { ...DEFAULT_VIGNETTE, ...over };
}

describe("applyVignette — early exits", () => {
  it("never reads pixel data when disabled", () => {
    const { ctx, getImageData } = makeCtx(10, 10, [200, 200, 200, 255]);
    applyVignette(ctx, 10, 10, vignette({ enabled: false, strength: 1 }));
    expect(getImageData).not.toHaveBeenCalled();
  });

  it("never reads pixel data when strength is 0", () => {
    const { ctx, getImageData } = makeCtx(10, 10, [200, 200, 200, 255]);
    applyVignette(ctx, 10, 10, vignette({ enabled: true, strength: 0 }));
    expect(getImageData).not.toHaveBeenCalled();
  });

  it("never reads pixel data when strength is negative", () => {
    const { ctx, getImageData } = makeCtx(10, 10, [200, 200, 200, 255]);
    applyVignette(ctx, 10, 10, vignette({ enabled: true, strength: -0.1 }));
    expect(getImageData).not.toHaveBeenCalled();
  });
});

describe('applyVignette — "transparent" mode', () => {
  it("leaves the dead-centre pixel completely untouched", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(ctx, 100, 100, vignette({ enabled: true, strength: 1, softness: 0.5 }));
    expect(pixelAt(50, 50)).toEqual([200, 150, 50, 255]);
  });

  it("fully erases alpha at the farthest corner when strength is 1", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(ctx, 100, 100, vignette({ enabled: true, strength: 1, softness: 0.5 }));
    const [r, g, b, a] = pixelAt(0, 0);
    // colour is preserved in transparent mode - only alpha is touched
    expect([r, g, b]).toEqual([200, 150, 50]);
    expect(a).toBe(0);
  });

  it("scales the corner's alpha reduction linearly with strength", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(ctx, 100, 100, vignette({ enabled: true, strength: 0.5, softness: 0.5 }));
    expect(pixelAt(0, 0)[3]).toBe(128); // round(255 * (1 - 0.5))
  });
});

describe('applyVignette — "colour" mode', () => {
  it("blends the corner fully to the vignette colour at strength 1, preserving alpha", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(
      ctx,
      100,
      100,
      vignette({ enabled: true, strength: 1, softness: 0.5, mode: "colour", colour: "#ff0000" }),
    );
    expect(pixelAt(0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("leaves the centre pixel's colour untouched", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(
      ctx,
      100,
      100,
      vignette({ enabled: true, strength: 1, softness: 0.5, mode: "colour", colour: "#0000ff" }),
    );
    expect(pixelAt(50, 50)).toEqual([200, 150, 50, 255]);
  });

  it("expands a 3-digit hex shorthand the same as its 6-digit form", () => {
    const short = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(
      short.ctx,
      100,
      100,
      vignette({ enabled: true, strength: 1, softness: 0.5, mode: "colour", colour: "#0f0" }),
    );
    const long = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(
      long.ctx,
      100,
      100,
      vignette({ enabled: true, strength: 1, softness: 0.5, mode: "colour", colour: "#00ff00" }),
    );
    expect(short.pixelAt(0, 0)).toEqual(long.pixelAt(0, 0));
  });

  it("falls back to black for an unparseable colour instead of throwing", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    expect(() =>
      applyVignette(
        ctx,
        100,
        100,
        vignette({ enabled: true, strength: 1, softness: 0.5, mode: "colour", colour: "zzzzzz" }),
      ),
    ).not.toThrow();
    expect(pixelAt(0, 0)).toEqual([0, 0, 0, 255]);
  });
});

describe("applyVignette — softness = 0 (degenerate but intentional)", () => {
  // softness sets the inner radius, so softness=0 puts it *at* maxR and leaves
  // zero area between the inner radius and the edge: no visible vignette. That
  // is the formula's design, not a bug, and these tests pin it so a future
  // reader does not "fix" it by changing the falloff curve.
  //
  // What WAS a bug: with innerR === maxR the range was 0, so the exact farthest
  // corner divided 0/0. See the second test for the regression guard.
  it("renders no vignette away from the corner", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(ctx, 100, 100, vignette({ enabled: true, strength: 1, softness: 0 }));
    // A pixel near, but not at, the corner is completely unaffected.
    expect(pixelAt(1, 1)).toEqual([200, 150, 50, 255]);
  });

  it("leaves the farthest corner pixel untouched too — no NaN artifact", () => {
    const { ctx, pixelAt } = makeCtx(100, 100, [200, 150, 50, 255]);
    applyVignette(ctx, 100, 100, vignette({ enabled: true, strength: 1, softness: 0 }));
    // Regression guard. Before the range floor this pixel divided 0/0, and NaN
    // is not <= 0, so it skipped the early-out and got written with NaN blend
    // factors that Uint8ClampedArray coerced to 0 — one stray black corner.
    expect(pixelAt(0, 0)).toEqual([200, 150, 50, 255]);
  });
});
