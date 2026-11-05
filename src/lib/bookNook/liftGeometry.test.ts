import { describe, expect, it } from "vitest";
import { alphaBounds, hasTransparency, maskFromAlpha, nudgeRect, paddedCrop, partRect, rectFromCorners, resizeRect } from "./liftGeometry";

const px = (w: number, h: number, alphaAt: (x: number, y: number) => number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = alphaAt(x, y);
  return d;
};

describe("hasTransparency", () => {
  it("is false for a flat picture and true as soon as one pixel is see-through", () => {
    // Bug: a flat upload mistaken for a cut-out is placed with its background box; or a cut-out is offered Remove background.
    expect(hasTransparency(px(4, 4, () => 255))).toBe(false);
    expect(hasTransparency(px(4, 4, (x, y) => (x === 3 && y === 3 ? 0 : 255)))).toBe(true);
    expect(hasTransparency(px(2, 2, () => 249))).toBe(true);
    expect(hasTransparency(px(2, 2, () => 250))).toBe(false);
  });
});

describe("paddedCrop", () => {
  it("adds 8% of the drawn size on every side", () => {
    expect(paddedCrop({ x: 100, y: 100, w: 100, h: 200 }, { width: 1000, height: 1000 })).toEqual({ x: 92, y: 84, w: 116, h: 232 });
  });
  it("never leaves the room", () => {
    // Bug: a crop past the edge makes canvas drawImage read outside the picture and shifts the composite.
    expect(paddedCrop({ x: 0, y: 0, w: 100, h: 100 }, { width: 104, height: 1000 })).toEqual({ x: 0, y: 0, w: 104, h: 108 });
    const c = paddedCrop({ x: 900, y: 900, w: 100, h: 100 }, { width: 1000, height: 1000 });
    expect(c.x + c.w).toBe(1000);
    expect(c.y + c.h).toBe(1000);
  });
});

describe("rect editing", () => {
  const room = { width: 200, height: 100 };
  it("normalises a drag in any direction and clamps it", () => {
    expect(rectFromCorners({ x: 150, y: 80 }, { x: 20, y: 10 }, room)).toEqual({ x: 20, y: 10, w: 130, h: 70 });
    expect(rectFromCorners({ x: -50, y: -5 }, { x: 500, y: 500 }, room)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
  it("nudges and resizes by keys without leaving the picture", () => {
    expect(nudgeRect({ x: 190, y: 0, w: 10, h: 10 }, 20, -5, room)).toEqual({ x: 190, y: 0, w: 10, h: 10 });
    expect(resizeRect({ x: 150, y: 0, w: 40, h: 10 }, 40, 0, room).w).toBe(50);
    expect(resizeRect({ x: 0, y: 0, w: 20, h: 20 }, -100, -100, room)).toMatchObject({ w: 8, h: 8 });
  });
});

describe("alphaBounds and partRect", () => {
  it("finds the opaque pixels and puts them back in room space", () => {
    const a = px(10, 10, (x, y) => (x >= 2 && x <= 4 && y >= 3 && y <= 7 ? 255 : 0));
    const bounds = alphaBounds(a, 10, 10);
    expect(bounds).toEqual({ x: 2, y: 3, w: 3, h: 5 });
    // Bug: forgetting the crop origin puts the part at the room's corner instead of where it came from.
    expect(partRect(bounds!, { x: 100, y: 200, w: 10, h: 10 })).toEqual({ x: 102, y: 203, w: 3, h: 5 });
    expect(alphaBounds(px(3, 3, () => 0), 3, 3)).toBeNull();
  });
});

describe("maskFromAlpha", () => {
  it("is transparent over the part grown by the margin, opaque elsewhere", () => {
    const part = px(21, 21, (x, y) => (x === 10 && y === 10 ? 255 : 0));
    const m = maskFromAlpha(part, 21, 21, 3);
    const a = (x: number, y: number) => m[(y * 21 + x) * 4 + 3];
    expect(a(10, 10)).toBe(0);
    expect(a(13, 13)).toBe(0);
    expect(a(14, 10)).toBe(255);
    expect(a(0, 0)).toBe(255);
  });
  it("does not mistake a faint fringe for the thing", () => {
    expect(maskFromAlpha(px(3, 3, () => 40), 3, 3, 0)[3]).toBe(255);
  });
});
