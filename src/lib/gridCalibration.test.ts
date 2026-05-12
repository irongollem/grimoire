import { describe, it, expect } from "vitest";
import { calibrateGrid } from "./gridCalibration";

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

  it("defaults the origin to the top-left of the image (0%, 0%)", () => {
    const result = calibrateGrid({
      pointAPct: { x: 0.1, y: 0.1 },
      pointBPct: { x: 0.2, y: 0.1 },
      cellsBetween: 1,
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
