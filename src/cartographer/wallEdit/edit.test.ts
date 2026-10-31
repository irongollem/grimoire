import { describe, expect, it } from "vitest";
import { deleteBone, moveBone, moveNode, moveNodes, removeNode, splitAt, type EditResult } from "./edit";
import { buildGraph, type WallMap } from "./graph";
import { detectRooms } from "./rooms";
import { angled, counter, lattice, rect } from "./fixtures.test-helpers";

function ok(r: EditResult): WallMap {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.walls;
}
const opts = () => ({ newKey: counter() });
const isUuidKey = (k: string): boolean => !k.includes(":");

describe("moveNode", () => {
  it("dragging a corner of a room keeps the loop closed and turns the two walls angled", () => {
    const before = rect(0, 0, 4, 3);
    const after = ok(moveNode(before, "4,3", [5, 4], opts()));
    const g = buildGraph(after);
    expect(detectRooms(g)).toHaveLength(1);
    const angledKeys = Object.keys(after).filter(isUuidKey);
    expect(angledKeys).toHaveLength(2);
    // Walls not touching the corner stay on the lattice, untouched.
    expect(after["0,0:N"]).toEqual(before["0,0:N"]);
    expect(after["0,0:W"]).toEqual(before["0,0:W"]);
    // The old unit segments of the two moved walls are gone.
    expect(after["3,3:N"]).toBeUndefined();
    expect(after["4,2:W"]).toBeUndefined();
  });

  it("moving the corner back onto the grid gives the lattice keys back, exactly as before", () => {
    const before = rect(0, 0, 4, 3);
    const moved = ok(moveNode(before, "4,3", [5, 4], opts()));
    const back = ok(moveNode(moved, "5,4", [4, 3], opts()));
    expect(back).toEqual(before);
  });

  it("a moved angled wall keeps its other fields and its own key", () => {
    const walls: WallMap = {};
    angled(walls, "keep-me", [0, 0], [4, 1], { variant: 3, rotation: 90, decal: 2, visible: false });
    const after = ok(moveNode(walls, "4,1", [4, 2], opts()));
    expect(after["keep-me"]).toEqual({ ...walls["keep-me"], b: [4, 2] });
  });

  it("a door keeps its fraction of the bone when the bone stretches along the grid", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 10, 0);
    walls["4,0:N"] = { ...walls["4,0:N"], type: "doorClosed" };
    const after = ok(moveNode(walls, "10,0", [20, 0], opts()));
    // 0.4..0.5 of 20 cells is x 8..10: two cells wide now, still lattice.
    expect(after["8,0:N"].type).toBe("doorClosed");
    expect(after["9,0:N"].type).toBe("doorClosed");
    expect(after["7,0:N"].type).toBe("wall");
    expect(after["10,0:N"].type).toBe("wall");
  });

  it("a door rides its bone off the grid and is still a door there", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 10, 0);
    walls["4,0:N"] = { ...walls["4,0:N"], type: "doorClosed" };
    const after = ok(moveNode(walls, "10,0", [10, 10], opts()));
    const doors = Object.values(after).filter((w) => w.type === "doorClosed");
    expect(doors).toHaveLength(1);
    const len = Math.hypot(10, 10);
    const along = (p: [number, number]): number => (p[0] * 10 + p[1] * 10) / (len * len);
    expect([along(doors[0].a), along(doors[0].b)].map((v) => Math.round(v * 1e6) / 1e6).sort()).toEqual([0.4, 0.5]);
    expect(Object.keys(after).every(isUuidKey)).toBe(true);
  });

  it("walls meeting at the node all follow it", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 3, 0);
    lattice(walls, 3, 0, 3, 3);
    lattice(walls, 3, 0, 6, 0);
    const after = ok(moveNode(walls, "3,0", [3, -2], opts()));
    const ends = buildGraph(after).nodes.get("3,-2")!;
    expect(ends.segs).toHaveLength(3);
  });

  it("refuses to shrink a wall to a point", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 3, 0);
    expect(moveNode(walls, "0,0", [3, 0])).toEqual({ ok: false, reason: "collapsed" });
  });

  it("refuses an unknown node", () => {
    expect(moveNode(rect(0, 0, 2, 2), "9,9", [1, 1])).toEqual({ ok: false, reason: "unknown-node" });
  });

  it("a node that is only a straight point in a wall can be dragged out into a bend", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    const after = ok(moveNode(walls, "2,0", [2, 1], opts()));
    expect(buildGraph(after).runs).toHaveLength(2);
    expect(Object.keys(after).filter(isUuidKey)).toHaveLength(2);
    expect(Object.keys(after).filter((k) => !isUuidKey(k))).toEqual([]);
  });

  it("dropping a node onto the middle of a wall splits that wall there, and a loop closes into a room", () => {
    const walls = rect(0, 0, 4, 4);
    for (const k of ["4,0:W", "4,1:W"]) delete walls[k]; // right wall open at the top: a stub from (4,4) up to (4,2)
    expect(detectRooms(buildGraph(walls))).toHaveLength(0);
    const after = ok(moveNode(walls, "4,2", [2.5, 0], opts()));
    const g = buildGraph(after);
    expect(g.nodes.get("2.5,0")!.segs).toHaveLength(3);
    const rooms = detectRooms(g);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(13, 6); // trapezoid (0,0) (2.5,0) (4,4) (0,4): (2.5 + 4) / 2 * 4
  });

  it("a wall dragged across another is split at the crossing so both meet at a node", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 2, 6, 2);
    lattice(walls, 3, 0, 3, 1);
    const after = ok(moveNode(walls, "3,1", [3.5, 4], opts()));
    const g = buildGraph(after);
    expect(g.nodes.get("3.25,2")!.segs).toHaveLength(4);
  });

  it("refuses to lay a wall along another (angled)", () => {
    const walls: WallMap = {};
    angled(walls, "a", [0, 0], [4, 2]);
    angled(walls, "b", [8, 4], [6, 3]);
    expect(moveNode(walls, "8,4", [2, 1])).toEqual({ ok: false, reason: "overlap" });
  });

  it("refuses to lay a lattice wall on a lattice wall that is already there", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    lattice(walls, 5, 0, 6, 0);
    expect(moveNode(walls, "6,0", [2, 0])).toEqual({ ok: false, reason: "overlap" });
  });

  it("moving several nodes at once moves each (a whole-wall drag)", () => {
    const after = ok(moveNodes(rect(0, 0, 2, 2), new Map([["0,0", [0, 1]], ["2,0", [2, 1]]]), opts()));
    expect(detectRooms(buildGraph(after))[0].area).toBe(2);
  });
});

