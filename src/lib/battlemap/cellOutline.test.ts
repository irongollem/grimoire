import { describe, expect, it } from "vitest";
import { cellOutline } from "./cellOutline";

describe("cellOutline", () => {
  it("outlines an L-shape by its perimeter, not its bounding box", () => {
    const edges = cellOutline(["0,0", "1,0", "0,1"]);
    expect(edges).toHaveLength(8);
    // The inside corner of the L is an edge a bounding box would not have.
    expect(edges).toContainEqual({ x1: 1, y1: 1, x2: 2, y2: 1 });
    // The missing corner square has no edge of its own.
    expect(edges).not.toContainEqual({ x1: 2, y1: 2, x2: 2, y2: 1 });
  });
  it("draws nothing between two neighbours", () => {
    const edges = cellOutline(["0,0", "1,0"]);
    expect(edges).not.toContainEqual({ x1: 1, y1: 0, x2: 1, y2: 1 });
    expect(edges).toHaveLength(6);
  });
});
