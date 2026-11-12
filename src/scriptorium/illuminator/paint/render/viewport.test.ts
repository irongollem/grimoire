import { describe, expect, it } from "vitest";
import {
  docToScreen,
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  pinchViewport,
  screenToDoc,
  zoomAbout,
  zoomToTarget,
  type Viewport,
} from "./viewport";

const vp: Viewport = { scale: 3.5, offsetX: -120, offsetY: 47 };

describe("viewport", () => {
  it("round-trips a point through screen and back at any zoom (fails if offset or scale is applied in the wrong order)", () => {
    for (const scale of [0.05, 0.4, 1, 7.3, 32]) {
      const v = { ...vp, scale };
      const s = docToScreen(v, 123.5, 456.25);
      const d = screenToDoc(v, s.x, s.y);
      expect(d.x).toBeCloseTo(123.5, 6);
      expect(d.y).toBeCloseTo(456.25, 6);
    }
  });

  it("keeps the point under the cursor fixed when zooming about it (fails if zoom is about the origin)", () => {
    const before = screenToDoc(vp, 300, 200);
    const next = zoomAbout(vp, 1.6, 300, 200);
    const after = screenToDoc(next, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.scale).toBeCloseTo(vp.scale * 1.6, 6);
  });

  it("stops at the minimum and maximum scale, and the fixed point still holds", () => {
    expect(zoomAbout(vp, 1000, 10, 10).scale).toBe(MAX_SCALE);
    expect(zoomAbout(vp, 0.00001, 10, 10).scale).toBe(MIN_SCALE);
    const capped = zoomAbout({ scale: MAX_SCALE, offsetX: 5, offsetY: 5 }, 2, 80, 90);
    expect(capped.offsetX).toBeCloseTo(5, 6);
  });

  it("fits a document that is wider than the view and centres the short side (fails if fit ignores an axis)", () => {
    const fit = fitViewport({ width: 2000, height: 1000 }, { width: 500, height: 500 }, 0);
    expect(fit.scale).toBeCloseTo(0.25, 6);
    expect(fit.offsetX).toBeCloseTo(0, 6);
    expect(fit.offsetY).toBeCloseTo(125, 6);
  });

  it("falls back to 1:1 for a view with no room rather than a zero or negative scale", () => {
    expect(fitViewport({ width: 100, height: 100 }, { width: 0, height: 0 }).scale).toBe(1);
  });

  it("zoom keys: in/out step about the view centre, actual is 1:1 centred", () => {
    const view = { width: 400, height: 300 };
    const doc = { width: 800, height: 600 };
    const start = fitViewport(doc, view, 0);
    const centre = screenToDoc(start, 200, 150);
    const zoomed = zoomToTarget(start, "in", doc, view);
    expect(zoomed.scale).toBeGreaterThan(start.scale);
    expect(screenToDoc(zoomed, 200, 150).x).toBeCloseTo(centre.x, 6);
    const actual = zoomToTarget(start, "actual", doc, view);
    expect(actual).toEqual({ scale: 1, offsetX: -200, offsetY: -150 });
  });

  it("pinch scales with finger distance and keeps the midpoint's document point under the fingers", () => {
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 100 };
    const docMid = screenToDoc(vp, 150, 100);
    const next = pinchViewport(vp, a0, b0, { x: 120, y: 130 }, { x: 320, y: 130 });
    expect(next.scale).toBeCloseTo(vp.scale * 2, 6);
    const under = docToScreen(next, docMid.x, docMid.y);
    expect(under.x).toBeCloseTo(220, 6);
    expect(under.y).toBeCloseTo(130, 6);
  });
});
