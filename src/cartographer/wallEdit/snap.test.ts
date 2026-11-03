import { describe, expect, it } from "vitest";
import { buildGraph, type WallMap } from "./graph";
import { snapNode } from "./snap";
import { lattice, rect } from "./fixtures.test-helpers";

const row: WallMap = {};
lattice(row, 0, 0, 4, 0);
const g = buildGraph(row);

describe("snapNode", () => {
  it("prefers a node over a wall that is nearer", () => {
    // 0.1 from the wall, 0.14 from the node at (2,0): the node still wins.
    expect(snapNode([1.9, 0.1], g)).toMatchObject({ kind: "node", node: "2,0", point: [2, 0] });
  });

  it("prefers a wall over the grid, returning the foot point and the wall to split", () => {
    const s = snapNode([2.5, 0.2], g);
    expect(s).toMatchObject({ kind: "wall", point: [2.5, 0], segment: "2,0:N", run: "0,0>4,0" });
  });

  it("falls back to the grid in whole and half cells", () => {
    expect(snapNode([2.6, 0.7], g)).toEqual({ kind: "grid", point: [2.5, 0.5] });
    expect(snapNode([2.9, 1.2], g)).toEqual({ kind: "grid", point: [3, 1] });
  });

  it("Alt keeps the point free to a thousandth of a cell, but a wall still pulls", () => {
    expect(snapNode([2.6004, 0.7], g, { free: true })).toEqual({ kind: "free", point: [2.6, 0.7] });
    expect(snapNode([2.5, 0.2], g, { free: true }).kind).toBe("wall");
  });

  it("does not pull beyond the tolerance", () => {
    expect(snapNode([2.5, 0.26], g).kind).toBe("grid");
    expect(snapNode([2.5, 0.26], g, { tolerance: 0.3 }).kind).toBe("wall");
  });

  it("never snaps the dragged node to its own walls or their far ends", () => {
    const room = buildGraph(rect(0, 0, 4, 3));
    // Near the right wall just above the dragged corner (4,3): without the exclusion this lands on that wall.
    expect(snapNode([4.1, 2.5], room)).toMatchObject({ kind: "wall" });
    expect(snapNode([4.1, 2.5], room, { dragged: "4,3" })).toEqual({ kind: "grid", point: [4, 2.5] });
    // And its own neighbour node (4,2) is not a target either.
    expect(snapNode([4.1, 2.1], room, { dragged: "4,3" }).kind).not.toBe("node");
  });

  it("still snaps the dragged node to other walls and nodes", () => {
    const room = buildGraph(rect(0, 0, 4, 3));
    expect(snapNode([0.1, 0.1], room, { dragged: "4,3" })).toMatchObject({ kind: "node", node: "0,0" });
  });
});
