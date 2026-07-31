import { describe, it, expect } from "vitest";
import { calibrateGrid } from "@/lib/gridCalibration";

describe("calibrateGrid", () => {
  it("computes cells_per_image_width from a horizontal calibration line", () => {
    // 600px wide image; line spans (0,0)→(100,0) = 100 px = 2 cells → 50 px/cell
    // → image fits 12 cells across.
    const result = calibrateGrid({
      pointAPct: { x: 0, y: 0 },
      pointBPct: { x: 100 / 600, y: 0 },
      cellsBetween: 2,
      imageNaturalWidth: 600,
      imageNaturalHeight: 400,
    });
    expect(result.cells_per_image_width).toBeCloseTo(12);
  });

  it("works on a vertical line by accounting for image height in pixel space", () => {
    // 400px tall image; line spans (0,0)→(0,100) = 100 px tall = 4 cells → 25 px/cell
    // → 800px wide image fits 32 cells across.
    const result = calibrateGrid({
      pointAPct: { x: 0, y: 0 },
      pointBPct: { x: 0, y: 100 / 400 },
      cellsBetween: 4,
      imageNaturalWidth: 800,
      imageNaturalHeight: 400,
    });
    expect(result.cells_per_image_width).toBeCloseTo(32);
  });

  it("handles a diagonal line via euclidean distance", () => {
    // 3-4-5 right triangle in pixels: A=(0,0), B=(3,4), 1 cell → 5 px/cell.
    // 10 px wide image → 2 cells across.
    const result = calibrateGrid({
      pointAPct: { x: 0, y: 0 },
      pointBPct: { x: 3 / 10, y: 4 / 8 },
      cellsBetween: 1,
      imageNaturalWidth: 10,
      imageNaturalHeight: 8,
    });
    expect(result.cells_per_image_width).toBeCloseTo(2);
  });

  it("treats normalised x/y on different axes as separate scales (non-square image)", () => {
    // A non-square image: 1000×500. A horizontal calibration spanning 50% of width
    // = 500 px; if that's 10 cells, then 50 px/cell → 20 cells fit across.
    const result = calibrateGrid({
      pointAPct: { x: 0, y: 0 },
      pointBPct: { x: 0.5, y: 0 },
      cellsBetween: 10,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 500,
    });
    expect(result.cells_per_image_width).toBeCloseTo(20);
  });

  it("anchors the origin to handle A so its pixel coord sits on a grid line", () => {
    // A at (37,30), B at (137,30) → 100px = 2 cells → 50 px/cell.
    // origin_x_px = 37 mod 50 = 37; origin_y_px = 30 mod 50 = 30.
    const result = calibrateGrid({
      pointAPct: { x: 37 / 1000, y: 30 / 1000 },
      pointBPct: { x: 137 / 1000, y: 30 / 1000 },
      cellsBetween: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 1000,
    });
    expect(result.cells_per_image_width).toBeCloseTo(20);
    expect(result.origin_x_pct).toBeCloseTo(0.037);
    expect(result.origin_y_pct).toBeCloseTo(0.030);
  });

  it("wraps the origin into [0, cellSize) for handles past the first cell", () => {
    // A at (237,30), B at (337,30) → still 50 px/cell. 237 mod 50 = 37.
    const result = calibrateGrid({
      pointAPct: { x: 237 / 1000, y: 30 / 1000 },
      pointBPct: { x: 337 / 1000, y: 30 / 1000 },
      cellsBetween: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 1000,
    });
    expect(result.origin_x_pct).toBeCloseTo(0.037);
  });

  it("returns origin (0%, 0%) when handle A already sits on the implicit grid", () => {
    // A at (0,0), B at (100,0) → 50 px/cell → 0 mod 50 = 0.
    const result = calibrateGrid({
      pointAPct: { x: 0, y: 0 },
      pointBPct: { x: 100 / 1000, y: 0 },
      cellsBetween: 2,
      imageNaturalWidth: 1000,
      imageNaturalHeight: 1000,
    });
    expect(result.origin_x_pct).toBe(0);
    expect(result.origin_y_pct).toBe(0);
  });

  it("throws if cellsBetween is zero", () => {
    expect(() =>
      calibrateGrid({
        pointAPct: { x: 0, y: 0 },
        pointBPct: { x: 0.5, y: 0 },
        cellsBetween: 0,
        imageNaturalWidth: 600,
        imageNaturalHeight: 400,
      }),
    ).toThrow();
  });

  it("throws if cellsBetween is negative", () => {
    expect(() =>
      calibrateGrid({
        pointAPct: { x: 0, y: 0 },
        pointBPct: { x: 0.5, y: 0 },
        cellsBetween: -3,
        imageNaturalWidth: 600,
        imageNaturalHeight: 400,
      }),
    ).toThrow();
  });

  it("throws if the two handles coincide (zero distance)", () => {
    expect(() =>
      calibrateGrid({
        pointAPct: { x: 0.4, y: 0.4 },
        pointBPct: { x: 0.4, y: 0.4 },
        cellsBetween: 2,
        imageNaturalWidth: 600,
        imageNaturalHeight: 400,
      }),
    ).toThrow();
  });
});
