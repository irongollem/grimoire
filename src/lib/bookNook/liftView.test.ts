import { describe, expect, it } from "vitest";
import { clampPan, clampScale, fitScale, fitView, zoomAbout } from "./liftView";

const viewport = { width: 400, height: 300 };
const natural = { width: 2000, height: 1000 };

describe("liftView", () => {
  it("fits the picture by its tighter side and centres the spare axis", () => {
    // Bug: fitting by the wrong side crops the picture or leaves it off-centre.
    expect(fitScale(viewport, natural)).toBeCloseTo(0.2);
    const v = fitView(viewport, natural);
    expect(v.tx).toBe(0);
    expect(v.ty).toBeCloseTo(50);
  });

  it("clamps zoom between fit and 8x fit", () => {
    // Bug: zooming out past fit loses the picture; zooming in without a limit blows the canvas up.
    expect(clampScale(0.01, 0.2)).toBe(0.2);
    expect(clampScale(100, 0.2)).toBeCloseTo(1.6);
  });

  it("keeps the picture point under the cursor fixed while zooming", () => {
    // Bug: zooming about the corner makes the thing being marked slide away from the pointer.
    const start = { scale: 0.4, tx: -100, ty: -50 };
    const point = { x: 200, y: 150 };
    const before = { x: (point.x - start.tx) / start.scale, y: (point.y - start.ty) / start.scale };
    const next = zoomAbout(start, 2, point, viewport, natural);
    expect(next.scale).toBeCloseTo(0.8);
    expect((point.x - next.tx) / next.scale).toBeCloseTo(before.x);
    expect((point.y - next.ty) / next.scale).toBeCloseTo(before.y);
  });

  it("never shows a gap at the edge of content larger than the viewport", () => {
    // Bug: panning past the edge leaves empty space and the brush paints outside the picture.
    const big = { width: 1000, height: 800 };
    expect(clampPan({ scale: 1, tx: 50, ty: 50 }, viewport, big)).toMatchObject({ tx: 0, ty: 0 });
    expect(clampPan({ scale: 1, tx: -9999, ty: -9999 }, viewport, big)).toMatchObject({ tx: -600, ty: -500 });
  });

  it("centres content smaller than the viewport", () => {
    // Bug: a small picture hugs the top-left after a pan.
    expect(clampPan({ scale: 1, tx: 70, ty: -40 }, viewport, { width: 200, height: 100 })).toMatchObject({ tx: 100, ty: 100 });
  });
});
