import { describe, expect, it } from "vitest";
import { buildGraph, type WallMap } from "./graph";
import { moveNode } from "./edit";
import { detectRooms, floorCellsOf, floorChange, type Room } from "./rooms";
import { angled, counter, lattice, rect } from "./fixtures.test-helpers";

describe("detectRooms", () => {
  it("a closed rectangle is one room of its area", () => {
    const rooms = detectRooms(buildGraph(rect(0, 0, 4, 3)));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(12);
  });

  it("an open loop is no room: the gap leaves the outside connected", () => {
    const walls = rect(0, 0, 4, 3);
    delete walls["2,0:N"];
    expect(detectRooms(buildGraph(walls))).toHaveLength(0);
  });

  it("two rooms sharing a wall are two faces, not one", () => {
    const walls = rect(0, 0, 6, 3);
    lattice(walls, 3, 0, 3, 3);
    const rooms = detectRooms(buildGraph(walls));
    expect(rooms.map((r) => r.area).sort()).toEqual([9, 9]);
  });

  it("a wall dangling into a room does not change the room", () => {
    const walls = rect(0, 0, 4, 4);
    lattice(walls, 2, 0, 2, 2);
    const rooms = detectRooms(buildGraph(walls));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(16);
  });

  it("an angled triangle is a room", () => {
    const walls: WallMap = {};
    angled(walls, "a", [0, 0], [4, 0]);
    angled(walls, "b", [4, 0], [0, 3]);
    angled(walls, "c", [0, 3], [0, 0]);
    expect(detectRooms(buildGraph(walls))[0].area).toBe(6);
  });

  it("a room inside another is its own face and the outer face is still reported", () => {
    const walls = rect(0, 0, 8, 8);
    Object.assign(walls, Object.fromEntries(Object.entries(rect(2, 2, 4, 4)).map(([k, v]) => [k, v])));
    expect(detectRooms(buildGraph(walls)).map((r) => r.area).sort((p, q) => p - q)).toEqual([4, 64]);
  });
});

describe("floorCellsOf", () => {
  it("takes the cells whose centre is inside, not those the outline merely touches", () => {
    // Triangle (0,0) (4,0) (0,4): centres with x + y < 4 -> cells where x + y + 1 < 4 -> 6 cells.
    const cells = floorCellsOf([[0, 0], [4, 0], [0, 4]]);
    expect(cells.sort()).toEqual(["0,0", "0,1", "0,2", "1,0", "1,1", "2,0"]);
  });
});

describe("floorChange", () => {
  const room = (polygon: [number, number][]): Room => ({ polygon, area: 0, segments: [] });

  it("dragging a corner down adds exactly the cells that came inside", () => {
    const before = detectRooms(buildGraph(rect(0, 0, 4, 3)));
    const moved = moveNode(rect(0, 0, 4, 3), "4,3", [4, 5], { newKey: counter() });
    if (!moved.ok) throw new Error(moved.reason);
    const after = detectRooms(buildGraph(moved.walls));
    // New outline (0,0) (4,0) (4,5) (0,3): below row 3 the bottom edge is y = 3 + x / 2.
    const change = floorChange(before, after);
    expect(change.add.sort()).toEqual(["1,3", "2,3", "3,3", "3,4"]);
    expect(change.remove).toEqual([]);
  });

  it("the same drag undone removes those cells", () => {
    const small = [room([[0, 0], [4, 0], [4, 3], [0, 3]])];
    const big = [room([[0, 0], [4, 0], [4, 5], [0, 3]])];
    const change = floorChange(big, small);
    expect(change.remove.sort()).toEqual(["1,3", "2,3", "3,3", "3,4"]);
    expect(change.add).toEqual([]);
  });

  it("a cell another room still covers is not removed", () => {
    const a = room([[0, 0], [2, 0], [2, 2], [0, 2]]);
    const b = room([[1, 0], [3, 0], [3, 2], [1, 2]]);
    // Room a goes away; the column of cells at x = 1 is still inside b.
    const change = floorChange([a, b], [b]);
    expect(change.remove.sort()).toEqual(["0,0", "0,1"]);
  });
});
