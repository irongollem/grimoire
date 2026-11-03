import { describe, expect, it } from "vitest";
import { emptyLayers, type GroundRegion, type PackRef } from "@/types/dungeonMap.types";
import { applyGroundStroke, cellBoundary, convertCellGround, eraseGroundCells, groundLoops, paintGroundCells, projectGround, putGroundRegion, removeGroundRegion, setGroundWalls } from "./groundRegions";
import { deriveSpaces } from "./structure";
import { cachedWallGeometry } from "./wallGeometry";
import { moveNode } from "./wallEdit/edit";

const SAND: PackRef = { pack_id: "sand", pack_version: 1, variant: 0 };
const WATER: PackRef = { pack_id: "water", pack_version: 2, variant: 0 };
let serial = 0;
const key = () => `ground-test-${serial++}`;
const brush = (pack = SAND) => ({ pack, wall: pack, erase: false, newKey: key });
const discs = [{ x: 5, y: 5, r: 1.6 }];
const desert = () => applyGroundStroke(emptyLayers(), [{ x: 5, y: 5, r: 5 }], brush());
const top = (layers: ReturnType<typeof emptyLayers>): [string, GroundRegion] => Object.entries(layers.ground).sort(([, a], [, b]) => b.z - a.z)[0];

describe("editable ground source", () => {
  it("paints an independent water oasis inside desert without a wall or extra dungeon room", () => {
    const sand = desert();
    const water = applyGroundStroke(sand, discs, { ...brush(WATER), category: "terrainWater" });
    expect(Object.keys(water.ground)).toHaveLength(2);
    expect(water.walls).toBe(sand.walls);
    expect(water.floor["5,5"]?.floor).toEqual(SAND);
    expect(water.terrain["5,5"]).toEqual(WATER);
    expect(water.terrain["1,5"]).toBeUndefined();
    expect(deriveSpaces(water)).toHaveLength(1);
    expect(sand.ground).toEqual({ [Object.keys(sand.ground)[0]]: Object.values(sand.ground)[0] });
  });

  it("shrinking an overlay reveals the untouched material below", () => {
    const sand = desert();
    const original = Object.values(sand.ground)[0];
    const water = applyGroundStroke(sand, discs, brush(WATER));
    const [id] = top(water);
    const smaller = applyGroundStroke(water, [{ x: 5.5, y: 5.5, r: 0.8 }], { ...brush(SAND), erase: true, targetId: id });
    expect(smaller.floor["5,5"]?.floor).toEqual(SAND);
    expect(Object.values(smaller.ground).find((r) => r.material.pack_id === "sand")).toBe(original);
    expect(removeGroundRegion(water, id).floor).toEqual(sand.floor);
  });

  it("extends only the explicit region and retains its material despite the active pack", () => {
    const sand = desert();
    const water = applyGroundStroke(sand, discs, brush(WATER));
    const [id, before] = top(water);
    const extended = applyGroundStroke(water, [{ x: 7, y: 5, r: 1.5 }], { ...brush(SAND), mode: "extend", targetId: id });
    expect(Object.keys(extended.ground)).toHaveLength(2);
    expect(extended.ground[id].material).toEqual(before.material);
    expect(extended.floor["7,5"]?.floor).toEqual(WATER);
    expect(extended.ground[Object.keys(sand.ground)[0]]).toBe(Object.values(sand.ground)[0]);
    expect(applyGroundStroke(water, discs, { ...brush(), mode: "extend" })).toBe(water);
    expect(applyGroundStroke(water, discs, { ...brush(), erase: true })).toBe(water);
  });

  it("keeps physical walls independent, including hidden blocking attachments and unrelated materials", () => {
    const base = desert();
    base.walls.free = { type: "wall", ...WATER, a: [20, 0], b: [20, 5] };
    const id = Object.keys(base.ground)[0];
    const visible = setGroundWalls(base, id, "visible");
    const wallIds = visible.ground[id].walls.ids;
    expect(wallIds.length).toBeGreaterThan(0);
    const unrelatedPaint = applyGroundStroke(visible, [{ x: 30, y: 30, r: 2 }], brush(WATER));
    expect(unrelatedPaint.walls).toBe(visible.walls);
    const hidden = setGroundWalls(unrelatedPaint, id, "hidden");
    expect(hidden.ground[id].walls.ids.every((k) => hidden.walls[k].visible === false)).toBe(true);
    expect(hidden.walls.free).toBe(base.walls.free);
    const none = setGroundWalls(hidden, id, "none");
    expect(Object.keys(none.walls)).toEqual(["free"]);
  });

  it("does not resurrect a deleted attachment or erase a fitted door during unrelated projection", () => {
    const base = desert();
    const id = Object.keys(base.ground)[0];
    const walled = setGroundWalls(base, id, "visible");
    const [deleted, door] = walled.ground[id].walls.ids;
    delete walled.walls[deleted];
    walled.walls[door] = { ...walled.walls[door], type: "doorClosed" };
    const walls = walled.walls;
    const next = applyGroundStroke(walled, discs, brush(WATER));
    expect(next.walls).toBe(walls);
    expect(next.walls[deleted]).toBeUndefined();
    expect(next.walls[door].type).toBe("doorClosed");
  });

  it("shares the smooth geometry when a boundary node moves and reveals underpaint", () => {
    const sand = desert();
    const water = applyGroundStroke(sand, discs, brush(WATER));
    const [id, region] = top(water);
    const edge = Object.values(region.boundary)[0];
    const moved = moveNode(region.boundary, edge.a.join(","), [edge.a[0] + 1, edge.a[1]], { newKey: key });
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error("Node edit refused");
    const next = putGroundRegion(water, id, { ...region, boundary: moved.walls, walls: { ...region.walls } });
    expect(groundLoops(next.ground[id])).not.toEqual(groundLoops(region));
    expect(next.walls).toBe(water.walls);
    expect(projectGround(next).floor).toEqual(next.floor);
  });

  it("converts contiguous cells as one surface despite random variants, preserving holes and all other layers", () => {
    const layers = emptyLayers();
    layers.floor["0,0"] = { floor: { ...SAND, variant: 1 } };
    layers.floor["1,0"] = { floor: { ...SAND, variant: 8 } };
    layers.floor["1,1"] = { floor: { ...SAND, variant: 3 } };
    const converted = convertCellGround(layers, key);
    expect(Object.values(converted.ground)).toHaveLength(1);
    expect(projectGround(converted).floor).toEqual(layers.floor);
    expect(converted.walls).toBe(layers.walls);
    expect(converted.object).toBe(layers.object);
    expect(converted.annotation).toBe(layers.annotation);
  });

  it("converts an old smooth room without changing its curve and adopts the original perimeter", () => {
    const drawn = applyGroundStroke(emptyLayers(), [{ x: 5, y: 5, r: 4 }], { ...brush(), walls: "visible" });
    drawn.walls.partition = { type: "wall", ...WATER, a: [4, 4], b: [6, 4] };
    const original = Object.values(drawn.ground)[0];
    const old = { ...drawn, ground: {} };
    const converted = convertCellGround(old, key);
    const region = Object.values(converted.ground)[0];
    expect(groundLoops(region)).toEqual(groundLoops(original));
    expect(Object.values(region.boundary).every((edge) => edge.smoothA && edge.smoothB)).toBe(true);
    expect(region.walls.ids.sort()).toEqual(original.walls.ids.sort());
    expect(region.walls.ids).not.toContain("partition");
    expect(converted.walls).toBe(drawn.walls);
    const edge = Object.values(region.boundary)[0];
    const moved = moveNode(region.boundary, edge.a.join(","), [edge.a[0] + 0.5, edge.a[1]], { newKey: key });
    if (!moved.ok) throw new Error("Converted node did not move");
    const id = Object.keys(converted.ground)[0];
    const edited = putGroundRegion(converted, id, { ...region, boundary: moved.walls, walls: { ...region.walls } }, key);
    expect(edited.walls.partition).toBe(drawn.walls.partition);
    const attached = Object.fromEntries(edited.ground[id].walls.ids.map((k) => [k, edited.walls[k]]));
    const actual = [...cachedWallGeometry(attached).lines.values()].flatMap((line) => line.pieces.map((p) => [p.a, p.b]));
    const virtual = [...cachedWallGeometry(edited.ground[id].boundary).lines.values()].flatMap((line) => line.pieces.map((p) => [p.a, p.b]));
    expect(actual).toEqual(virtual);
  });

  it("fits a legacy incomplete curved perimeter to editable controls while preserving every saved cell", () => {
    const drawn = applyGroundStroke(emptyLayers(), [{ x: 5, y: 5, r: 4 }], { ...brush(), walls: "visible" });
    delete drawn.walls[Object.keys(drawn.walls)[0]];
    const migrated = convertCellGround({ ...drawn, ground: {} }, key);
    expect(projectGround(migrated).floor).toEqual(drawn.floor);
    const region = Object.values(migrated.ground)[0];
    expect(groundLoops(region)).toHaveLength(1);
    expect(Object.keys(region.boundary).length).toBeLessThan(100);
    expect(Object.values(region.boundary).some((edge) => edge.smoothA || edge.smoothB)).toBe(true);
  });

  it("preserves exact source and attachment identity when Extend adds nothing or Alt misses", () => {
    const layers = applyGroundStroke(emptyLayers(), [{ x: 5, y: 5, r: 4 }], { ...brush(), walls: "visible" });
    const id = Object.keys(layers.ground)[0];
    expect(applyGroundStroke(layers, [{ x: 5, y: 5, r: 1 }], { ...brush(WATER), mode: "extend", targetId: id })).toBe(layers);
    expect(applyGroundStroke(layers, [{ x: 20, y: 20, r: 1 }], { ...brush(), erase: true, targetId: id })).toBe(layers);
  });

  it("square erasure keeps remote curved boundary smooth and a hole reveals underpaint", () => {
    const sand = desert();
    const water = applyGroundStroke(sand, [{ x: 5, y: 5, r: 3 }], brush(WATER));
    const next = eraseGroundCells(water, new Set(["5,5"]), "floor");
    // The explicit eraser removes all floor sources at the selected square, while remote curves stay vectors.
    expect(next.floor["5,5"]).toBeUndefined();
    expect(Object.values(next.ground).every((region) => Object.values(region.boundary).some((edge) => edge.smoothA || edge.smoothB))).toBe(true);
    const [id] = top(water);
    const hole = applyGroundStroke(water, [{ x: 5.5, y: 5.5, r: 0.7 }], { ...brush(), targetId: id, erase: true });
    expect(hole.floor["5,5"]?.floor).toEqual(SAND);
    expect(groundLoops(hole.ground[id])).toHaveLength(2);
  });

  it("floor-only Extend keeps physical walls put and With walls explicitly creates/follows attachments", () => {
    const bare = desert(); const id = Object.keys(bare.ground)[0];
    const made = applyGroundStroke(bare, [{ x: 5, y: 5, r: 1 }], { ...brush(), mode: "extend", targetId: id, walls: "visible" });
    expect(made.ground[id].walls.ids.length).toBeGreaterThan(0);
    const untouchedWalls = made.walls;
    const floorOnly = applyGroundStroke(made, [{ x: 10, y: 5, r: 2 }], { ...brush(), mode: "extend", targetId: id, walls: "none" });
    expect(floorOnly.walls).toBe(untouchedWalls);
    expect(floorOnly.ground[id].walls.ids.length).toBeLessThan(made.ground[id].walls.ids.length);
    const followed = applyGroundStroke(made, [{ x: 10, y: 5, r: 2 }], { ...brush(), mode: "extend", targetId: id, walls: "visible" });
    expect(followed.walls).not.toEqual(untouchedWalls);
    const erased = applyGroundStroke(made, [{ x: 5, y: 5, r: 30 }], { ...brush(), erase: true, targetId: id, walls: "none" });
    expect(Object.keys(erased.ground)).toHaveLength(0);
    expect(erased.walls).toBe(untouchedWalls);
  });

  it("converts adjacent same-pack rooms with one shared-door owner and never duplicates that boundary", () => {
    const left = paintGroundCells(emptyLayers(), new Set(["0,0", "1,0", "0,1", "1,1"]), SAND, "floor", "visible");
    const both = paintGroundCells(left, new Set(["2,0", "3,0", "2,1", "3,1"]), SAND, "floor", "visible");
    both.walls["2,0:W"] = { ...both.walls["2,0:W"], type: "doorClosed", ...WATER };
    const door = both.walls["2,0:W"];
    const converted = convertCellGround({ ...both, ground: {} }, key);
    expect(Object.values(converted.ground)).toHaveLength(2);
    const owned = Object.values(converted.ground).flatMap((r) => r.walls.ids);
    expect(new Set(owned).size).toBe(owned.length);
    const right = Object.entries(converted.ground).find(([, r]) => r.variants["3,0"] !== undefined)!;
    const next = applyGroundStroke(converted, [{ x: 4, y: 1, r: 1 }], { ...brush(WATER), mode: "extend", targetId: right[0], walls: "visible" });
    expect(next.walls["2,0:W"]).toBe(door);
    expect(Object.values(next.walls).filter((w) => w.type === "doorClosed")).toHaveLength(1);
    expect(Object.values(next.walls).filter((w) => (w.a[0] === 2 && w.b[0] === 2 && Math.min(w.a[1], w.b[1]) < 1))).toHaveLength(1);
    expect(Object.entries(next.ground).find(([id]) => id !== right[0])?.[1]).toBe(Object.entries(converted.ground).find(([id]) => id !== right[0])?.[1]);
  });

  it("keeps deleted stretches and mixed wall materials local while another boundary stretch grows", () => {
    const cells = new Set<`${number},${number}`>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) cells.add(`${x},${y}`);
    const made = paintGroundCells(emptyLayers(), cells, SAND, "floor", "visible");
    made.walls["1,0:N"] = { ...made.walls["1,0:N"], ...WATER };
    const converted = convertCellGround({ ...made, ground: {} }, key);
    const id = Object.keys(converted.ground)[0];
    delete converted.walls["2,0:N"];
    const next = applyGroundStroke(converted, [{ x: 5, y: 2, r: 1.5 }], { ...brush(), mode: "extend", targetId: id, walls: "visible" });
    const top = Object.values(next.walls).filter((w) => w.a[1] === 0 && w.b[1] === 0);
    const at = (x: number) => top.filter((w) => Math.min(w.a[0], w.b[0]) < x && Math.max(w.a[0], w.b[0]) > x);
    expect(at(1.5).map((w) => w.pack_id)).toEqual(["water"]);
    expect(at(0.5).map((w) => w.pack_id)).toEqual(["sand"]);
    expect(at(2.5)).toHaveLength(0);
  });

  it("preserves sparse interior holes in a converted physical room", () => {
    const cells = new Set<`${number},${number}`>();
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.add(`${x},${y}`);
    const room = paintGroundCells(emptyLayers(), cells, SAND, "floor", "visible");
    delete room.floor["1,1"];
    const migrated = convertCellGround({ ...room, ground: {} }, key);
    expect(projectGround(migrated).floor).toEqual(room.floor);
    expect(groundLoops(Object.values(migrated.ground)[0])).toHaveLength(2);
  });

  it("cell tools create editable source regions and erasing terrain reveals the floor", () => {
    const sand = paintGroundCells(emptyLayers(), new Set(["0,0", "1,0"]), SAND);
    const water = paintGroundCells(sand, new Set(["0,0"]), WATER, "terrainWater");
    const erased = eraseGroundCells(water, new Set(["0,0"]), "terrainWater");
    expect(erased.terrain["0,0"]).toBeUndefined();
    expect(erased.floor["0,0"]?.floor).toEqual(SAND);
    expect(Object.values(sand.ground)[0].boundary).toEqual(cellBoundary(new Set(["0,0", "1,0"]), SAND));
  });
});
