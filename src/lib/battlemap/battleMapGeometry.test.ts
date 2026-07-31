import { describe, it, expect } from "vitest";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battlemap/battleMapGeometry";

describe("gridLinePositions", () => {
  it("returns evenly-spaced positions covering the viewport when origin is at 0", () => {
    expect(gridLinePositions(0, 100, 25)).toEqual([0, 25, 50, 75, 100]);
  });

  it("includes lines that lie exactly on the start/end edges", () => {
    expect(gridLinePositions(0, 60, 20)).toEqual([0, 20, 40, 60]);
  });

  it("handles a positive offset by skipping lines before the viewport", () => {
    // start = 5, spacing = 20 → cells at 5, 25, 45, 65, 85 → only 25,45,65,85 fit in [0,100]
    expect(gridLinePositions(5, 100, 20)).toEqual([5, 25, 45, 65, 85]);
  });

  it("handles a negative offset by walking forward into the viewport", () => {
    // start = -7, spacing = 10 → 3, 13, 23, ..., 93 within [0,100]
    expect(gridLinePositions(-7, 100, 10)).toEqual([3, 13, 23, 33, 43, 53, 63, 73, 83, 93]);
  });

  it("returns an empty array for non-positive spacing", () => {
    expect(gridLinePositions(0, 100, 0)).toEqual([]);
    expect(gridLinePositions(0, 100, -5)).toEqual([]);
  });

  it("returns an empty array for a non-positive viewport length", () => {
    expect(gridLinePositions(0, 0, 10)).toEqual([]);
    expect(gridLinePositions(0, -1, 10)).toEqual([]);
  });
});

describe("cellSizeInDisplay", () => {
  it("is the natural-pixel cell size times the zoom factor", () => {
    // 1000 px wide image, 20 cells across, 2x zoom → 50 * 2 = 100 px per cell.
    expect(cellSizeInDisplay({ imageNaturalWidth: 1000, cellsPerImageWidth: 20, scale: 2 })).toBe(100);
  });

  it("returns 0 for non-positive cells_per_image_width", () => {
    expect(cellSizeInDisplay({ imageNaturalWidth: 1000, cellsPerImageWidth: 0, scale: 1 })).toBe(0);
  });
});

describe("gridOriginInDisplay", () => {
  it("translates origin percentages to canvas-space coordinates", () => {
    // Image is 1000x500, scale 1, no pan. Origin at (10%, 20%) → canvas (100, 100).
    expect(
      gridOriginInDisplay({
        panX: 0,
        panY: 0,
        scale: 1,
        imageNaturalWidth: 1000,
        imageNaturalHeight: 500,
        originXPct: 0.1,
        originYPct: 0.2,
      }),
    ).toEqual({ x: 100, y: 100 });
  });

  it("incorporates pan offset", () => {
    expect(
      gridOriginInDisplay({
        panX: 50,
        panY: -30,
        scale: 1,
        imageNaturalWidth: 1000,
        imageNaturalHeight: 500,
        originXPct: 0,
        originYPct: 0,
      }),
    ).toEqual({ x: 50, y: -30 });
  });

  it("multiplies the origin offset by the zoom scale", () => {
    expect(
      gridOriginInDisplay({
        panX: 0,
        panY: 0,
        scale: 2,
        imageNaturalWidth: 100,
        imageNaturalHeight: 100,
        originXPct: 0.5,
        originYPct: 0.5,
      }),
    ).toEqual({ x: 100, y: 100 });
  });
});
