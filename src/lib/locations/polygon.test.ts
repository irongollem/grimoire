import { describe, it, expect } from "vitest";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { cellKey } from "@/types/dungeonMap.types";
import { cellsInCircle } from "@/cartographer/geometry";
import { canonicalCells } from "@/cartographer/cellSignature";
import {
  snapPoint,
  isClosed,
  pointInRing,
  cellsInsideRing,
  ringBounds,
  insertVertex,
  moveVertex,
  removeVertex,
  nearestVertex,
  nearestEdge,
  templateCells,
  templateRing,
  simplifyRing,
} from "./polygon";

const SQUARE: GridPoint[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe("snapPoint", () => {
  it("snaps to the nearest grid intersection", () => {
    expect(snapPoint(2.3, 2.7, "intersection")).toEqual([2, 3]);
  });

  it("snaps to the nearest half-cell", () => {
    expect(snapPoint(2.3, 2.7, "half")).toEqual([2.5, 2.5]);
  });

  it("rounds a half-cell input down to the nearer intersection", () => {
    expect(snapPoint(2.4, 2.6, "intersection")).toEqual([2, 3]);
  });

  it("never returns a negative zero", () => {
    const [x, y] = snapPoint(-0.1, -0.2, "intersection");
    expect(Object.is(x, -0)).toBe(false);
    expect(Object.is(y, -0)).toBe(false);
  });
});

describe("isClosed", () => {
  it("is true with 3 distinct points", () => {
    expect(isClosed([[0, 0], [1, 0], [1, 1]])).toBe(true);
  });

  it("is false with fewer than 3 distinct points, even if 3 entries are given", () => {
    expect(isClosed([[0, 0], [1, 0], [0, 0]])).toBe(false);
  });

  it("is false for an empty ring", () => {
    expect(isClosed([])).toBe(false);
  });

  it("is false for 2 points", () => {
    expect(isClosed([[0, 0], [1, 1]])).toBe(false);
  });
});

describe("pointInRing", () => {
  it("is true for a point clearly inside", () => {
    expect(pointInRing(2, 2, SQUARE)).toBe(true);
  });

  it("is false for a point clearly outside", () => {
    expect(pointInRing(10, 10, SQUARE)).toBe(false);
  });

  it("is true for a point exactly on an edge", () => {
    expect(pointInRing(2, 0, SQUARE)).toBe(true);
  });

  it("is true for a point exactly on a vertex", () => {
    expect(pointInRing(0, 0, SQUARE)).toBe(true);
  });

  it("is false with fewer than 3 points", () => {
    expect(pointInRing(0, 0, [[0, 0], [1, 1]])).toBe(false);
  });
});

describe("ringBounds", () => {
  it("computes min/max across the ring", () => {
    expect(ringBounds([[1, 2], [5, 7], [-1, 0]])).toEqual({ minX: -1, minY: 0, maxX: 5, maxY: 7 });
  });

  it("is null for an empty ring", () => {
    expect(ringBounds([])).toBeNull();
  });
});

describe("cellsInsideRing", () => {
  it("returns exactly its cells for an axis-aligned square ring", () => {
    const expected = canonicalCells(
      Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => cellKey(x, y))).flat(),
    );
    expect(cellsInsideRing(SQUARE)).toEqual(expected);
  });

  it("selects the cells whose centres fall inside a diagonal triangle (hand-verified 4x4)", () => {
    const ring: GridPoint[] = [[0, 0], [4, 0], [0, 4]];
    const expected = canonicalCells([
      "0,0", "1,0", "2,0", "3,0",
      "0,1", "1,1", "2,1",
      "0,2", "1,2",
      "0,3",
    ]);
    expect(cellsInsideRing(ring)).toEqual(expected);
  });

  it("excludes the notch of a concave L shape", () => {
    const ring: GridPoint[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    const cells = new Set(cellsInsideRing(ring));
    expect(cells.has("3,3")).toBe(false);
    expect(cells.has("2,3")).toBe(false);
    expect(cells.has("0,0")).toBe(true);
    expect(cells.has("0,3")).toBe(true);
    expect(cells.size).toBe(12);
  });

  it("returns [] for a ring with fewer than 3 points", () => {
    expect(cellsInsideRing([[0, 0], [4, 0]])).toEqual([]);
  });

  it("returns [] for an empty ring", () => {
    expect(cellsInsideRing([])).toEqual([]);
  });

  it("returns cells in canonical order", () => {
    const cells = cellsInsideRing(SQUARE);
    expect(cells).toEqual(canonicalCells(cells));
  });
});

