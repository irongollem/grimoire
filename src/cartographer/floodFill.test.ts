import { describe, it, expect } from "vitest";
import { floodFill, boundaryEdges } from "./floodFill";
import type { CellKey } from "@/types/dungeonMap.types";

// A small predicate fixture: cells with floor are in the set passed in.
function predicateFromSet(cells: ReadonlySet<CellKey>): (x: number, y: number) => boolean {
  return (x, y) => cells.has(`${x},${y}`);
}

describe("floodFill — 4-way contiguous region", () => {
  it("returns the start cell when the start cell is the only matching cell", () => {
    const set = new Set<CellKey>(["3,3"]);
    const region = floodFill(3, 3, predicateFromSet(set));
    expect(region).toEqual(new Set(["3,3"]));
  });

  it("returns an empty set if the start cell does NOT match the predicate", () => {
    const set = new Set<CellKey>(["3,3"]);
    const region = floodFill(2, 2, predicateFromSet(set));
    expect(region.size).toBe(0);
  });

  it("walks contiguous matching cells (4-way connectivity)", () => {
    // Plus-shape centered on (5,5) — all five cells flood from the centre.
    const set = new Set<CellKey>(["5,5", "4,5", "6,5", "5,4", "5,6"]);
    const region = floodFill(5, 5, predicateFromSet(set));
    expect(region).toEqual(new Set(["5,5", "4,5", "6,5", "5,4", "5,6"]));
  });

  it("never jumps diagonally — isolated diagonal cell is unreachable", () => {
    // (5,5) and (4,4) are both floor but no bridging 4-way path exists.
    const set = new Set<CellKey>(["5,5", "4,4"]);
    const region = floodFill(5, 5, predicateFromSet(set));
    expect(region).toEqual(new Set(["5,5"]));
    expect(region.has("4,4")).toBe(false);
  });

  it("stops at non-matching neighbours", () => {
    // A 3×3 floor region but the cell at (1,1) is missing — flood from (0,0)
    // should still cover the rest.
    const set = new Set<CellKey>([
      "0,0", "1,0", "2,0",
      "0,1",        "2,1",
      "0,2", "1,2", "2,2",
    ]);
    const region = floodFill(0, 0, predicateFromSet(set));
    expect(region.size).toBe(8);
    expect(region.has("1,1")).toBe(false);
  });

  it("does not visit a cell twice (no infinite loop on cycles)", () => {
    // The region forms a ring; the flood must terminate.
    const set = new Set<CellKey>([
      "0,0", "1,0", "2,0",
      "0,1",        "2,1",
      "0,2", "1,2", "2,2",
    ]);
    const region = floodFill(0, 0, predicateFromSet(set));
    expect(region.size).toBe(8);
  });

  it("respects a maximum-cells safety cap to prevent runaway fills", () => {
    // Predicate that matches everything — infinite region. Cap protects us.
    const allTrue = () => true;
    const region = floodFill(0, 0, allTrue, { maxCells: 100 });
    expect(region.size).toBe(100);
  });
});

describe("boundaryEdges — every edge of a region facing void", () => {
  it("a single cell has 4 boundary edges (N, E, S, W)", () => {
    const region = new Set<CellKey>(["5,5"]);
    const edges = boundaryEdges(region);
    expect(edges).toHaveLength(4);
    expect(edges).toContainEqual({ x: 5, y: 5, side: "N" });
    expect(edges).toContainEqual({ x: 5, y: 5, side: "E" });
    expect(edges).toContainEqual({ x: 5, y: 5, side: "S" });
    expect(edges).toContainEqual({ x: 5, y: 5, side: "W" });
  });

  it("a 2x1 horizontal region shares one edge → 6 total boundaries", () => {
    const region = new Set<CellKey>(["0,0", "1,0"]);
    const edges = boundaryEdges(region);
    expect(edges).toHaveLength(6);
    // Internal east edge of (0,0) and west edge of (1,0) are NOT boundaries
    expect(edges.some((e) => e.x === 0 && e.y === 0 && e.side === "E")).toBe(false);
    expect(edges.some((e) => e.x === 1 && e.y === 0 && e.side === "W")).toBe(false);
  });

  it("a 2x2 block has 8 boundary edges (4 cells × 4 - 4 internal × 2-share)", () => {
    const region = new Set<CellKey>(["0,0", "1,0", "0,1", "1,1"]);
    const edges = boundaryEdges(region);
    expect(edges).toHaveLength(8);
  });
});
