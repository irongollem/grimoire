import { describe, it, expect } from "vitest";
import { zoomStep, zoomAtPoint, MIN_ZOOM, MAX_ZOOM } from "./viewport";

describe("zoomStep", () => {
  it("scroll up zooms in, scroll down zooms out", () => {
    expect(zoomStep(1, -1)).toBeCloseTo(1.1, 10);
    expect(zoomStep(1, 1)).toBeCloseTo(1 / 1.1, 10);
  });

  it("clamps to the 5%–400% range", () => {
    expect(zoomStep(MAX_ZOOM, -1)).toBe(MAX_ZOOM);
    expect(zoomStep(MIN_ZOOM, 1)).toBe(MIN_ZOOM);
  });

  it("deltaY of exactly 0 zooms out — it is not treated as negative", () => {
    expect(zoomStep(1, 0)).toBeCloseTo(1 / 1.1, 10);
  });
});

describe("zoomAtPoint — the world point under the cursor stays put", () => {
  // The invariant that matters: screen->world for the cursor is unchanged
  // across the zoom, so the map does not slide out from under the pointer.
  const worldUnderCursor = (vp: { zoom: number; offset: { x: number; y: number } }, cx: number, dpr: number) =>
    (vp.offset.x + cx * dpr) / vp.zoom;

  it("holds the invariant zooming in", () => {
    const vp = { zoom: 1, offset: { x: 120, y: -40 } };
    const before = worldUnderCursor(vp, 300, 2);
    const after = zoomAtPoint(vp, { x: 300, y: 150 }, 2, -1);
    expect(worldUnderCursor(after, 300, 2)).toBeCloseTo(before, 6);
  });

  it("holds the invariant zooming out, at dpr 1 and a negative offset", () => {
    const vp = { zoom: 2, offset: { x: -80, y: 15 } };
    const before = worldUnderCursor(vp, 42, 1);
    const after = zoomAtPoint(vp, { x: 42, y: 7 }, 1, 1);
    expect(worldUnderCursor(after, 42, 1)).toBeCloseTo(before, 6);
  });

  it("does not move the offset when the zoom is already clamped", () => {
    const vp = { zoom: MAX_ZOOM, offset: { x: 10, y: 20 } };
    const after = zoomAtPoint(vp, { x: 5, y: 5 }, 1, -1);
    expect(after.zoom).toBe(MAX_ZOOM);
    expect(after.offset).toEqual({ x: 10, y: 20 });
  });
});
