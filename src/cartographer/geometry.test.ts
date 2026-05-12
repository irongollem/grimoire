import { describe, it, expect } from "vitest";
import {
  cellsInCircle,
  cellsInOctagon,
  cellsInHex,
  cellsForTemplate,
  valueNoise2D,
  caveBrushCells,
} from "./geometry";

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
  });
});

describe("cellsForTemplate", () => {
  it("dispatches to the shape function", () => {
    expect(cellsForTemplate(0, 0, 0, "circle")).toEqual(["0,0"]);
    expect(cellsForTemplate(0, 0, 1, "octagon").length).toBeGreaterThan(0);
    expect(cellsForTemplate(0, 0, 1, "hex").length).toBeGreaterThan(0);
  });
});

describe("valueNoise2D", () => {
  it("returns values in [0, 1]", () => {
    for (let i = 0; i < 20; i++) {
      const v = valueNoise2D(i * 0.37, i * 0.61, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same input", () => {
    const a = valueNoise2D(1.5, 2.7, 99);
    const b = valueNoise2D(1.5, 2.7, 99);
    expect(a).toBe(b);
  });

  it("changes with seed", () => {
    const a = valueNoise2D(1.5, 2.7, 1);
    const b = valueNoise2D(1.5, 2.7, 2);
    expect(a).not.toBe(b);
  });
});

describe("caveBrushCells", () => {
  it("includes the centre cell reliably", () => {
    // Centre has maximum edgeFade, so the threshold is lowest (0.08) and
    // the noise reliably exceeds it.
    const cells = new Set(caveBrushCells(0, 0, 5, 1));
    expect(cells.has("0,0")).toBe(true);
  });

  it("never returns cells outside the radius", () => {
    const cells = caveBrushCells(0, 0, 4, 7);
    for (const key of cells) {
      const [xs, ys] = key.split(",");
      const dx = Number(xs), dy = Number(ys);
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(16);
    }
  });

  it("produces different shapes for different seeds", () => {
    const a = new Set(caveBrushCells(0, 0, 5, 1));
    const b = new Set(caveBrushCells(0, 0, 5, 999));
    // At least one cell differs between the two seeds.
    let differs = false;
    for (const k of a) if (!b.has(k)) { differs = true; break; }
    if (!differs) for (const k of b) if (!a.has(k)) { differs = true; break; }
    expect(differs).toBe(true);
  });
});
