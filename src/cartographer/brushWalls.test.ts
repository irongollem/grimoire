import { describe, it, expect } from "vitest";
import { applyBrushStroke, outlineToWalls, type BrushOptions } from "./brushWalls";
import { deriveSpaces } from "./structure";
import { detectRooms } from "./wallEdit/rooms";
import { buildGraph } from "./wallEdit/graph";
import { putWall } from "./testWalls";
import { emptyLayers, cellKey, type DungeonMapLayers, type PackRef, type WallEdge } from "@/types/dungeonMap.types";
import type { Disc } from "./area";

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };
const WALL = { type: "wall" as const, ...PACK };
let n = 0;
const opts = (erase = false): BrushOptions => ({ erase, pack: PACK, wall: PACK, newKey: () => `w${n++}` });

/** A walled rectangle room [x0,x1) x [y0,y1) of lattice walls with floor inside. */
function room(layers: DungeonMapLayers, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) layers.floor[cellKey(x, y)] = { floor: PACK };
  for (let x = x0; x < x1; x++) {
    putWall(layers, x, y0, "N", WALL);
    putWall(layers, x, y1, "N", WALL);
  }
  for (let y = y0; y < y1; y++) {
    putWall(layers, x0, y, "W", WALL);
    putWall(layers, x1, y, "W", WALL);
  }
}
const stroke = (...c: [number, number, number][]): { discs: Disc[] } => ({ discs: c.map(([x, y, r]) => ({ x, y, r })) });
/** Discs every 0.25 squares along a horizontal drag, as the editor lays them down. */
const drag = (x0: number, x1: number, y: number, r: number): { discs: Disc[] } =>
  stroke(...Array.from({ length: Math.round((x1 - x0) / 0.25) + 1 }, (_, i): [number, number, number] => [x0 + i * 0.25, y, r]));
const angled = (l: DungeonMapLayers): WallEdge[] => Object.entries(l.walls).filter(([k]) => !k.includes(":")).map(([, w]) => w);
const circle = (r: number, cx = 0, cy = 0, count = 200): [number, number][] =>
  Array.from({ length: count }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / count), cy + r * Math.sin((2 * Math.PI * i) / count)]);

describe("outlineToWalls", () => {
  it("a circle of radius 4 comes out as a closed run of 8-25 smooth nodes, not hundreds", () => {
    const walls = Object.values(outlineToWalls(circle(4), opts()));
    expect(walls.length).toBeGreaterThanOrEqual(8);
    expect(walls.length).toBeLessThanOrEqual(25);
    expect(walls.every((w) => w.smoothA && w.smoothB)).toBe(true);
    // closed: every end is some wall's start
    const starts = new Set(walls.map((w) => w.a.join()));
    expect(walls.every((w) => starts.has(w.b.join()))).toBe(true);
  });

  it("a square turns sharply, so its corners are not smooth", () => {
    const sq: [number, number][] = [[0, 0], [3, 0], [3, 3], [0, 3]];
    const walls = Object.values(outlineToWalls(sq, opts()));
    expect(walls).toHaveLength(4);
    expect(walls.some((w) => w.smoothA || w.smoothB)).toBe(false);
  });
});

