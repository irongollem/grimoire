import { describe, it, expect } from "vitest";
import { emptyLayers } from "@/types/dungeonMap.types";
import { putWall } from "./testWalls";
import { angledWalls, isDrawn, isLatticeKey, latticeWalls, wallAt, wallCutsEdge, wallSegment } from "./wallGraph";

const REF = { pack_id: "p", pack_version: 1, variant: 0 };

describe("wallCutsEdge: does a wall separate two neighbouring cells?", () => {
  // The edge between cells (0,0) and (1,0) is the vertical grid line x = 1 from y = 0 to y = 1.
  const p: [number, number] = [1, 0];
  const q: [number, number] = [1, 1];

  it("cuts when the wall lies along the edge (a wall on the grid line)", () => {
    expect(wallCutsEdge([1, 0], [1, 1], p, q)).toBe(true);
    expect(wallCutsEdge([1, -2], [1, 3], p, q)).toBe(true);
  });

  it("cuts when a slanted wall crosses the edge in its middle", () => {
    expect(wallCutsEdge([0.6, -0.2], [1.4, 1.2], p, q)).toBe(true);
  });

  it("cuts when a wall ends inside the edge, in the doorway between the cells", () => {
    expect(wallCutsEdge([0.5, 0.5], [1, 0.5], p, q)).toBe(true);
  });

  it("does not cut when the wall only touches a corner of the edge", () => {
    // A diagonal through the grid point (1,1) crosses no edge between these two cells.
    expect(wallCutsEdge([0.5, 1.5], [1, 1], p, q)).toBe(false);
    expect(wallCutsEdge([0, 2], [1, 1], p, q)).toBe(false);
    expect(wallCutsEdge([0.5, 0.5], [1, 0], p, q)).toBe(false);
  });

  it("does not cut when the wall is collinear with the edge but only meets it end to end", () => {
    expect(wallCutsEdge([1, 1], [1, 2], p, q)).toBe(false);
    expect(wallCutsEdge([1, -1], [1, 0], p, q)).toBe(false);
  });

  it("does not cut when the wall misses the edge altogether", () => {
    expect(wallCutsEdge([2, 0], [2, 1], p, q)).toBe(false);
    expect(wallCutsEdge([1.2, 0.2], [2, 0.8], p, q)).toBe(false);
  });
});

describe("reading walls off the layer", () => {
  it("finds the wall on any side of a cell through NW ownership, and none on an edge nothing owns", () => {
    const layers = emptyLayers();
    putWall(layers, 2, 3, "N", { ...REF, type: "wall" });
    putWall(layers, 2, 3, "W", { ...REF, type: "doorClosed" });
    expect(wallAt(layers, 2, 3, "N")?.type).toBe("wall");
    expect(wallAt(layers, 2, 2, "S")?.type).toBe("wall"); // the cell above sees the same edge as its south
    expect(wallAt(layers, 2, 3, "W")?.type).toBe("doorClosed");
    expect(wallAt(layers, 1, 3, "E")?.type).toBe("doorClosed");
    expect(wallAt(layers, 2, 3, "S")).toBeUndefined();
  });

  it("tells a lattice wall's key from an angled wall's id, and sorts the two apart", () => {
    const layers = emptyLayers();
    putWall(layers, 0, 0, "N", { ...REF, type: "wall" });
    layers.walls["3f2a"] = { ...REF, type: "wall", a: [0.5, 0], b: [2, 1.5] };
    expect(isLatticeKey("0,0:N")).toBe(true);
    expect(isLatticeKey("3f2a")).toBe(false);
    expect(latticeWalls(layers).map((e) => [e.x, e.y, e.side])).toEqual([[0, 0, "N"]]);
    expect(angledWalls(layers).map(([id]) => id)).toEqual(["3f2a"]);
  });

  it("takes a lattice wall's line from its key and an angled wall's from its end points", () => {
    const layers = emptyLayers();
    putWall(layers, 2, 3, "W", { ...REF, type: "wall" });
    layers.walls.free = { ...REF, type: "wall", a: [0.5, 0], b: [2, 1.5] };
    // The key is the truth for a wall on a grid line, even if the stored end points were hand-edited out of step.
    expect(wallSegment("2,3:W", { ...layers.walls["2,3:W"], a: [9, 9], b: [9, 10] })).toEqual({ id: "2,3:W", a: [2, 3], b: [2, 4] });
    expect(wallSegment("free", layers.walls.free)).toEqual({ id: "free", a: [0.5, 0], b: [2, 1.5] });
  });

  it("counts a wall as drawn unless it says visible: false", () => {
    const layers = emptyLayers();
    putWall(layers, 0, 0, "N", { ...REF, type: "wall" });
    putWall(layers, 1, 0, "N", { ...REF, type: "wall" }, false);
    expect(isDrawn(layers.walls["0,0:N"])).toBe(true);
    expect(isDrawn(layers.walls["1,0:N"])).toBe(false);
    expect(isDrawn(undefined)).toBe(false);
  });
});
