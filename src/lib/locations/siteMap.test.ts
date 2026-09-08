import { describe, it, expect } from "vitest";
import { isCellOnImageGrid, toggleCell } from "./siteMap";
import type { GridCalibration } from "@/types/location.types";

describe("toggleCell", () => {
  it("adds a cell that isn't in the set", () => {
    expect(toggleCell(["0,0"], "1,1")).toEqual(["0,0", "1,1"]);
  });

  it("removes a cell that is already in the set", () => {
    expect(toggleCell(["0,0", "1,1"], "0,0")).toEqual(["1,1"]);
  });

  it("never duplicates — toggling twice is a no-op", () => {
    const once = toggleCell([], "0,0");
    const twice = toggleCell(once, "0,0");
    expect(twice).toEqual([]);
  });
});

describe("isCellOnImageGrid", () => {
  const calibration: GridCalibration = {
    cells_per_image_width: 10,
    origin_x_pct: 0,
    origin_y_pct: 0,
  };

  it("accepts cells within the whole-cell extent", () => {
    // 1000x1000 image, 10 cells across -> 10x10 grid, origin at image (0,0).
    expect(isCellOnImageGrid("0,0", calibration, 1000, 1000)).toBe(true);
    expect(isCellOnImageGrid("9,9", calibration, 1000, 1000)).toBe(true);
  });

  it("rejects a cell past the grid's far edge", () => {
    expect(isCellOnImageGrid("10,0", calibration, 1000, 1000)).toBe(false);
    expect(isCellOnImageGrid("0,10", calibration, 1000, 1000)).toBe(false);
  });

  it("rejects a cell before the grid's origin when origin_x/y_pct offsets it into the image", () => {
    const offset: GridCalibration = { ...calibration, origin_x_pct: 0.1, origin_y_pct: 0.1 };
    // Image cell (-1, -1) is physically on the picture (before the origin)
    // but not one of the grid's own whole cells.
    expect(isCellOnImageGrid("-1,-1", offset, 1000, 1000)).toBe(false);
    expect(isCellOnImageGrid("0,0", offset, 1000, 1000)).toBe(true);
  });

  it("honours origin_cell_x/y — the addressable range is relative to the offset, not (0,0)", () => {
    const shifted: GridCalibration = { ...calibration, origin_cell_x: 5, origin_cell_y: -3 };
    expect(isCellOnImageGrid("5,-3", shifted, 1000, 1000)).toBe(true);
    expect(isCellOnImageGrid("14,6", shifted, 1000, 1000)).toBe(true);
    expect(isCellOnImageGrid("4,-3", shifted, 1000, 1000)).toBe(false);
    expect(isCellOnImageGrid("15,-3", shifted, 1000, 1000)).toBe(false);
  });

  it("rejects everything for a degenerate calibration or image", () => {
    const degenerate: GridCalibration = { ...calibration, cells_per_image_width: 0 };
    expect(isCellOnImageGrid("0,0", degenerate, 1000, 1000)).toBe(false);
    expect(isCellOnImageGrid("0,0", calibration, 0, 0)).toBe(false);
  });
});
