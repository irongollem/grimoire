import { describe, expect, it } from "vitest";
import type { CellKey, DungeonMapLayers, EdgeSegType, PackRef, WallEdge } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import { brushDisc, brushDiscs } from "@/test/brushDisc";
import { canonicaliseEdge, type Side } from "./edges";
import { findFaces, simplifyLoop } from "./roomOutline";
import { deriveSpaces } from "./structure";
import { putWall } from "./testWalls";
import { wallAt } from "./wallGraph";

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };

function emptyLayers(): DungeonMapLayers {
  return { floor: {}, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {}, walls: {}, lights: {} };
}

function room(layers: DungeonMapLayers, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) layers.floor[cellKey(x, y)] = { floor: PACK };
}

function wall(layers: DungeonMapLayers, x: number, y: number, side: Side, type: EdgeSegType = "wall"): void {
  const o = canonicaliseEdge(x, y, side);
  putWall(layers, o.x, o.y, o.side, { ...PACK, type });
}

function angled(layers: DungeonMapLayers, id: string, a: [number, number], b: [number, number]): void {
  const w: WallEdge = { ...PACK, type: "wall", a, b };
  layers.walls[id] = w;
}

/** The flood fill this derivation replaced, kept as the oracle for lattice-only maps (4-connected squares, cut by every wall). */
function floodRooms(layers: DungeonMapLayers): string[] {
  const open = (x: number, y: number): boolean => !layers.solidBlock[cellKey(x, y)] && layers.floor[cellKey(x, y)]?.floor !== undefined;
  const seen = new Set<CellKey>();
  const rooms: string[] = [];
  for (const k of Object.keys(layers.floor) as CellKey[]) {
    const [sx, sy] = k.split(",").map(Number);
    if (seen.has(k) || !open(sx, sy)) continue;
    const comp: CellKey[] = [];
    const queue: [number, number][] = [[sx, sy]];
    seen.add(k);
    while (queue.length) {
      const [x, y] = queue.pop()!;
      comp.push(cellKey(x, y));
      for (const [dx, dy, side] of [[0, -1, "N"], [1, 0, "E"], [0, 1, "S"], [-1, 0, "W"]] as const) {
        const nk = cellKey(x + dx, y + dy);
        if (seen.has(nk) || !open(x + dx, y + dy) || wallAt(layers, x, y, side)) continue;
        seen.add(nk);
        queue.push([x + dx, y + dy]);
      }
    }
    rooms.push(comp.sort().join(";"));
  }
  return rooms.sort();
}

const asRooms = (layers: DungeonMapLayers): string[] => deriveSpaces(layers).map((s) => [...s.cells].sort().join(";")).sort();

