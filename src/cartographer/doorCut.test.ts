import { describe, expect, it } from "vitest";
import type { WallEdge } from "@/types/dungeonMap.types";
import { addFreeDoor, cutDoorIntoWall, removeDoorWall, setDoorWallType } from "./doorCut";

const MATERIAL = { pack_id: "stone", pack_version: 3, variant: 2 };
const wall = (a: [number, number], b: [number, number], over: Partial<WallEdge> = {}): WallEdge => ({ ...MATERIAL, type: "wall", a, b, ...over });
const counter = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe("cutDoorIntoWall", () => {
  // The wall runs (0,0) to (10,0). A door from (4,0) to (5,0) leaves 4 cells before and 5 after.
  const walls = { w: wall([0, 0], [10, 0], { visible: false, smoothA: true, smoothB: true }) };

  it("splits a wall into the stretch before, the door and the stretch after, chained end to end", () => {
    const cut = cutDoorIntoWall(walls, "w", [4, 0], [5, 0], counter())!;
    expect(cut.doorId).toBe("new-1");
    expect(Object.keys(cut.walls).sort()).toEqual(["new-1", "new-2", "w"]);
    // The first stretch keeps the original id; the door and the last stretch are new.
    expect([cut.walls.w!.a, cut.walls.w!.b]).toEqual([[0, 0], [4, 0]]);
    expect([cut.walls["new-1"]!.a, cut.walls["new-1"]!.b]).toEqual([[4, 0], [5, 0]]);
    expect([cut.walls["new-2"]!.a, cut.walls["new-2"]!.b]).toEqual([[5, 0], [10, 0]]);
    expect(cut.walls["new-1"]!.type).toBe("doorClosed");
    expect(cut.walls.w!.type).toBe("wall");
    expect(cut.walls["new-2"]!.type).toBe("wall");
  });

  it("cuts a slanted wall along its own line, door one cell long", () => {
    // (0,0) to (6,8) is 10 long, so one cell is (0.6, 0.8). The door covers t = 0.3 to 0.4 of it.
    const slanted = { s: wall([0, 0], [6, 8]) };
    const cut = cutDoorIntoWall(slanted, "s", [1.8, 2.4], [2.4, 3.2], counter())!;
    const door = cut.walls[cut.doorId]!;
    expect(door.a).toEqual([1.8, 2.4]);
    expect(door.b).toEqual([2.4, 3.2]);
    expect(Math.hypot(door.b[0] - door.a[0], door.b[1] - door.a[1])).toBeCloseTo(1, 9);
    expect(cut.walls.s!.b).toEqual(door.a);
  });

  it("keeps the original material and visibility on all three walls, and a flag only at the outer end it was on", () => {
    const cut = cutDoorIntoWall(walls, "w", [4, 0], [5, 0], counter())!;
    for (const w of Object.values(cut.walls)) expect(w).toMatchObject({ ...MATERIAL, visible: false });
    expect(cut.walls.w!.smoothA).toBe(true);
    expect(cut.walls.w!.smoothB).toBeUndefined();
    expect(cut.walls["new-2"]!.smoothB).toBe(true);
    expect(cut.walls["new-2"]!.smoothA).toBeUndefined();
    expect(cut.walls["new-1"]!.smoothA).toBeUndefined();
    expect(cut.walls["new-1"]!.smoothB).toBeUndefined();
  });

  it("orders the door's two points along the wall whichever way they were given", () => {
    const cut = cutDoorIntoWall(walls, "w", [5, 0], [4, 0], counter())!;
    expect([cut.walls[cut.doorId]!.a, cut.walls[cut.doorId]!.b]).toEqual([[4, 0], [5, 0]]);
  });

  it("makes two walls, not a zero-length stub, for a door at the very start", () => {
    const cut = cutDoorIntoWall({ w: wall([0, 0], [10, 0]) }, "w", [0, 0], [1, 0], counter())!;
    // The stretch before is 0 long, so the original id passes to the stretch after.
    expect(Object.keys(cut.walls).sort()).toEqual(["new-1", "w"]);
    expect([cut.walls.w!.a, cut.walls.w!.b]).toEqual([[1, 0], [10, 0]]);
  });

  it("drops a remainder shorter than 0.05 cells and keeps one of 0.06", () => {
    const short = cutDoorIntoWall({ w: wall([0, 0], [10, 0]) }, "w", [0.04, 0], [1, 0], counter())!;
    expect(Object.keys(short.walls)).toHaveLength(2);
    const kept = cutDoorIntoWall({ w: wall([0, 0], [10, 0]) }, "w", [0.06, 0], [1, 0], counter())!;
    expect(Object.keys(kept.walls)).toHaveLength(3);
  });

  it("leaves just the door when it covers the whole wall", () => {
    const cut = cutDoorIntoWall({ w: wall([0, 0], [1, 0]) }, "w", [0, 0], [1, 0], counter())!;
    expect(Object.keys(cut.walls)).toEqual(["new-1"]);
  });

  it("cuts a curved wall's door with straight chords back to the wall's two ends", () => {
    // The door points sit on a sampled curve, off the chord (0,0)-(10,0): the stretches run to them as straight lines.
    const curved = { c: wall([0, 0], [10, 0], { smoothA: true }) };
    const cut = cutDoorIntoWall(curved, "c", [4, 1], [5, 1], counter())!;
    expect(cut.walls.c!.b).toEqual([4, 1]);
    expect(cut.walls["new-2"]!.a).toEqual([5, 1]);
    expect(cut.walls.c!.smoothA).toBe(true);
  });

  it("switches a grid wall in place and keeps its key and line", () => {
    const grid = { "3,2:W": wall([3, 3], [3, 2]) };
    const cut = cutDoorIntoWall(grid, "3,2:W", [3, 2.4], [3, 2.6], counter())!;
    expect(cut.doorId).toBe("3,2:W");
    expect(Object.keys(cut.walls)).toEqual(["3,2:W"]);
    expect(cut.walls["3,2:W"]).toEqual({ ...grid["3,2:W"], type: "doorClosed" });
  });

  it("cuts an arch as an open doorway", () => {
    const cut = cutDoorIntoWall(walls, "w", [4, 0], [5, 0], counter(), "doorOpen")!;
    expect(cut.walls[cut.doorId]!.type).toBe("doorOpen");
    const grid = cutDoorIntoWall({ "0,0:N": wall([0, 0], [1, 0]) }, "0,0:N", [0, 0], [1, 0], counter(), "doorOpen")!;
    expect(grid.walls["0,0:N"]!.type).toBe("doorOpen");
  });

  it("refuses a wall that is gone or is not plain, and never mutates its input", () => {
    const withDoor = { d: wall([0, 0], [4, 0], { type: "doorClosed" }) };
    expect(cutDoorIntoWall(withDoor, "d", [1, 0], [2, 0], counter())).toBeNull();
    expect(cutDoorIntoWall(walls, "nope", [1, 0], [2, 0], counter())).toBeNull();
    const before = JSON.stringify(walls);
    cutDoorIntoWall(walls, "w", [4, 0], [5, 0], counter());
    expect(JSON.stringify(walls)).toBe(before);
  });
});

