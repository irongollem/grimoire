import { describe, expect, it } from "vitest";
import { dragCrop, fitRatio, FULL_CROP, shapeRatio, type CropRect } from "./cropBox";
import { MIN_CROP } from "./treatment";

// A 2:1 picture: widthPx / heightPx = 2, so a square in pixels is half as wide in fractions as it is tall.
const ASPECT = 2;
const box: CropRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
const pixelRatio = (r: CropRect) => (r.w * ASPECT) / r.h;

describe("shapeRatio", () => {
  it("is null for Free and for Page without a page", () => {
    expect(shapeRatio("free", 0.7)).toBeNull();
    expect(shapeRatio("page", null)).toBeNull();
  });
  it("gives the shape's width over height, and the page's own for Page", () => {
    expect(shapeRatio("3:2", null)).toBe(1.5);
    expect(shapeRatio("page", 0.7)).toBe(0.7);
  });
});

describe("fitRatio", () => {
  // Fails on: a 1:1 choice that is square in fractions, which on a wide picture is a tall rectangle.
  it("makes the largest box of the shape inside the box, centred", () => {
    const fitted = fitRatio(FULL_CROP, 1, ASPECT);
    expect(pixelRatio(fitted)).toBeCloseTo(1);
    expect(fitted).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
  });
});

describe("dragCrop", () => {
  it("moves the box but never out of the picture", () => {
    expect(dragCrop(box, "move", 0.1, -0.1, null, ASPECT)).toEqual({ x: 0.35, y: 0.15, w: 0.5, h: 0.5 });
    expect(dragCrop(box, "move", 5, 5, null, ASPECT)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(dragCrop(box, "move", -5, -5, null, ASPECT)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  it("resizes freely from an edge, the far edge staying put", () => {
    expect(dragCrop(box, "e", 0.1, 0.4, null, ASPECT)).toEqual({ x: 0.25, y: 0.25, w: 0.6, h: 0.5 });
    expect(dragCrop(box, "n", 0.4, -0.1, null, ASPECT)).toEqual({ x: 0.25, y: 0.15, w: 0.5, h: 0.6 });
  });

  // Fails on: dragging an edge past the opposite one flipping or collapsing the box.
  it("never gets thinner than the smallest crop, nor leaves the picture", () => {
    const thin = dragCrop(box, "w", 5, 0, null, ASPECT);
    expect(thin.w).toBeCloseTo(MIN_CROP);
    expect(thin.x + thin.w).toBeCloseTo(0.75);
    const wide = dragCrop(box, "e", 5, 0, null, ASPECT);
    expect(wide.x + wide.w).toBe(1);
  });

  // Fails on: a corner drag with a shape set breaking the shape, or moving the opposite corner.
  it("keeps the shape from a corner, the opposite corner staying put", () => {
    const next = dragCrop(box, "se", 0.1, 0.3, 1, ASPECT);
    expect(pixelRatio(next)).toBeCloseTo(1);
    expect(next.x).toBe(0.25);
    expect(next.y).toBe(0.25);
    const fromNw = dragCrop(box, "nw", -0.05, -0.05, 1, ASPECT);
    expect(pixelRatio(fromNw)).toBeCloseTo(1);
    expect(fromNw.x + fromNw.w).toBeCloseTo(0.75);
    expect(fromNw.y + fromNw.h).toBeCloseTo(0.75);
  });

  // Fails on: a shaped corner drag growing past the picture's edge.
  it("keeps a shaped box inside the picture", () => {
    const next = dragCrop(box, "se", 5, 5, 3 / 2, ASPECT);
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(pixelRatio(next)).toBeCloseTo(1.5);
  });

  it("does not collapse a shaped box dragged onto its own corner", () => {
    const next = dragCrop({ x: 0, y: 0, w: 0.5, h: 0.5 }, "se", -0.5, -0.5, 1, ASPECT);
    expect(next.w).toBeGreaterThanOrEqual(MIN_CROP - 1e-9);
    expect(Number.isFinite(next.h)).toBe(true);
  });
});