describe("rooms found from the walls", () => {
  it("a lattice-only map yields the squares the flood fill did, so existing sites do not see every room as changed", () => {
    const l = emptyLayers();
    room(l, 0, 0, 8, 6);
    // a door-split pair, a closet walled inside the hall, a pillar island, a one-edge spur and a floor notch
    for (let y = 0; y < 6; y++) wall(l, 4, y, "W", y === 2 ? "doorClosed" : "wall");
    for (let x = 1; x < 3; x++) { wall(l, x, 1, "N"); wall(l, x, 3, "N"); }
    for (let y = 1; y < 3; y++) { wall(l, 1, y, "W"); wall(l, 3, y, "W"); }
    delete l.floor[cellKey(6, 3)];
    l.solidBlock[cellKey(6, 2)] = { ...PACK };
    wall(l, 6, 4, "N");
    room(l, 10, 0, 2, 2);
    room(l, 12, 1, 1, 1); // touches the square before it with no wall: one room of three
    expect(asRooms(l)).toEqual(floodRooms(l));
    expect(deriveSpaces(l).length).toBeGreaterThan(3);
  });

  // An angled wall drawn through a lattice wall's middle, not welded to it: it still divides the room.
  it("an angled wall crossing a room's wall mid-edge divides the room", () => {
    const l = emptyLayers();
    room(l, 0, 0, 6, 6);
    for (let i = 0; i < 6; i++) { wall(l, i, 0, "N"); wall(l, i, 5, "S"); wall(l, 0, i, "W"); wall(l, 5, i, "E"); }
    angled(l, "cut", [-0.5, 2.5], [6.5, 3.2]);
    const faces = findFaces(l).filter((f) => f.cells.length > 1);
    expect(faces).toHaveLength(2);
  });

  it("two rooms sharing an angled wall get outlines that share that exact segment and do not overlap", () => {
    const l = emptyLayers();
    room(l, 0, 0, 6, 6);
    // box walls on the lattice, a diagonal from (0,0) to (6,6) between them
    for (let i = 0; i < 6; i++) { wall(l, i, 0, "N"); wall(l, i, 5, "S"); wall(l, 0, i, "W"); wall(l, 5, i, "E"); }
    angled(l, "diag", [0, 0], [6, 6]);
    const faces = findFaces(l);
    expect(faces).toHaveLength(2);
    const [p, q] = faces.map((f) => f.outline.map(([x, y]) => `${x},${y}`));
    expect(p).toContain("0,0");
    expect(p.filter((v) => q.includes(v)).sort()).toEqual(["0,0", "6,6"]);
    const cells = faces.flatMap((f) => f.cells);
    expect(new Set(cells).size).toBe(cells.length);
    // every square goes to exactly one side, by where its middle falls
    expect(cells).toHaveLength(36);
  });

  it("a round-brush room follows the curve and its squares are exactly the ones whose middle lies inside", () => {
    const l = emptyLayers();
    const painted = brushDisc(l, { x: 4, y: 4, r: 3.2 }, PACK);
    const faces = findFaces(painted);
    expect(faces).toHaveLength(1);
    const { outline, cells } = faces[0];
    expect(outline.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y))).toBe(true);
    // every outline point hugs the disc, which a staircase of whole squares could not do
    for (const [x, y] of outline) expect(Math.hypot(x - 4, y - 4)).toBeGreaterThan(2.4);
    for (const [x, y] of outline) expect(Math.hypot(x - 4, y - 4)).toBeLessThan(3.6);
    const inside = (x: number, y: number): boolean => Math.hypot(x + 0.5 - 4, y + 0.5 - 4) < 3.2;
    for (const c of cells) {
      const [x, y] = c.split(",").map(Number);
      expect(inside(x, y)).toBe(true);
    }
    expect(cells.length).toBeGreaterThan(20);
  });

  // The chapel beside the vestibule: the curve runs along the vestibule's own wall for a stretch, and the two lines
  // being one line is what keeps the vestibule a room at all.
  it("a walled room whose wall a round-brush disc touches stays a room of its own", () => {
    const l = brushDisc(emptyLayers(), { x: 12.5, y: 2.5, r: 4.5 }, PACK);
    room(l, 4, 1, 4, 3);
    for (let x = 4; x < 8; x++) { wall(l, x, 1, "N"); wall(l, x, 3, "S"); }
    for (let y = 1; y < 4; y++) { wall(l, 4, y, "W"); wall(l, 7, y, "E", y === 2 ? "doorOpen" : "wall"); }
    const faces = findFaces(l);
    expect(faces).toHaveLength(2);
    const vestibule = faces.find((f) => f.cells.includes("4,1"));
    expect(vestibule?.cells).toHaveLength(12);
  });

  // No wall anywhere but the bare floor room: a stroke that starts inside it grows it, so the result is still one room,
  // closed round the new curve and the old floor edges.
  it("a round-brush stroke from inside a bare floor room grows it into one room", () => {
    const l0 = emptyLayers();
    room(l0, 2, 1, 3, 3);
    const path = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 3.5 + i * 0.8, y: 2.5, r: 2.1 }));
    const l = brushDiscs(l0, path, PACK);
    const faces = findFaces(l);
    expect(faces).toHaveLength(1);
    expect([...faces[0].cells].sort()).toEqual((Object.keys(l.floor) as string[]).sort());
    expect(Object.keys(l.floor).length).toBeGreaterThan(9);
  });

  it("a pillar erased out of a round-brush room stays a hole in it", () => {
    const disc = brushDisc(emptyLayers(), { x: 5, y: 5, r: 4.4 }, PACK);
    const l = brushDisc(disc, { x: 5, y: 5, r: 1.2 }, PACK, true);
    expect(l.floor["4,4"]).toBeUndefined();
    const cells = findFaces(l).flatMap((f) => f.cells);
    expect(cells).not.toContain("4,4");
    expect(cells).toContain("1,4");
  });

  it("a room partly bounded by an unwalled floor edge closes along that square edge", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 2);
    wall(l, 3, 0, "W"); // walled on one side only
    const [face] = findFaces(l);
    expect(simplifyLoop(face.outline)).toHaveLength(4);
    expect(face.cells).toHaveLength(6);
  });

  it("an open arch does not split a room in two, same as the flood fill would not either", () => {
    const l = emptyLayers();
    room(l, 0, 0, 4, 1);
    wall(l, 2, 0, "W", "doorOpen");
    // the arch is a wall segment like any door: it cuts, so the two halves are two rooms
    expect(asRooms(l)).toEqual(floodRooms(l));
    expect(asRooms(l)).toHaveLength(2);
  });
});

