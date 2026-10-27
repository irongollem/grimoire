import { describe, it, expect } from "vitest";
import {
  cellsInCircle,
  cellsInOctagon,
  cellsInHex,
  cellsForTemplate,
} from "./template";

describe("cellsInCircle", () => {
  it("returns a single cell when r=0", () => {
    expect(cellsInCircle(5, 5, 0)).toEqual(["5,5"]);
  });

  it("returns symmetric cells around the centre", () => {
    const cells = new Set(cellsInCircle(0, 0, 1));
    // r=1 circle = +shape (centre + 4 cardinals)
    expect(cells).toEqual(new Set(["0,0", "1,0", "-1,0", "0,1", "0,-1"]));
  });

  it("respects radius — no cell outside r", () => {
    const cells = cellsInCircle(0, 0, 3);
    for (const key of cells) {
      const [xs, ys] = key.split(",");
      const dx = Number(xs), dy = Number(ys);
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(9);
    }
  });
});

describe("cellsInOctagon", () => {
  it("returns a single cell when r=0", () => {
    expect(cellsInOctagon(0, 0, 0)).toEqual(["0,0"]);
  });

  it("clips diagonal corners of the bounding square", () => {
    // For r=4, the four extreme corners (±4, ±4) should be excluded.
    const cells = new Set(cellsInOctagon(0, 0, 4));
    expect(cells.has("4,4")).toBe(false);
    expect(cells.has("-4,-4")).toBe(false);
    expect(cells.has("4,-4")).toBe(false);
    expect(cells.has("-4,4")).toBe(false);
    // But the cardinal extremes remain.
    expect(cells.has("4,0")).toBe(true);
    expect(cells.has("0,4")).toBe(true);
  });

  it("cuts each corner by about 30% of the radius", () => {
    // r=10 cuts 3 cells: the flat top runs from x=-7 to x=7.
    const cells = new Set(cellsInOctagon(0, 0, 10));
    expect(cells.has("7,-10")).toBe(true);
    expect(cells.has("8,-10")).toBe(false);
  });
});

describe("cellsInHex", () => {
  it("narrows row width by 1 cell every 2 rows from the equator", () => {
    // For r=4 equator row, width is 9 (from -4 to +4).
    // For row dy=±4, width should be 4 - ceil(4/2) = 2 (from -2 to +2 → 5 cells).
    const cells = new Set(cellsInHex(0, 0, 4));
    expect(cells.has("4,0")).toBe(true);
    expect(cells.has("-4,0")).toBe(true);
    expect(cells.has("4,4")).toBe(false); // outside narrowed row
    expect(cells.has("2,4")).toBe(true);
    expect(cells.has("3,4")).toBe(false);
    // An odd row still narrows: dy=1 is half a step off the equator, one cell in.
    expect(cells.has("3,1")).toBe(true);
    expect(cells.has("4,1")).toBe(false);
  });
});

describe("cellsForTemplate", () => {
  it("dispatches each shape to its own cell set", () => {
    // Radius 2: the circle keeps cells within 2 (13), the octagon trims only the four far corners of the 5x5 (21),
    // the hex narrows to 3 cells on every row off the equator (3+3+5+3+3 = 17).
    expect(cellsForTemplate(0, 0, 2, "circle")).toHaveLength(13);
    expect(cellsForTemplate(0, 0, 2, "octagon")).toHaveLength(21);
    expect(cellsForTemplate(0, 0, 2, "hex")).toHaveLength(17);
  });

  it("a zero or negative radius is just the centre cell, whatever the shape", () => {
    for (const shape of ["circle", "octagon", "hex"] as const) {
      expect(cellsForTemplate(3, 4, 0, shape)).toEqual(["3,4"]);
      expect(cellsForTemplate(3, 4, -2, shape)).toEqual(["3,4"]);
    }
  });
});
