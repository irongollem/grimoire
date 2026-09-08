import { describe, expect, it } from "vitest";
import { cellAtImageFraction, cellRectInImageFractions, gridExtent } from "./gridCalibration";
import { cellKey, parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";

const EPSILON = 1e-9;

/** Asserts `(fx, fy)` falls within the rect's half-open interval on both axes. */
function expectContains(rect: { x: number; y: number; w: number; h: number }, fx: number, fy: number) {
  expect(fx).toBeGreaterThanOrEqual(rect.x - EPSILON);
  expect(fx).toBeLessThan(rect.x + rect.w + EPSILON);
  expect(fy).toBeGreaterThanOrEqual(rect.y - EPSILON);
  expect(fy).toBeLessThan(rect.y + rect.h + EPSILON);
}

function calibration(overrides: Partial<GridCalibration> = {}): GridCalibration {
  return {
    cells_per_image_width: 10,
    origin_x_pct: 0,
    origin_y_pct: 0,
    ...overrides,
  };
}

describe("gridExtent", () => {
  it("returns whole cell counts for a square image with a whole cells_per_image_width", () => {
    expect(gridExtent(calibration({ cells_per_image_width: 10 }), 1000, 1000)).toEqual({ cols: 10, rows: 10 });
  });

  it("derives rows from the image's aspect ratio, not from cols", () => {
    // 1000x800 image, 10 cells across => 100px/cell => 8 cells down exactly.
    expect(gridExtent(calibration({ cells_per_image_width: 10 }), 1000, 800)).toEqual({ cols: 10, rows: 8 });
    // A taller-than-wide image grows rows past cols.
    expect(gridExtent(calibration({ cells_per_image_width: 4 }), 400, 1000)).toEqual({ cols: 4, rows: 10 });
  });

  it("rounds a fractional cells_per_image_width up on both axes", () => {
    // A measured calibration is rarely a whole number of cells.
    expect(gridExtent(calibration({ cells_per_image_width: 7.3 }), 1000, 1000)).toEqual({ cols: 8, rows: 8 });
    expect(gridExtent(calibration({ cells_per_image_width: 7.01 }), 1000, 500)).toEqual({ cols: 8, rows: 4 });
  });

  it("returns zero extent for a non-positive image width or height, without throwing", () => {
    expect(gridExtent(calibration(), 0, 1000)).toEqual({ cols: 0, rows: 0 });
    expect(gridExtent(calibration(), -5, 1000)).toEqual({ cols: 0, rows: 0 });
    expect(gridExtent(calibration(), 1000, 0)).toEqual({ cols: 0, rows: 0 });
    expect(gridExtent(calibration(), 1000, -5)).toEqual({ cols: 0, rows: 0 });
  });

  it("returns zero extent for a non-positive cells_per_image_width", () => {
    expect(gridExtent(calibration({ cells_per_image_width: 0 }), 1000, 1000)).toEqual({ cols: 0, rows: 0 });
    expect(gridExtent(calibration({ cells_per_image_width: -3 }), 1000, 1000)).toEqual({ cols: 0, rows: 0 });
  });
});

describe("cellAtImageFraction / cellRectInImageFractions round trip", () => {
  it("locates a point and reconstructs its exact rect, with no origin offset", () => {
    const cal = calibration({ cells_per_image_width: 10 });
    const key = cellAtImageFraction(0.35, 0.45, cal, 1000, 800);
    expect(key).toBe(cellKey(3, 3));
    const rect = cellRectInImageFractions(key, cal, 1000, 800);
    // toBeCloseTo, not toEqual: 3 * 0.1 is 0.30000000000000004 in IEEE754.
    expect(rect.x).toBeCloseTo(0.3);
    expect(rect.y).toBeCloseTo(0.375);
    expect(rect.w).toBeCloseTo(0.1);
    expect(rect.h).toBeCloseTo(0.125);
    expectContains(rect, 0.35, 0.45);
  });

  it("accounts for a non-zero origin offset, including exactly on the origin", () => {
    const cal = calibration({ cells_per_image_width: 10, origin_x_pct: 0.05, origin_y_pct: 0.03 });
    const key = cellAtImageFraction(0.05, 0.03, cal, 1000, 800);
    expect(key).toBe(cellKey(0, 0));
    const rect = cellRectInImageFractions(key, cal, 1000, 800);
    expect(rect.x).toBeCloseTo(0.05);
    expect(rect.y).toBeCloseTo(0.03);
    expectContains(rect, 0.05, 0.03);
  });

  it("floors to the lower cell at an exact cell boundary, and that cell's rect still contains it", () => {
    // cell size is 0.1 in x-fraction (100px of 1000px width); fx=0.1 sits
    // exactly on the boundary between cell 0 and cell 1.
    const cal = calibration({ cells_per_image_width: 10 });
    const key = cellAtImageFraction(0.1, 0.1, cal, 1000, 1000);
    expect(key).toBe(cellKey(1, 1));
    const rect = cellRectInImageFractions(key, cal, 1000, 1000);
    expect(rect).toEqual({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 });
    expectContains(rect, 0.1, 0.1);
  });

  it("yields negative cell indices for points before the origin offset", () => {
    const cal = calibration({ cells_per_image_width: 10, origin_x_pct: 0.05, origin_y_pct: 0.03 });
    // One pixel left/above the origin on a 1000x800 image.
    const key = cellAtImageFraction(0.049, 0.0286, cal, 1000, 800);
    expect(key).toBe(cellKey(-1, -1));
    const rect = cellRectInImageFractions(key, cal, 1000, 800);
    expectContains(rect, 0.049, 0.0286);
  });

  it("holds for a non-square image", () => {
    const cal = calibration({ cells_per_image_width: 8 });
    const key = cellAtImageFraction(0.9, 0.1, cal, 2000, 1000);
    const rect = cellRectInImageFractions(key, cal, 2000, 1000);
    expectContains(rect, 0.9, 0.1);
    // Sanity: cell height fraction is double cell width fraction on a 2:1 image.
    expect(rect.h).toBeCloseTo(rect.w * 2);
  });

  it("holds for a non-integer cells_per_image_width across a spread of sample points", () => {
    const cal = calibration({ cells_per_image_width: 7.3, origin_x_pct: 0.02, origin_y_pct: 0.11 });
    const width = 1234;
    const height = 987;
    for (const fx of [0.0, 0.05, 0.13, 0.5, 0.87, 0.999]) {
      for (const fy of [0.0, 0.2, 0.44, 0.76, 0.999]) {
        const key = cellAtImageFraction(fx, fy, cal, width, height);
        const rect = cellRectInImageFractions(key, cal, width, height);
        expectContains(rect, fx, fy);
      }
    }
  });
});

describe("origin cell (map-cell coordinate of image cell (0,0))", () => {
  it("defaults to (0, 0) when the field is absent, same as when explicitly (0, 0)", () => {
    const withoutField = calibration({ cells_per_image_width: 8 });
    const withField = calibration({ cells_per_image_width: 8, origin_cell_x: 0, origin_cell_y: 0 });
    const a = cellAtImageFraction(0.4, 0.6, withoutField, 800, 800);
    const b = cellAtImageFraction(0.4, 0.6, withField, 800, 800);
    expect(a).toBe(b);
  });

  it("shifts the returned CellKey into map-cell space, matching a padded bake", () => {
    // Simulates bake.ts: authored bounding box starts at (minX, minY) =
    // (-2, -4), padded by DEFAULT_BAKE_PADDING_CELLS (3) on every side, so
    // image cell (0,0) is map cell (minX - 3, minY - 3) = (-5, -7).
    const cal = calibration({ cells_per_image_width: 8, origin_cell_x: -5, origin_cell_y: -7 });
    const width = 800; // 8 cols * 100px
    const height = 800;

    // A point well inside image cell (0, 0).
    const key = cellAtImageFraction(0.01, 0.01, cal, width, height);
    expect(key).toBe(cellKey(-5, -7));

    // The inverse: map cell (-5, -7) is image cell (0, 0)'s box.
    const rect = cellRectInImageFractions(cellKey(-5, -7), cal, width, height);
    expect(rect).toEqual({ x: 0, y: 0, w: 0.125, h: 0.125 });
  });

  it("round-trips parseCellKey/cellKey through a non-zero origin cell", () => {
    const cal = calibration({ cells_per_image_width: 8, origin_cell_x: 3, origin_cell_y: -2 });
    const key = cellAtImageFraction(0.5, 0.5, cal, 800, 800);
    const [x, y] = parseCellKey(key);
    // Image cell at the image's centre is (4, 4); shifted by the origin cell.
    expect(x).toBe(4 + 3);
    expect(y).toBe(4 + -2);
  });
});

describe("degenerate inputs", () => {
  it("cellAtImageFraction falls back to the origin cell when the image/calibration is unusable", () => {
    const cal = calibration({ cells_per_image_width: 8 });
    expect(cellAtImageFraction(0.5, 0.5, cal, 0, 800)).toBe(cellKey(0, 0));
    expect(cellAtImageFraction(0.5, 0.5, cal, 800, 0)).toBe(cellKey(0, 0));
    expect(cellAtImageFraction(0.5, 0.5, calibration({ cells_per_image_width: 0 }), 800, 800)).toBe(cellKey(0, 0));
    expect(cellAtImageFraction(0.5, 0.5, calibration({ cells_per_image_width: -1 }), 800, 800)).toBe(cellKey(0, 0));
  });

  it("cellAtImageFraction falls back to a non-default origin cell when one is set", () => {
    const cal = calibration({ cells_per_image_width: 0, origin_cell_x: 5, origin_cell_y: 9 });
    expect(cellAtImageFraction(0.5, 0.5, cal, 800, 800)).toBe(cellKey(5, 9));
  });

  it("cellRectInImageFractions returns a zero-sized rect at the origin when unusable", () => {
    const cal = calibration({ cells_per_image_width: 8 });
    const zero = { x: 0, y: 0, w: 0, h: 0 };
    const anyKey = cellKey(2, 2) as CellKey;
    expect(cellRectInImageFractions(anyKey, cal, 0, 800)).toEqual(zero);
    expect(cellRectInImageFractions(anyKey, cal, 800, 0)).toEqual(zero);
    expect(cellRectInImageFractions(anyKey, calibration({ cells_per_image_width: 0 }), 800, 800)).toEqual(zero);
    expect(cellRectInImageFractions(anyKey, calibration({ cells_per_image_width: -2 }), 800, 800)).toEqual(zero);
  });
});
