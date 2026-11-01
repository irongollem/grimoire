import { describe, it, expect } from "vitest";
import { drawMapContent } from "./drawMap";
import { cachedClippedGround } from "./clipFloor";
import type { DrawMapInput } from "./drawFrame";
import { emptyLayers, cellKey, type DungeonMapLayers, type WallEdge } from "@/types/dungeonMap.types";
import { putWall } from "./testWalls";
import { makeCtx, makeRuntime, sourceOf, type Recorder } from "./testCanvas";

const PACK = "p";
const TILE = 128;
const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

/** A 4x4 room whose north-east corner is cut by a wall from (2,0) to (4,1): the square (3,0) is crossed by it. */
function chamfered(): DungeonMapLayers {
  const l = emptyLayers();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!(x === 3 && y === 0)) l.floor[cellKey(x, y)] = { floor: ref };
  for (const x of [0, 1]) putWall(l, x, 0, "N", { ...ref, type: "wall" });
  for (let x = 0; x < 4; x++) putWall(l, x, 4, "N", { ...ref, type: "wall" });
  for (let y = 0; y < 4; y++) putWall(l, 0, y, "W", { ...ref, type: "wall" });
  for (let y = 1; y < 4; y++) putWall(l, 4, y, "W", { ...ref, type: "wall" });
  const diagonal: WallEdge = { ...ref, type: "wall", a: [2, 0], b: [4, 1] };
  l.walls["angled-1"] = diagonal;
  return l;
}

function squareRoom(): DungeonMapLayers {
  const l = emptyLayers();
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) l.floor[cellKey(x, y)] = { floor: ref };
  for (let x = 0; x < 3; x++) {
    putWall(l, x, 0, "N", { ...ref, type: "wall" });
    putWall(l, x, 3, "N", { ...ref, type: "wall" });
  }
  for (let y = 0; y < 3; y++) {
    putWall(l, 0, y, "W", { ...ref, type: "wall" });
    putWall(l, 3, y, "W", { ...ref, type: "wall" });
  }
  return l;
}

function draw(layers: DungeonMapLayers, pass: DrawMapInput["pass"] = "ground"): Recorder {
  const { ctx, rec } = makeCtx();
  drawMapContent({
    ctx,
    tilePx: TILE,
    origin: { x: 0, y: 0 },
    bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    layers,
    runtime: () => makeRuntime(PACK, { categoryCounts: { floor: 1 } }),
    defaultPackId: PACK,
    glyphs: {},
    glyphPackId: PACK,
    dressing: new Map(),
    lights: false,
    pass,
  });
  return rec;
}

const floors = (rec: Recorder) => rec.drawImages.filter((d) => sourceOf(d).category === "floor");

describe("floor clipped to an angled wall (Map Table frame 17)", () => {
  it("clips every square of a room with an angled wall, so none pokes past the wall line", () => {
    const rec = draw(chamfered());
    expect(rec.clipCount).toBe(1);
    expect(floors(rec).every((d) => d.clips === 1)).toBe(true);
  });

  it("lays the square the wall crosses, though its middle is outside and it has no floor of its own", () => {
    const rec = draw(chamfered());
    const at = floors(rec).filter((d) => d.x === 3 * TILE && d.y === 0);
    expect(at).toHaveLength(1);
  });

  it("draws each square once: the clipped room's squares are not also laid whole", () => {
    const rec = draw(chamfered());
    // 15 floor squares + the one the wall crosses.
    expect(floors(rec)).toHaveLength(16);
  });

  it("keeps a square that is wholly outside the wall bare", () => {
    const l = chamfered();
    // (3,0) is crossed, but a square beyond the wall's far end is not.
    const rec = draw(l);
    expect(floors(rec).some((d) => d.x === 4 * TILE)).toBe(false);
  });

  it("clips the same way for the ground pass a bake makes and the whole map the editor draws", () => {
    const ground = floors(draw(chamfered(), "ground")).map((d) => [d.x, d.y, d.clips]);
    const all = floors(draw(chamfered(), "all")).map((d) => [d.x, d.y, d.clips]);
    expect(all).toEqual(ground);
  });

  it("caches the clipped rooms for the same layers, so a pointer move does not re-trace them", () => {
    const l = chamfered();
    expect(cachedClippedGround(l)).toBe(cachedClippedGround(l));
    expect(cachedClippedGround({ ...l, floor: { ...l.floor } })).not.toBe(cachedClippedGround(l));
  });
});

describe("a lattice-only map", () => {
  it("draws its floor as whole squares with no clip, exactly as before", () => {
    const rec = draw(squareRoom());
    expect(rec.clipCount).toBe(0);
    const drawn = floors(rec).map((d) => [d.x, d.y, d.w, d.h]);
    const expected: number[][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expected.push([x * TILE, y * TILE, TILE, TILE]);
    expect(drawn).toEqual(expected);
  });

  it("is not traced at all", () => {
    expect(cachedClippedGround(squareRoom()).rooms).toHaveLength(0);
  });
});

/** A round room of radius 3 around (5,5): six angled walls, every node smooth, floor on the squares whose middle is inside. */
function roundRoom(smooth: boolean): DungeonMapLayers {
  const l = emptyLayers();
  const at = (i: number): [number, number] => [
    Math.round((5 + 3 * Math.cos((2 * Math.PI * i) / 6)) * 1e6) / 1e6,
    Math.round((5 + 3 * Math.sin((2 * Math.PI * i) / 6)) * 1e6) / 1e6,
  ];
  for (let i = 0; i < 6; i++) {
    l.walls[`w${i}`] = { ...ref, type: "wall", a: at(i), b: at((i + 1) % 6), ...(smooth ? { smoothA: true as const, smoothB: true as const } : {}) };
  }
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.hypot(x + 0.5 - 5, y + 0.5 - 5) < 2.8) l.floor[cellKey(x, y)] = { floor: ref };
  return l;
}

const areaOf = (poly: readonly (readonly [number, number])[]): number =>
  Math.abs(poly.reduce((sum, p, i) => sum + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)) / 2;

describe("a room walled by a curve (#1125, curved walls)", () => {
  it("clips its floor to the curve, not to the chords of the polygon through its nodes", () => {
    const round = cachedClippedGround(roundRoom(true)).rooms[0];
    const chords = cachedClippedGround(roundRoom(false)).rooms[0];
    // A regular hexagon of radius 3 is 23.4 cells, a circle of radius 3 is 28.3: the curve must enclose most of the gap (a six-node curve is not quite a circle).
    expect(areaOf(chords.outline)).toBeCloseTo(23.38, 1);
    expect(areaOf(round.outline)).toBeGreaterThan(26.5);
  });

  it("lays the floor of squares the curve cuts that the chords would have left out", () => {
    const squaresOf = (l: DungeonMapLayers): number => cachedClippedGround(l).rooms.reduce((n, r) => n + r.squares.length, 0);
    expect(squaresOf(roundRoom(true))).toBeGreaterThanOrEqual(squaresOf(roundRoom(false)));
    const rec = draw(roundRoom(true), "ground");
    expect(rec.clipCount).toBeGreaterThan(0);
  });
});