describe("addFreeDoor", () => {
  it("adds a hidden door wall with no tile set on its own line", () => {
    const cut = addFreeDoor({}, [2, 2], [3, 2], counter(), "doorOpen");
    expect(cut.walls[cut.doorId]).toEqual({ type: "doorOpen", a: [2, 2], b: [3, 2], visible: false, freeStanding: true, pack_id: "", pack_version: 0, variant: 0 });
  });
});

describe("setDoorWallType and removeDoorWall", () => {
  it("switches a door wall's type and says nothing happened for a wall that is not a door", () => {
    const walls = { d: wall([0, 0], [1, 0], { type: "doorClosed" }), w: wall([1, 0], [2, 0]) };
    expect(setDoorWallType(walls, "d", "doorOpen")!.d!.type).toBe("doorOpen");
    expect(setDoorWallType(walls, "w", "doorOpen")).toBeNull();
    expect(setDoorWallType(walls, "missing", "doorOpen")).toBeNull();
  });

  it("turns a door cut from a wall back into a plain wall that keeps its visibility", () => {
    // The door's end (4,0) is the end of the stretch before it, so it was cut from a wall.
    const walls = { before: wall([0, 0], [4, 0]), d: wall([4, 0], [5, 0], { type: "doorClosed", visible: false }) };
    expect(removeDoorWall(walls, "d")!.d).toMatchObject({ type: "wall", visible: false });
  });

  it("turns a door that is the whole of a lone wall back into that wall, rather than deleting it", () => {
    // A door cut over all of a short wall leaves no stretch either side, so nothing touches it afterwards.
    const cut = cutDoorIntoWall({ w: wall([7, 7], [8, 7]) }, "w", [7, 7], [8, 7], counter())!;
    const next = removeDoorWall(cut.walls, cut.doorId)!;
    expect(Object.values(next).map((w) => [w.type, w.a, w.b])).toEqual([["wall", [7, 7], [8, 7]]]);
  });

  it("deletes a door drawn free across an opening, even one that ends on a wall's end", () => {
    // The opening runs from the end of one wall to the end of the next: the free door touches both.
    const walls = { left: wall([0, 0], [4, 0]), right: wall([5, 0], [9, 0]) };
    const free = addFreeDoor(walls, [4, 0], [5, 0], counter());
    const next = removeDoorWall(free.walls, free.doorId)!;
    expect(Object.keys(next).sort()).toEqual(["left", "right"]);
  });

  it("turns a grid door back into the grid wall even when no neighbour touches it", () => {
    const walls = { "3,2:W": wall([3, 3], [3, 2], { type: "doorClosed" }) };
    expect(removeDoorWall(walls, "3,2:W")!["3,2:W"]!.type).toBe("wall");
  });

  it("does nothing for a key that is not a door", () => {
    expect(removeDoorWall({ w: wall([0, 0], [1, 0]) }, "w")).toBeNull();
    expect(removeDoorWall({}, "x")).toBeNull();
  });
});
