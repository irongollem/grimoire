import { describe, it, expect, vi } from "vitest";
import { applyDofBlur, DEFAULT_DOF_BLUR, type DofBlurOptions } from "@/lib/illuminate/dofBlur";

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

function dof(over: Partial<DofBlurOptions>): DofBlurOptions {
  return { ...DEFAULT_DOF_BLUR, ...over };
}

describe("applyDofBlur — early exits", () => {
  it("never reads pixel data when disabled", () => {
    const { ctx, getImageData } = makeCtx(4, 4, [200, 150, 50, 255]);
    applyDofBlur(ctx, 4, 4, dof({ enabled: false, blurStrength: 1, desaturation: 1 }));
    expect(getImageData).not.toHaveBeenCalled();
  });

  it("never reads pixel data when both blurStrength and desaturation are 0", () => {
    const { ctx, getImageData } = makeCtx(4, 4, [200, 150, 50, 255]);
    applyDofBlur(ctx, 4, 4, dof({ enabled: true, blurStrength: 0, desaturation: 0 }));
    expect(getImageData).not.toHaveBeenCalled();
  });

  it("still runs when only desaturation is non-zero", () => {
    const { ctx, getImageData } = makeCtx(4, 4, [200, 150, 50, 255]);
    applyDofBlur(ctx, 4, 4, dof({ enabled: true, blurStrength: 0, desaturation: 1 }));
    expect(getImageData).toHaveBeenCalled();
  });
});

describe("applyDofBlur — focus zone", () => {
  it("leaves pixels inside the sharp focus radius completely untouched", () => {
    const { ctx, pixelAt } = makeCtx(4, 4, [255, 0, 0, 255]);
    applyDofBlur(
      ctx,
      4,
      4,
      dof({
        enabled: true,
        focalX: 0.5,
        focalY: 0.5,
        focusRadius: 0.5,
        blurStrength: 0,
        desaturation: 1,
        falloff: "linear",
      }),
    );
    // the focal point (0.5, 0.5) of a 4x4 image lands exactly on pixel (2, 2)
    expect(pixelAt(2, 2)).toEqual([255, 0, 0, 255]);
  });

  it("fully desaturates the farthest corner to luminance when desaturation is 1", () => {
    const { ctx, pixelAt } = makeCtx(4, 4, [255, 0, 0, 255]);
    applyDofBlur(
      ctx,
      4,
      4,
      dof({
        enabled: true,
        focalX: 0.5,
        focalY: 0.5,
        focusRadius: 0.5,
        blurStrength: 0,
        desaturation: 1,
        falloff: "linear",
      }),
    );
    // luminance of pure red = 0.299 * 255 = 76.245 -> rounds to 76
    expect(pixelAt(0, 0)).toEqual([76, 76, 76, 255]);
  });

  it("never touches the alpha channel", () => {
    const { ctx, pixelAt } = makeCtx(4, 4, [255, 0, 0, 123]);
    applyDofBlur(
      ctx,
      4,
      4,
      dof({ enabled: true, focusRadius: 0, blurStrength: 0, desaturation: 1, falloff: "linear" }),
    );
    expect(pixelAt(0, 0)[3]).toBe(123);
    expect(pixelAt(3, 3)[3]).toBe(123);
  });
});

describe("applyDofBlur — blur pyramid", () => {
  it("leaves a uniformly coloured image unchanged (box blur of a flat image is a no-op)", () => {
    const { ctx, pixelAt } = makeCtx(8, 8, [200, 100, 50, 255]);
    applyDofBlur(
      ctx,
      8,
      8,
      dof({
        enabled: true,
        focalX: 0.5,
        focalY: 0.5,
        focusRadius: 0,
        blurStrength: 1,
        desaturation: 0,
        falloff: "linear",
      }),
    );
    expect(pixelAt(0, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelAt(7, 7)).toEqual([200, 100, 50, 255]);
  });
});

describe("applyDofBlur — falloff curve", () => {
  it("orders effect strength quadratic < linear and cubic < quadratic at the same distance", () => {
    // A pixel at a fixed intermediate distance gets a bigger push toward
    // luminance the "faster" the falloff curve ramps up at that point:
    // linear(t) > quadratic(t) > cubic(t) for any 0 < t < 1.
    const redAt = (falloff: DofBlurOptions["falloff"]): number => {
      const { ctx, pixelAt } = makeCtx(4, 1, [255, 0, 0, 255]);
      applyDofBlur(
        ctx,
        4,
        1,
        dof({
          enabled: true,
          focalX: 0.5,
          focalY: 0.5,
          focusRadius: 0,
          blurStrength: 0,
          desaturation: 1,
          falloff,
        }),
      );
      return pixelAt(3, 0)[0];
    };

    const linearRed = redAt("linear");
    const quadraticRed = redAt("quadratic");
    const cubicRed = redAt("cubic");

    // more desaturation pushes red further down toward the ~76 luminance floor
    expect(linearRed).toBeLessThan(quadraticRed);
    expect(quadraticRed).toBeLessThan(cubicRed);
  });
});
