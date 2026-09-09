import { describe, it, expect } from "vitest";
import { cellsRects, centroid, edgeSegment, outlinePath, planViewBox, textureCells } from "./planSvg";
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

  it("returns nothing for an empty set", () => {
    expect(textureCells([])).toEqual([]);
  });
});

describe("edgeSegment", () => {
  it("resolves an N edge to the cell's top side", () => {
    expect(edgeSegment("2,3:N")).toEqual({ x1: 2, y1: 3, x2: 3, y2: 3 });
  });

  it("resolves a W edge to the cell's left side", () => {
    expect(edgeSegment("2,3:W")).toEqual({ x1: 2, y1: 3, x2: 2, y2: 4 });
  });

  it("shortens symmetrically from both ends when inset", () => {
    expect(edgeSegment("2,3:N", 0.2)).toEqual({ x1: 2.2, y1: 3, x2: 2.8, y2: 3 });
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
