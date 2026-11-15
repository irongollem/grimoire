import { describe, it, expect } from "vitest";
import { cellsRects, centroid, outlinePath, planViewBox, textureCells, waySegment } from "./planSvg";
import { gridEdgeSegment } from "./doors";
import type { CellKey } from "@/types/dungeonMap.types";

describe("cellsRects", () => {
  it("returns one 1x1 rect per cell", () => {
    expect(cellsRects(["1,2", "0,0"])).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 2, w: 1, h: 1 },
    ]);
  });

  it("returns nothing for an empty set", () => {
    expect(cellsRects([])).toEqual([]);
  });
});

describe("outlinePath", () => {
  it("traces a 2x2 square as 8 segments", () => {
    const cells: CellKey[] = ["0,0", "1,0", "0,1", "1,1"];
    const path = outlinePath(cells);
    expect(path.match(/M /g)).toHaveLength(8);
  });

  it("traces an L-tromino as 8 segments — its known perimeter", () => {
    const cells: CellKey[] = ["0,0", "1,0", "0,1"];
    const path = outlinePath(cells);
    expect(path.match(/M /g)).toHaveLength(8);
  });

  it("traces a single cell as its own 4 edges", () => {
    expect(outlinePath(["3,3"]).match(/M /g)).toHaveLength(4);
  });

  it("draws nothing for an empty set", () => {
    expect(outlinePath([])).toBe("");
  });

  it("insets each edge inward without shortening it", () => {
    const path = outlinePath(["0,0"], 0.1);
    expect(path).toContain("M 0 0.1 h 1");
    expect(path).toContain("M 0.1 0 v 1");
    // The bottom and right edges are inset inward too (towards the cell), not outward.
    expect(path).toContain("M 0 0.9 h 1");
    expect(path).toContain("M 0.9 0 v 1");
  });
});

describe("centroid", () => {
  it("is the centre of a single cell", () => {
    expect(centroid(["0,0"])).toEqual([0.5, 0.5]);
  });

  it("averages an L-tromino's cell centres", () => {
    const [x, y] = centroid(["0,0", "1,0", "0,1"])!;
    expect(x).toBeCloseTo(2.5 / 3);
    expect(y).toBeCloseTo(2.5 / 3);
  });

  it("is null for an empty set", () => {
    expect(centroid([])).toBeNull();
  });
});

describe("textureCells", () => {
  it("picks the sa-plan.js sparse texture cells", () => {
    // (x*7 + y*13) % 5 === 0
    expect(textureCells(["0,0", "1,0", "2,0", "3,0", "5,0"])).toEqual(["0,0", "5,0"]);
  });

  it("weighs the row as well as the column", () => {
    // (x*7 + y*13) % 5 === 0 : (1,1)=20, (2,2)=40, (0,5)=65 qualify; (0,1)=13 and (1,2)=33 do not.
    expect(textureCells(["0,1", "1,1", "1,2", "2,2", "0,5"])).toEqual(["1,1", "2,2", "0,5"]);
  });

  it("returns nothing for an empty set", () => {
    expect(textureCells([])).toEqual([]);
  });
});

describe("waySegment", () => {
  // Grid edges keep the numbers the old edgeSegment gave; a W edge is stored
  // bottom to top (see gridEdgeSegment), so its ends come out in that order.
  it("draws an N edge along the cell's top", () => {
    expect(waySegment(gridEdgeSegment("2,3:N"))).toEqual({ x1: 2, y1: 3, x2: 3, y2: 3 });
  });

  it("draws a W edge along the cell's left side", () => {
    expect(waySegment(gridEdgeSegment("2,3:W"))).toEqual({ x1: 2, y1: 4, x2: 2, y2: 3 });
  });

  it("shortens a W edge symmetrically from both ends when inset", () => {
    expect(waySegment(gridEdgeSegment("2,3:W"), 0.2)).toEqual({ x1: 2, y1: 3.8, x2: 2, y2: 3.2 });
  });

  it("shortens an N edge symmetrically from both ends when inset", () => {
    expect(waySegment(gridEdgeSegment("2,3:N"), 0.2)).toEqual({ x1: 2.2, y1: 3, x2: 2.8, y2: 3 });
  });

  // (0,0)-(3,4) is length 5 with unit direction (0.6, 0.8); an inset of 1
  // moves each end 1 along it: (0.6, 0.8) and (3-0.6, 4-0.8) = (2.4, 3.2).
  it("shortens an angled line along its own direction", () => {
    const seg = waySegment(
      [
        [0, 0],
        [3, 4],
      ],
      1,
    );
    expect(seg.x1).toBeCloseTo(0.6);
    expect(seg.y1).toBeCloseTo(0.8);
    expect(seg.x2).toBeCloseTo(2.4);
    expect(seg.y2).toBeCloseTo(3.2);
  });

  // An inset past half the length would swap the ends and draw the bar
  // backwards; it stops at the midpoint (0.5, 0).
  it("collapses a short line to its midpoint rather than inverting it", () => {
    expect(
      waySegment(
        [
          [0, 0],
          [1, 0],
        ],
        0.8,
      ),
    ).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 0 });
  });

  it("returns a zero-length line unchanged instead of dividing by zero", () => {
    expect(
      waySegment(
        [
          [1, 1],
          [1, 1],
        ],
        0.2,
      ),
    ).toEqual({ x1: 1, y1: 1, x2: 1, y2: 1 });
  });
});

describe("planViewBox", () => {
  it("bounds two disjoint cell sets with padding", () => {
    expect(planViewBox([["0,0"], ["3,3", "4,3"]])).toEqual({
      minX: -1,
      minY: -1,
      width: 7,
      height: 6,
    });
  });

  it("respects a custom padding", () => {
    expect(planViewBox([["0,0"]], 0)).toEqual({ minX: 0, minY: 0, width: 1, height: 1 });
  });

  it("is null when nothing is drawn at all", () => {
    expect(planViewBox([])).toBeNull();
    expect(planViewBox([[], []])).toBeNull();
  });
});