describe("moveBone", () => {
  it("slides a wall sideways and the walls meeting it stretch to follow", () => {
    const after = ok(moveBone(rect(0, 0, 4, 3), "0,0>4,0", [0, 1], opts()));
    expect(after["0,1:N"]).toBeDefined();
    expect(after["0,0:N"]).toBeUndefined();
    // The left wall now runs from (0,1) down to (0,3): two units, not three.
    expect(Object.keys(after).filter((k) => k.endsWith(":W") && k.startsWith("0,")).sort()).toEqual(["0,1:W", "0,2:W"]);
    expect(detectRooms(buildGraph(after))[0].area).toBe(8);
  });

  it("refuses an unknown run", () => {
    expect(moveBone(rect(0, 0, 2, 2), "nope", [1, 0])).toEqual({ ok: false, reason: "unknown-run" });
  });
});

describe("deleteBone", () => {
  it("removes the whole bone, doors included, and nothing else", () => {
    const walls = rect(0, 0, 4, 3);
    walls["1,0:N"] = { ...walls["1,0:N"], type: "doorClosed" };
    const after = ok(deleteBone(walls, "0,0>4,0"));
    expect(Object.keys(after).filter((k) => k.endsWith(":N") && k.includes(",0:"))).toEqual([]);
    expect(Object.keys(after)).toHaveLength(Object.keys(walls).length - 4);
  });
});

describe("splitAt", () => {
  it("adds a node inside a unit segment by splitting it, and returns the node", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 2, 0);
    const r = splitAt(walls, "0,0>2,0", [0.5, 0.1], opts());
    const after = ok(r);
    expect(r.node).toBe("0.5,0");
    expect(after["0,0:N"]).toBeUndefined();
    expect(Object.keys(after).filter(isUuidKey)).toHaveLength(2);
    expect(buildGraph(after).nodes.get("0.5,0")!.segs).toHaveLength(2);
  });

  it("on a grid point between two units it only names the node: nothing to split", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    const r = splitAt(walls, "0,0>4,0", [2, 0.3], opts());
    expect(ok(r)).toEqual(walls);
    expect(r.node).toBe("2,0");
  });

  it("refuses the ends of the run", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    expect(splitAt(walls, "0,0>4,0", [-1, 0.2])).toMatchObject({ ok: false, reason: "at-end" });
  });

  it("a bend made then moved is a corner", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    const split = splitAt(walls, "0,0>4,0", [2, 0], opts());
    const bent = ok(moveNode(ok(split), split.node!, [2, 2], opts()));
    expect(buildGraph(bent).runs).toHaveLength(2);
  });
});

describe("removeNode", () => {
  it("merges the two bones at a corner into one straight wall between their far ends", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 3, 0);
    lattice(walls, 3, 0, 3, 4);
    const after = ok(removeNode(walls, "3,0", opts()));
    const g = buildGraph(after);
    expect(g.runs.map((r) => r.id)).toEqual(["0,0>3,4"]);
    expect(Object.keys(after).every(isUuidKey)).toBe(true);
  });

  it("removing a bend restores the straight lattice wall exactly", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    const split = splitAt(walls, "0,0>4,0", [2, 0], opts());
    const bent = ok(moveNode(ok(split), split.node!, [2, 2], opts()));
    const straight = ok(removeNode(bent, "2,2", opts()));
    expect(straight).toEqual(walls);
  });

  it("a door on either bone keeps its fraction of the combined length", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 2, 0); // length 2
    lattice(walls, 2, 0, 2, 2); // length 2 -> merged diagonal length 2.828
    walls["2,1:W"] = { ...walls["2,1:W"], type: "doorOpen" };
    const after = ok(removeNode(walls, "2,0", opts()));
    const door = Object.values(after).find((w) => w.type === "doorOpen")!;
    // Door was the last quarter of the combined 4 cells: 0.75..1 along the new wall.
    expect(door.a[0]).toBeCloseTo(0 + 2 * 0.75, 5);
    expect(door.b).toEqual([2, 2]);
  });

  it("refuses at a T-junction, where three bones meet", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    lattice(walls, 2, 0, 2, 3);
    expect(removeNode(walls, "2,0")).toEqual({ ok: false, reason: "not-two-bones" });
  });

  it("refuses at a dead end", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    expect(removeNode(walls, "4,0")).toEqual({ ok: false, reason: "not-two-bones" });
  });

  it("refuses when the two far ends are the same place", () => {
    const walls: WallMap = {};
    angled(walls, "a", [0, 0], [2, 0]);
    angled(walls, "b", [2, 0], [0, 0]);
    expect(removeNode(walls, "2,0")).toEqual({ ok: false, reason: "collapsed" });
  });

  it("refuses an unknown node", () => {
    expect(removeNode(rect(0, 0, 2, 2), "9,9")).toEqual({ ok: false, reason: "unknown-node" });
  });
});
