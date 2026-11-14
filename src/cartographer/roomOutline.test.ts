import { describe, expect, it } from "vitest";
import type { CellKey, DungeonMapLayers, EdgeSegType, PackRef, WallEdge } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import { brushDisc, brushDiscs } from "@/test/brushDisc";
import { canonicaliseEdge, type Side } from "./edges";
import { findFaces, simplifyLoop } from "./roomOutline";
import { deriveSpaces } from "./structure";
import { putWall } from "./testWalls";
import { wallAt } from "./wallGraph";
import { applyBrushStroke, paintGroundCells } from "./groundRegions";

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };

function emptyLayers(): DungeonMapLayers {
  return { ground: {}, floor: {}, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {}, walls: {}, lights: {} };
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

  it("a round-brush room with explicit perimeter walls follows the curve and its squares are exactly the ones whose middle lies inside", () => {
    const l = emptyLayers();
    let key = 0;
    const painted = applyBrushStroke(l, { discs: [{ x: 4, y: 4, r: 3.2 }] }, {
      pack: PACK, wall: PACK, erase: false, walls: "visible", newKey: () => `room-${key++}`,
    });
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
    let key = 0;
    const l = applyBrushStroke(disc, { discs: [{ x: 5, y: 5, r: 1.2 }] }, {
      pack: PACK, wall: PACK, erase: true, targetId: Object.keys(disc.ground)[0], newKey: () => `cut-${key++}`,
    });
    expect(l.floor["4,4"]).toBeUndefined();
    const cells = findFaces(l).flatMap((f) => f.cells);
    expect(cells).not.toContain("4,4");
    expect(cells).toContain("1,4");
  });

  // Maintainer, 14 Nov 2026: "even hand drawn maps convert the paint strokes into squares". A floor brushed with
  // Walls: None has no wall to follow, and its room used to close along the edges of its squares.
  describe("an unwalled floor's room follows the painted shape, not its squares", () => {
    let key = 0;
    const brush = (l: DungeonMapLayers, x: number, y: number, r: number, over: { category?: "floor" | "terrainWater" } = {}): DungeonMapLayers =>
      applyBrushStroke(l, { discs: [{ x, y, r }] }, { pack: PACK, wall: PACK, erase: false, walls: "none", newKey: () => `g-${key++}`, ...over });
    const offDisc = (outline: readonly (readonly [number, number])[], x: number, y: number): number[] =>
      outline.map(([px, py]) => Math.hypot(px - x, py - y));

    it("a round floor with no walls is a round room", () => {
      const l = brush(emptyLayers(), 4, 4, 3.2);
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      // Every outline point hugs the disc. The staircase of its squares has corners about 2.5 and 3.8 from the middle.
      for (const d of offDisc(faces[0].outline, 4, 4)) {
        expect(d).toBeGreaterThan(3.0);
        expect(d).toBeLessThan(3.4);
      }
      // The squares underneath are still exactly the floor: fog, footprints and the room's signature do not move.
      expect([...faces[0].cells].sort()).toEqual(Object.keys(l.floor).sort());
    });

    it("two floors that do not touch are two rooms, even where their squares are neighbours", () => {
      // The discs end at x = 3.6 and start at x = 3.7, but squares (3,1) and (4,1) each have their middle on one.
      const l = brush(brush(emptyLayers(), 2, 2, 1.6), 5.3, 2, 1.6);
      expect(l.floor["3,1"]).toBeDefined();
      expect(l.floor["4,1"]).toBeDefined();
      const faces = findFaces(l);
      expect(faces).toHaveLength(2);
      expect(faces.flatMap((f) => f.cells)).toHaveLength(Object.keys(l.floor).length);
    });

    it("water painted inside a floor does not cut the room along its shore", () => {
      const land = brush(emptyLayers(), 6, 6, 5);
      const l = brush(land, 6, 6, 1.6, { category: "terrainWater" });
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(Object.keys(l.floor).length);
      for (const d of offDisc(faces[0].outline, 6, 6)) expect(d).toBeGreaterThan(4.5);
    });

    it("two floors painted over each other are one room round the outside of both", () => {
      const l = brush(brush(emptyLayers(), 4, 4, 3), 8, 4, 3);
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(Object.keys(l.floor).length);
      // No outline point lies inside either disc: the buried arcs between x = 5 and x = 7 are gone.
      for (const [x, y] of faces[0].outline) {
        expect(Math.hypot(x - 4, y - 4)).toBeGreaterThan(2.8);
        expect(Math.hypot(x - 8, y - 4)).toBeGreaterThan(2.8);
      }
    });

    it("two square floors laid side by side, one longer than the other, are one room with no line between them", () => {
      const cells = rect;
      // A 5 x 2 floor above a 3 x 2 floor: their shared line runs x = 1..4 of the upper floor's x = 0..5.
      const l = paintGroundCells(paintGroundCells(emptyLayers(), cells(0, 0, 5, 2), PACK), cells(1, 2, 3, 2), { ...PACK, pack_id: "q" });
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(16);
      // The T's eight corners, and nothing on the line the two floors share.
      expect(simplifyLoop(faces[0].outline).map(([x, y]) => `${x},${y}`).sort()).toEqual(["0,0", "0,2", "1,2", "1,4", "4,2", "4,4", "5,0", "5,2"]);
    });

    const rect = (x0: number, y0: number, w: number, h: number): Set<CellKey> => {
      const out = new Set<CellKey>();
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.add(cellKey(x, y));
      return out;
    };

    it.each([
      ["a round floor", (): DungeonMapLayers => brush(emptyLayers(), 5, 5, 4.3)],
      ["a square floor", (): DungeonMapLayers => paintGroundCells(emptyLayers(), rect(1, 1, 9, 9), PACK)],
    ])("a run of solid blocks across %s still makes two rooms of it", (_name, make) => {
      const l = make();
      for (let y = 0; y < 11; y++) l.solidBlock[cellKey(5, y)] = { ...PACK };
      const faces = findFaces(l);
      expect(faces).toHaveLength(2);
      // One room each side of the column x = 5, and no square of the column in either.
      const sides = faces.map((f) => new Set(f.cells.map((c) => Math.sign(Number(c.split(",")[0]) - 5))));
      expect(sides.map((s) => [...s]).sort()).toEqual([[-1], [1]]);
    });

    it("the same floor painted twice is still one room", () => {
      const l = paintGroundCells(paintGroundCells(emptyLayers(), rect(0, 0, 3, 2), PACK), rect(0, 0, 3, 2), PACK);
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(simplifyLoop(faces[0].outline)).toHaveLength(4);
    });

    // Shapes whose sides are one long line each (a fitted straight stroke), not a run of square edges: the stretch
    // two of them share has to be judged apart from the rest of the longer line, whichever was painted first.
    it.each([["under", "a", "b"], ["over", "b", "a"]])("a short floor laid along part of a long one's side (painted %s it) leaves one room", (_name, wide, narrow) => {
      const box = (x0: number, y0: number, x1: number, y1: number): Record<string, WallEdge> => ({
        n: { ...PACK, type: "wall", a: [x0, y0], b: [x1, y0] },
        e: { ...PACK, type: "wall", a: [x1, y0], b: [x1, y1] },
        s: { ...PACK, type: "wall", a: [x1, y1], b: [x0, y1] },
        w: { ...PACK, type: "wall", a: [x0, y1], b: [x0, y0] },
      });
      const shape = (boundary: Record<string, WallEdge>, z: number) => ({
        name: "floor", material: PACK, category: "floor" as const, z, boundary, variants: {},
        walls: { mode: "none" as const, material: PACK, ids: [], segments: {}, excluded: [] },
      });
      const l = emptyLayers();
      l.ground[wide] = shape(box(0, 0, 4, 2), 0);
      l.ground[narrow] = shape(box(1, 2, 3, 4), 1);
      room(l, 0, 0, 4, 2);
      room(l, 1, 2, 2, 2);
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(12);
    });

    it("a grid wall on one square of a long straight floor side is that side's line there, and the room still closes", () => {
      const l = emptyLayers();
      l.ground.a = {
        name: "floor", material: PACK, category: "floor", z: 0, variants: {},
        boundary: {
          n: { ...PACK, type: "wall", a: [0, 0], b: [4, 0] },
          e: { ...PACK, type: "wall", a: [4, 0], b: [4, 2] },
          s: { ...PACK, type: "wall", a: [4, 2], b: [0, 2] },
          w: { ...PACK, type: "wall", a: [0, 2], b: [0, 0] },
        },
        walls: { mode: "none", material: PACK, ids: [], segments: {}, excluded: [] },
      };
      room(l, 0, 0, 4, 2);
      wall(l, 1, 0, "N");
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(8);
    });

    it("a wall along part of a square floor's side is that side's line there, and the room still closes", () => {
      const l = paintGroundCells(emptyLayers(), rect(0, 0, 3, 2), PACK);
      angled(l, "half", [0.5, 0], [2.5, 0]);
      const faces = findFaces(l);
      expect(faces).toHaveLength(1);
      expect(faces[0].cells).toHaveLength(6);
    });

    it("a void pocket between a painted floor and a wall that closes it belongs to the room", () => {
      // The chamfered room below, with its floor painted as a shape: the outline follows the wall across the missing
      // corner square, not the floor's own edge under it.
      const cells = rect(0, 0, 4, 4);
      cells.delete(cellKey(3, 0));
      const l = paintGroundCells(emptyLayers(), cells, PACK);
      for (const x of [0, 1]) wall(l, x, 0, "N");
      for (let x = 0; x < 4; x++) wall(l, x, 3, "S");
      for (let y = 0; y < 4; y++) wall(l, 0, y, "W");
      for (let y = 1; y < 4; y++) wall(l, 3, y, "E");
      angled(l, "chamfer", [2, 0], [4, 1]);
      const [face] = findFaces(l);
      expect(face.outline).toContainEqual([4, 1]);
      expect(face.outline).not.toContainEqual([3, 1]);
    });
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
