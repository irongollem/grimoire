import { describe, expect, it } from "vitest";
import { gridFromRatio, imageGrid } from "./imageGrid";

describe("imageGrid", () => {
  // A box calibration of 29.9999 across: row-major indexing `j * cols + i` is only whole with a whole column count.
  it("rounds the columns up so a fractional calibration still indexes whole cells", () => {
    expect(imageGrid(29.9999, { w: 1000, h: 500 })).toEqual({ cols: 30, rows: 15 });
  });

  it("is null until the picture's size is known, and for a calibration that is not a positive number", () => {
    expect(imageGrid(20, null)).toBeNull();
    expect(imageGrid(0, { w: 10, h: 10 })).toBeNull();
    expect(imageGrid(-5, { w: 10, h: 10 })).toBeNull();
    expect(imageGrid(Number.NaN, { w: 10, h: 10 })).toBeNull();
    expect(imageGrid(Number.POSITIVE_INFINITY, { w: 10, h: 10 })).toBeNull();
    expect(imageGrid(20, { w: 0, h: 10 })).toBeNull();
    expect(imageGrid(20, { w: 10, h: Number.NaN })).toBeNull();
  });
});

describe("gridFromRatio", () => {
  it("16 squares across a picture three quarters as tall is 12 rows, and a fractional row rounds up", () => {
    // Bug it fails on: rounding the rows down, which would leave the picture's last partial row off the map.
    expect(gridFromRatio(16, 0.75)).toEqual({ cols: 16, rows: 12 });
    expect(gridFromRatio(16, 0.76)).toEqual({ cols: 16, rows: 13 });
  });

  it("is null when the shape is not recorded or not a positive number", () => {
    expect(gridFromRatio(16, undefined)).toBeNull();
    expect(gridFromRatio(16, 0)).toBeNull();
    expect(gridFromRatio(16, Number.NaN)).toBeNull();
  });
});