describe("simplifyLoop", () => {
  it("drops points on a straight run and out-and-back spurs", () => {
    expect(simplifyLoop([[0, 0], [1, 0], [2, 0], [2, 2], [3, 2], [2, 2], [0, 2]])).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });
});

describe("simplifyLoop on a smoothed curve", () => {
  // A circle of 200 points: a polygon this fine is the curve to the eye, and storing all of it per room is waste.
  it("keeps a round outline round while dropping most of its points", () => {
    const circle: [number, number][] = Array.from({ length: 200 }, (_, i) => [5 + 4 * Math.cos((i / 200) * Math.PI * 2), 5 + 4 * Math.sin((i / 200) * Math.PI * 2)]);
    const out = simplifyLoop(circle);
    expect(out.length).toBeLessThan(80);
    expect(out.length).toBeGreaterThan(20);
    for (const [x, y] of out) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(4, 6);
  });
});

describe("a floor edge that faces a void a wall closes off", () => {
  // A 4x4 room whose corner square (3,0) has no floor, closed by a wall from (2,0) to (4,1) that meets the lattice
  // walls at both ends. The outline must follow that wall, not the floor edge under it.
  function chamfer(angledEnd: [number, number]): DungeonMapLayers {
    const l = emptyLayers();
    room(l, 0, 0, 4, 4);
    delete l.floor[cellKey(3, 0)];
    for (const x of [0, 1]) wall(l, x, 0, "N");
    for (let x = 0; x < 4; x++) wall(l, x, 4 - 1, "S");
    for (let y = 0; y < 4; y++) wall(l, 0, y, "W");
    for (let y = 1; y < 4; y++) wall(l, 3, y, "E");
    angled(l, "chamfer", [2, 0], angledEnd);
    return l;
  }

  it("a void pocket between the floor and a wall that closes it belongs to the room, so the sliver under the wall is not cut off", () => {
    const [face] = findFaces(chamfer([4, 1]));
    expect(face.outline).toContainEqual([4, 1]);
    expect(face.outline).not.toContainEqual([3, 1]);
  });

  it("an open floor edge with no wall beyond still closes the room", () => {
    const [face] = findFaces(chamfer([3.5, 0.75]));
    expect(face.outline).toContainEqual([3, 1]);
  });

  it("a void pocket between stepped floor and a diagonal wall belongs to the room", () => {
    // Floor steps down along the line y = x (squares whose middle is below it); a wall runs the line itself.
    const l = emptyLayers();
    for (let y = 1; y < 4; y++) for (let x = 0; x < y; x++) l.floor[cellKey(x, y)] = { floor: PACK };
    for (let y = 0; y < 4; y++) wall(l, 0, y, "W");
    for (let x = 0; x < 4; x++) wall(l, x, 3, "S");
    angled(l, "diagonal", [0, 0], [4, 4]);
    const [face] = findFaces(l);
    // The outline is the wall's triangle, not the staircase of floor edges under it.
    expect(face.outline).toHaveLength(3);
    expect(face.outline).toContainEqual([4, 4]);
  });
});