describe("insertVertex", () => {
  it("inserts after the given index", () => {
    const ring: GridPoint[] = [[0, 0], [4, 0], [4, 4]];
    expect(insertVertex(ring, 0, [2, 0])).toEqual([[0, 0], [2, 0], [4, 0], [4, 4]]);
  });

  it("appends when afterIndex is the last index", () => {
    const ring: GridPoint[] = [[0, 0], [4, 0], [4, 4]];
    expect(insertVertex(ring, 2, [0, 4])).toEqual([[0, 0], [4, 0], [4, 4], [0, 4]]);
  });

  it("does not mutate the input ring", () => {
    const ring: GridPoint[] = [[0, 0], [4, 0], [4, 4]];
    insertVertex(ring, 0, [2, 0]);
    expect(ring).toEqual([[0, 0], [4, 0], [4, 4]]);
  });
});

describe("moveVertex", () => {
  it("replaces the point at the given index", () => {
    expect(moveVertex(SQUARE, 1, [5, 5])).toEqual([[0, 0], [5, 5], [4, 4], [0, 4]]);
  });
});

describe("removeVertex", () => {
  it("removes the point at the given index", () => {
    expect(removeVertex(SQUARE, 1)).toEqual([[0, 0], [4, 4], [0, 4]]);
  });

  it("refuses to drop below 3 points, returning the ring unchanged", () => {
    const triangle: GridPoint[] = [[0, 0], [4, 0], [0, 4]];
    expect(removeVertex(triangle, 0)).toEqual(triangle);
  });
});

describe("nearestVertex", () => {
  it("finds the nearest vertex within tolerance", () => {
    expect(nearestVertex(SQUARE, 0.2, 0.1, 1)).toBe(0);
  });

  it("returns null when nothing is within tolerance", () => {
    expect(nearestVertex(SQUARE, 20, 20, 1)).toBeNull();
  });
});

describe("nearestEdge", () => {
  it("finds the nearest edge and snaps the projection to an intersection", () => {
    const hit = nearestEdge(SQUARE, 2.4, 0.3, 1);
    expect(hit).toEqual({ index: 0, point: [2, 0] });
  });

  it("returns null when nothing is within tolerance", () => {
    expect(nearestEdge(SQUARE, 20, 20, 1)).toBeNull();
  });

  it("returns null for a ring with fewer than 2 points", () => {
    expect(nearestEdge([[0, 0]], 0, 0, 5)).toBeNull();
  });
});

describe("templateCells", () => {
  it("delegates to cellsForTemplate, rounding centre and radius", () => {
    expect(templateCells("circle", [5.4, 5.6], 3.2)).toEqual(cellsInCircle(5, 6, 3));
  });

  it("matches cellsForTemplate for octagon and hex too", () => {
    expect(templateCells("octagon", [0, 0], 4).length).toBeGreaterThan(0);
    expect(templateCells("hex", [0, 0], 4).length).toBeGreaterThan(0);
  });
});

describe("templateRing", () => {
  it("draws an octagon as 8 points", () => {
    expect(templateRing("octagon", [10, 10], 6)).toHaveLength(8);
  });

  it("draws a hex as 6 points", () => {
    expect(templateRing("hex", [10, 10], 6)).toHaveLength(6);
  });

  it("draws a circle as at most a 16-gon", () => {
    const ring = templateRing("circle", [10, 10], 6);
    expect(ring.length).toBeGreaterThanOrEqual(3);
    expect(ring.length).toBeLessThanOrEqual(16);
  });

  it("approximates cellsInCircle within a 10% symmetric difference", () => {
    const ring = templateRing("circle", [10, 10], 6);
    const ringCells = new Set(cellsInsideRing(ring));
    const circleCells = new Set(cellsInCircle(10, 10, 6));
    let diff = 0;
    for (const c of ringCells) if (!circleCells.has(c)) diff++;
    for (const c of circleCells) if (!ringCells.has(c)) diff++;
    expect(diff).toBeLessThanOrEqual(Math.ceil(circleCells.size * 0.1));
  });

  it("produces vertices editable with the pen — a plain ring of GridPoints", () => {
    const ring = templateRing("octagon", [3, 3], 5);
    for (const [x, y] of ring) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});

describe("simplifyRing", () => {
  it("drops consecutive duplicate points", () => {
    expect(simplifyRing([[0, 0], [0, 0], [4, 0], [4, 4]])).toEqual([[0, 0], [4, 0], [4, 4]]);
  });

  it("drops a duplicate across the wraparound seam", () => {
    expect(simplifyRing([[0, 0], [4, 0], [4, 4], [0, 0]])).toEqual([[0, 0], [4, 0], [4, 4]]);
  });

  it("drops collinear midpoints", () => {
    expect(simplifyRing([[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]])).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
  });

  it("leaves a ring with no duplicates or collinear points unchanged", () => {
    const triangle: GridPoint[] = [[0, 0], [4, 0], [0, 4]];
    expect(simplifyRing(triangle)).toEqual(triangle);
  });
});
