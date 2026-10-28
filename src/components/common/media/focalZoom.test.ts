import { describe, expect, it } from "vitest";
import { focalZoomFrame, isZoomed } from "./focalZoom";

const base = {
  containerW: 100, containerH: 150, naturalW: 200, naturalH: 300,
  zoom: 2, anchor: { x: 0.5, y: 0.5 },
};

describe("focalZoomFrame", () => {
  it("sizes the image at cover scale times zoom", () => {
    const f = focalZoomFrame({ ...base, focal: { x: 50, y: 50 } });
    expect(f.width).toBeCloseTo(200);
    expect(f.height).toBeCloseTo(300);
    expect(f.left).toBeCloseTo(-50);
    expect(f.top).toBeCloseTo(-75);
  });

  it("moves a focal point at y=15% to the anchor, not the edge", () => {
    const f = focalZoomFrame({ ...base, focal: { x: 50, y: 15 }, anchor: { x: 0.5, y: 0.42 } });
    // Anchor at 63px; focal at 0.15*300 = 45px into the image: top = 18, clamped to 0.
    // With a 4x zoom there is room to honour the anchor.
    expect(f.top).toBeLessThanOrEqual(0);
    const big = focalZoomFrame({ ...base, zoom: 4, focal: { x: 50, y: 15 }, anchor: { x: 0.5, y: 0.42 } });
    // height 600, focal at 90px, anchor at 63px: top = -27 (inside clamp range).
    expect(big.top).toBeCloseTo(-27);
    expect(big.top + 0.15 * big.height).toBeCloseTo(150 * 0.42);
  });

  it("covers the container on both axes: a wide picture in a tall box is scaled by the taller side", () => {
    const f = focalZoomFrame({
      containerW: 100, containerH: 150, naturalW: 400, naturalH: 300,
      zoom: 1, focal: { x: 50, y: 50 }, anchor: { x: 0.5, y: 0.5 },
    });
    // cover scale = max(100/400, 150/300) = 0.5, so 200 x 150; centred horizontally, exact fit vertically.
    expect(f.width).toBeCloseTo(200);
    expect(f.height).toBeCloseTo(150);
    expect(f.left).toBeCloseTo(-50);
    expect(f.top).toBeCloseTo(0);
  });

  it("puts the focal point at the anchor on each axis separately", () => {
    const f = focalZoomFrame({ ...base, zoom: 4, focal: { x: 50, y: 50 }, anchor: { x: 0.25, y: 0.75 } });
    // 400 x 600 frame: left = 100*0.25 - 200 = -175, top = 150*0.75 - 300 = -187.5.
    expect(f.left).toBeCloseTo(-175);
    expect(f.top).toBeCloseTo(-187.5);
  });

  it("clamps so the image still covers the container", () => {
    const f = focalZoomFrame({ ...base, focal: { x: 0, y: 100 }, anchor: { x: 0.5, y: 0.5 } });
    expect(f.left).toBe(0);
    expect(f.top).toBe(150 - f.height);
    expect(f.left + f.width).toBeGreaterThanOrEqual(100);
    expect(f.top + f.height).toBeGreaterThanOrEqual(150);
  });
});

describe("isZoomed", () => {
  it("only zooms above 1", () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(0.5)).toBe(false);
    expect(isZoomed(2)).toBe(true);
  });
});
