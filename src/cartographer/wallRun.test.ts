import { describe, it, expect } from "vitest";
import { edgeVertices, nearestVertex, runAnchor, wallRun } from "./wallRun";

describe("nearestVertex", () => {
  it("rounds fractional cell coordinates", () => {
    expect(nearestVertex(2.4, 3.6)).toEqual([2, 4]);
  });
});

describe("wallRun", () => {
  it("runs horizontally to the right", () => {
    expect(wallRun([2, 3], [5, 3])).toEqual({
      edges: [
        { x: 2, y: 3, side: "N" },
        { x: 3, y: 3, side: "N" },
        { x: 4, y: 3, side: "N" },
      ],
      end: [5, 3],
    });
  });

  it("runs horizontally to the left, in walking order", () => {
    expect(wallRun([5, 3], [2, 3])).toEqual({
      edges: [
        { x: 4, y: 3, side: "N" },
        { x: 3, y: 3, side: "N" },
        { x: 2, y: 3, side: "N" },
      ],
      end: [2, 3],
    });
  });

  it("runs vertically down", () => {
    expect(wallRun([1, 1], [1, 3])).toEqual({
      edges: [
        { x: 1, y: 1, side: "W" },
        { x: 1, y: 2, side: "W" },
      ],
      end: [1, 3],
    });
  });

  it("runs vertically up, in walking order", () => {
    expect(wallRun([1, 3], [1, 1])).toEqual({
      edges: [
        { x: 1, y: 2, side: "W" },
        { x: 1, y: 1, side: "W" },
      ],
      end: [1, 1],
    });
  });

  it("locks to the dominant axis when the target is off-axis", () => {
    expect(wallRun([0, 0], [4, 1])).toEqual({
      edges: [
        { x: 0, y: 0, side: "N" },
        { x: 1, y: 0, side: "N" },
        { x: 2, y: 0, side: "N" },
        { x: 3, y: 0, side: "N" },
      ],
      end: [4, 0],
    });
    expect(wallRun([0, 0], [1, -3]).end).toEqual([0, -3]);
  });

  it("breaks a diagonal tie toward horizontal", () => {
    expect(wallRun([0, 0], [2, 2]).end).toEqual([2, 0]);
  });

  it("yields no edges for a zero-length run", () => {
    expect(wallRun([3, 3], [3, 3])).toEqual({ edges: [], end: [3, 3] });
  });
});

describe("edgeVertices", () => {
  it("handles every side of cell (1, 2)", () => {
    expect(edgeVertices({ x: 1, y: 2, side: "N" })).toEqual([[1, 2], [2, 2]]);
    expect(edgeVertices({ x: 1, y: 2, side: "W" })).toEqual([[1, 2], [1, 3]]);
    expect(edgeVertices({ x: 1, y: 2, side: "S" })).toEqual([[1, 3], [2, 3]]);
    expect(edgeVertices({ x: 1, y: 2, side: "E" })).toEqual([[2, 2], [2, 3]]);
  });
});

describe("runAnchor", () => {
  const edge = { x: 0, y: 0, side: "N" } as const;

  it("picks the end nearer the target", () => {
    expect(runAnchor(edge, [5, 0])).toEqual([1, 0]);
    expect(runAnchor(edge, [-3, 2])).toEqual([0, 0]);
  });

  it("picks the first end on a tie", () => {
    expect(runAnchor(edge, [0.5, 0])).toEqual([0, 0]);
  });
});
