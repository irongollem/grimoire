import { describe, it, expect } from "vitest";
import {
  zoomStep, zoomAtPoint, zoomByFactor, panBy, fitViewport, actualSizeViewport, stepZoom,
  pinchViewport, pinchOf, MIN_ZOOM, MAX_ZOOM,
} from "./viewport";

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

describe("zoomByFactor", () => {
  const worldUnderCursor = (vp: { zoom: number; offset: { x: number; y: number } }, cx: number, dpr: number) =>
    (vp.offset.x + cx * dpr) / vp.zoom;

  it("multiplies the zoom and keeps the world point under the cursor still", () => {
    const vp = { zoom: 1, offset: { x: 120, y: -40 } };
    const after = zoomByFactor(vp, { x: 300, y: 150 }, 2, 1.5);
    expect(after.zoom).toBeCloseTo(1.5, 10);
    expect(worldUnderCursor(after, 300, 2)).toBeCloseTo(worldUnderCursor(vp, 300, 2), 6);
  });

  it("clamps at the limits and scales the offset by the clamped zoom", () => {
    const vp = { zoom: 3, offset: { x: 10, y: 20 } };
    const after = zoomByFactor(vp, { x: 0, y: 0 }, 1, 10);
    expect(after.zoom).toBe(MAX_ZOOM);
    // scale = 4 / 3, cursor at the origin so the offset scales directly.
    expect(after.offset.x).toBeCloseTo(10 * (4 / 3), 10);
    expect(after.offset.y).toBeCloseTo(20 * (4 / 3), 10);
  });

  it("clamps zooming out to the minimum", () => {
    expect(zoomByFactor({ zoom: 0.1, offset: { x: 0, y: 0 } }, { x: 0, y: 0 }, 1, 0.01).zoom).toBe(MIN_ZOOM);
  });
});

describe("panBy", () => {
  it("moves the offset by the CSS delta in device pixels and leaves the zoom", () => {
    const next = panBy({ zoom: 2, offset: { x: 100, y: 50 } }, 10, -5, 2);
    expect(next).toEqual({ zoom: 2, offset: { x: 120, y: 40 } });
  });
});

describe("fitViewport", () => {
  const canvas = { width: 800, height: 600 };

  it("fits the box plus a one-cell margin, centred", () => {
    // 10x6 cells + 1 margin each side = 12x8. Width limits: 800/(12*32) = 2.0833.
    const vp = fitViewport({ minX: 0, minY: 0, maxX: 9, maxY: 5 }, canvas, 1, 32);
    expect(vp.zoom).toBeCloseTo(800 / (12 * 32), 10);
    const tilePx = 32 * vp.zoom;
    // Box centre is cell (5, 3); it must land on the canvas centre.
    expect(5 * tilePx - vp.offset.x).toBeCloseTo(400, 6);
    expect(3 * tilePx - vp.offset.y).toBeCloseTo(300, 6);
  });

  it("is limited by height when the box is tall", () => {
    const vp = fitViewport({ minX: 0, minY: 0, maxX: 1, maxY: 17 }, canvas, 1, 32);
    // 18 + 2 = 20 cells tall: 600 / (20 * 32) = 0.9375.
    expect(vp.zoom).toBeCloseTo(0.9375, 10);
  });

  it("clamps to the zoom range", () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, canvas, 1, 32).zoom).toBe(MAX_ZOOM);
    expect(fitViewport({ minX: 0, minY: 0, maxX: 9999, maxY: 9999 }, canvas, 1, 32).zoom).toBe(MIN_ZOOM);
  });

  it("centres the canvas on the box in device pixels at dpr 2", () => {
    const vp = fitViewport({ minX: 2, minY: 2, maxX: 3, maxY: 3 }, canvas, 2, 32);
    const tilePx = 32 * vp.zoom * 2;
    // Box centre is cell (3, 3); canvas centre is (800, 600) device px.
    expect(3 * tilePx - vp.offset.x).toBeCloseTo(800, 6);
    expect(3 * tilePx - vp.offset.y).toBeCloseTo(600, 6);
  });

  it("an empty map is zoom 1 centred on the origin cell", () => {
    const vp = fitViewport(null, canvas, 1, 32);
    expect(vp.zoom).toBe(1);
    expect(vp.offset).toEqual({ x: 0.5 * 32 - 400, y: 0.5 * 32 - 300 });
  });
});

describe("actualSizeViewport and stepZoom", () => {
  const canvas = { width: 800, height: 600 };
  const centreWorld = (vp: { zoom: number; offset: { x: number; y: number } }, dpr: number) => ({
    x: (vp.offset.x + (canvas.width * dpr) / 2) / vp.zoom,
    y: (vp.offset.y + (canvas.height * dpr) / 2) / vp.zoom,
  });

  it("actual size lands on zoom 1 and keeps the canvas centre still", () => {
    const vp = { zoom: 0.4, offset: { x: 33, y: -12 } };
    const next = actualSizeViewport(vp, canvas, 2);
    expect(next.zoom).toBeCloseTo(1, 10);
    expect(centreWorld(next, 2).x).toBeCloseTo(centreWorld(vp, 2).x, 6);
    expect(centreWorld(next, 2).y).toBeCloseTo(centreWorld(vp, 2).y, 6);
  });

  it("steps by 1.25 in and out around the centre", () => {
    const vp = { zoom: 1, offset: { x: 33, y: -12 } };
    const zin = stepZoom(vp, canvas, 1, "in");
    const zout = stepZoom(vp, canvas, 1, "out");
    expect(zin.zoom).toBeCloseTo(1.25, 10);
    expect(zout.zoom).toBeCloseTo(0.8, 10);
    expect(centreWorld(zin, 1).x).toBeCloseTo(centreWorld(vp, 1).x, 6);
  });

  it("stops stepping at the limits", () => {
    expect(stepZoom({ zoom: MAX_ZOOM, offset: { x: 0, y: 0 } }, canvas, 1, "in").zoom).toBe(MAX_ZOOM);
    expect(stepZoom({ zoom: MIN_ZOOM, offset: { x: 0, y: 0 } }, canvas, 1, "out").zoom).toBe(MIN_ZOOM);
  });
});

describe("pinchViewport — two fingers pan and zoom", () => {
  const start = { zoom: 1, offset: { x: 100, y: 50 } };
  const from = pinchOf({ x: 100, y: 100 }, { x: 200, y: 100 });

  it("pans by how far the midpoint moved, without zooming", () => {
    const now = pinchOf({ x: 130, y: 120 }, { x: 230, y: 120 });
    const next = pinchViewport(start, from, now, 2);
    expect(next.zoom).toBe(1);
    expect(next.offset).toEqual({ x: 100 - 30 * 2, y: 50 - 20 * 2 });
  });

  it("zooms by the spread, keeping the world point under the midpoint still", () => {
    const now = pinchOf({ x: 50, y: 100 }, { x: 250, y: 100 });
    const next = pinchViewport(start, from, now, 1);
    expect(next.zoom).toBe(2);
    // The world point under the midpoint (150, 100) before and after.
    const before = { x: (start.offset.x + 150) / start.zoom, y: (start.offset.y + 100) / start.zoom };
    const after = { x: (next.offset.x + 150) / next.zoom, y: (next.offset.y + 100) / next.zoom };
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("clamps to the zoom range", () => {
    const wide = pinchOf({ x: 0, y: 100 }, { x: 10000, y: 100 });
    expect(pinchViewport(start, from, wide, 1).zoom).toBe(MAX_ZOOM);
  });
});