describe("applyBrushStroke", () => {
  it("a stroke inside a room grows it and the room's wall moves out to the new edge", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 3);
    const next = applyBrushStroke(l, drag(2.5, 4.5, 1.5, 0.5), opts());
    expect(next).not.toBe(l);
    // old east wall is gone, new floor lies east of it
    expect(next.walls["3,1:W"]).toBeUndefined();
    expect(next.floor[cellKey(3, 1)]?.floor).toBeDefined();
    expect(next.floor[cellKey(4, 1)]?.floor).toBeDefined();
    // the walls alone close one room: the old square plus the bump
    expect(detectRooms(buildGraph(next.walls))).toHaveLength(1);
    // ...and the room is found from the layers too: a bare floor edge lying on an axis-aligned angled wall must not
    // double the line the face walk follows, or the closed loop yields no face (roomOutline.ts weld).
    expect(deriveSpaces(next)).toHaveLength(1);
    expect(angled(next).length).toBeGreaterThan(0);
  });

  it("a stroke never crosses another room's wall, and the dividing wall survives", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 3);
    room(l, 3, 0, 6, 3); // shares the wall at x=3
    const next = applyBrushStroke(l, drag(2.5, 4.5, 1.5, 0.5), opts());
    expect(next.walls["3,1:W"]).toBeDefined();
    expect(next.floor[cellKey(3, 1)]?.floor).toBeDefined(); // the neighbour's own floor, untouched
    expect(deriveSpaces(next)).toHaveLength(2);
  });

  it("a stroke stops at a free-standing wall even with no room beyond it", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 3);
    for (let y = 0; y < 3; y++) putWall(l, 4, y, "W", WALL);
    const next = applyBrushStroke(l, drag(2.5, 5.5, 1.5, 0.5), opts());
    expect(next.walls["4,1:W"]).toBeDefined();
    expect(next.floor[cellKey(3, 1)]?.floor).toBeDefined();
    expect(next.floor[cellKey(4, 1)]).toBeUndefined();
  });

  it("Alt carves floor out and the room's wall follows the new edge", () => {
    const l = emptyLayers();
    room(l, 0, 0, 5, 5);
    const next = applyBrushStroke(l, stroke([2.5, 2.5, 0.9]), opts(true));
    expect(next.floor[cellKey(2, 2)]).toBeUndefined();
    expect(next.floor[cellKey(0, 0)]?.floor).toBeDefined();
    // the carved hole is walled: smooth angled walls appear
    expect(angled(next).length).toBeGreaterThan(3);
    expect(angled(next).some((w) => w.smoothA)).toBe(true);
  });

  it("a stroke on empty ground makes a closed smooth room with floor under it", () => {
    const l = emptyLayers();
    const next = applyBrushStroke(l, stroke([10, 10, 3]), opts());
    const walls = angled(next);
    expect(walls.length).toBeGreaterThanOrEqual(8);
    expect(walls.length).toBeLessThanOrEqual(25);
    expect(walls.every((w) => w.smoothA && w.smoothB)).toBe(true);
    expect(next.floor[cellKey(10, 10)]?.floor).toBeDefined();
    expect(next.floor[cellKey(10, 14)]).toBeUndefined();
    expect(deriveSpaces(next)).toHaveLength(1);
  });

  it("an erase that starts on empty ground changes nothing", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 3);
    expect(applyBrushStroke(l, stroke([8, 8, 1]), opts(true))).toBe(l);
  });

  it("a stroke that adds nothing returns the same layers", () => {
    const l = emptyLayers();
    room(l, 0, 0, 5, 5);
    expect(applyBrushStroke(l, stroke([2.5, 2.5, 0.5]), opts())).toBe(l);
  });

  it("a door on the room's wall that the stroke did not move stays", () => {
    const l = emptyLayers();
    room(l, 0, 0, 3, 3);
    putWall(l, 0, 1, "N", { type: "doorClosed", ...PACK });
    const next = applyBrushStroke(l, drag(2.5, 4.5, 1.5, 0.5), opts());
    expect(Object.values(next.walls).some((w) => w.type === "doorClosed")).toBe(true);
  });

  it("a door on a stretch the stroke carved away goes with its wall", () => {
    const l = emptyLayers();
    room(l, 0, 0, 5, 5);
    putWall(l, 4, 2, "W", { type: "doorClosed", ...PACK }); // east wall... x=4 is interior, so use the boundary
    delete l.walls["4,2:W"];
    putWall(l, 5, 2, "W", { type: "doorClosed", ...PACK });
    const next = applyBrushStroke(l, stroke([4.5, 2.5, 0.6], [4.5, 2.5, 1.6]), opts(true));
    expect(Object.values(next.walls).some((w) => w.type === "doorClosed")).toBe(false);
  });

  it("Alt carving acts on the first room the stroke's path enters, even when it begins in an already carved gap", () => {
    const l = emptyLayers();
    room(l, 0, 0, 5, 3);
    const gap = applyBrushStroke(l, stroke([0.5, 1.5, 0.6]), opts(true));
    expect(gap.floor[cellKey(0, 1)]).toBeUndefined();
    const cut = applyBrushStroke(gap, stroke([0.5, 1.5, 0.6], [2.5, 1.5, 0.6], [4.5, 1.5, 0.6]), opts(true));
    expect(cut.floor[cellKey(2, 1)]).toBeUndefined();
    expect(cut.floor[cellKey(2, 0)]?.floor).toBeDefined();
  });
});
