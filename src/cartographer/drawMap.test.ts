import { describe, it, expect } from "vitest";
import { putWall } from "./testWalls";
import { applyGroundStroke, convertCellGround, groundLoops, orderedGround } from "./groundRegions";
import { drawMapContent, renderShadowLayer, variantAt } from "./drawMap";
import type { DrawMapInput } from "./drawFrame";
import { emptyLayers, cellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { DressingCatalog, DressingProp } from "./dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { makeCtx, makeLayerFactory, makeRuntime, sourceOf, type Recorder } from "./testCanvas";

const PACK = "p";

// Fixture ingestion is one-time, just as saved rows convert once before rendering. The same source identity must
// survive hover/pan renders so these tests still exercise the renderer's real caches.
const sourceFixtures = new WeakMap<DungeonMapLayers, DungeonMapLayers>();
function sourceLayers(layers: DungeonMapLayers): DungeonMapLayers {
  if (Object.keys(layers.ground).length > 0) return layers;
  const existing = sourceFixtures.get(layers);
  if (existing) return existing;
  let id = 0;
  const converted = convertCellGround(layers, () => `fixture-${id++}`);
  sourceFixtures.set(layers, converted);
  return converted;
}

function input(
  rt: TilePackRuntime | null,
  overrides: Partial<DrawMapInput> = {},
): { input: DrawMapInput; rec: Recorder } {
  const { ctx, rec } = makeCtx();
  return {
    rec,
    input: {
      ctx,
      tilePx: 128,
      origin: { x: 0, y: 0 },
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      runtime: () => rt,
      defaultPackId: PACK,
      glyphs: {},
      glyphPackId: PACK,
      dressing: new Map(),
      lights: false,
      ...overrides,
      // Saved cell fixtures cross the same one-time source boundary as persisted maps.
      layers: sourceLayers(overrides.layers ?? emptyLayers()),
    },
  };
}

const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

describe("drawMapContent", () => {
  it("clips desert and its offset water oasis to their exact sampled curves, independently of projected cells", () => {
    let serial = 0;
    const newKey = () => `smooth-${serial++}`;
    const sand = applyGroundStroke(emptyLayers(), [{ x: 3, y: 3, r: 2.5 }], { pack: ref, wall: ref, erase: false, newKey });
    const oasis = { pack_id: "oasis", pack_version: 1, variant: 0 };
    const layers = applyGroundStroke(sand, [{ x: 3.2, y: 2.7, r: 0.8 }], { pack: oasis, wall: oasis, category: "terrainWater", erase: false, newKey });
    // These cells serve gameplay; removing this derived cache cannot change the authored material geometry.
    layers.floor = {};
    layers.terrain = {};
    const sandRuntime = makeRuntime(PACK);
    const waterRuntime = makeRuntime("oasis", { categoryCounts: { terrainWater: 1 } });
    const origin = { x: 64, y: 32 };
    const { input: i, rec } = input(sandRuntime, { layers, origin, runtime: (id) => id === "oasis" ? waterRuntime : sandRuntime });
    drawMapContent(i);
    const loops = orderedGround(layers).flatMap(([, region]) => groundLoops(region));
    expect(loops.some((loop) => loop.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y)))).toBe(true);
    expect(rec.points).toEqual(loops.flatMap((loop) => loop.map(([x, y]) => [x * 128 - origin.x, y * 128 - origin.y])));
    expect(rec.clipCount).toBe(2);
    expect(rec.drawImages.every((draw) => draw.clips > 0)).toBe(true);
    expect(cats(rec)).toEqual(expect.arrayContaining(["floor", "terrainWater"]));
    expect(cats(rec).filter((category) => category?.startsWith("wall") || category?.startsWith("curb"))).toEqual([]);
    expect(layers.walls).toEqual({});
  });

  it("translates cells by the origin", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: ref };
    const { input: i, rec } = input(makeRuntime(PACK), { layers, origin: { x: 64, y: 0 } });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(1);
    expect(rec.drawImages[0]).toMatchObject({ x: 192, y: 384, w: 128, h: 128 });
  });

  it("culls cells outside the bounds", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 2)] = { floor: ref };
    layers.floor[cellKey(9, 9)] = { floor: ref };
    layers.object[cellKey(-3, 0)] = { pack_id: PACK, pack_version: 1, category: "chest", variant: 0 } as never;
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(1);
  });

  it("skips a layer whose pack resolves to no runtime", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    const { input: i, rec } = input(null, { layers });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(0);
  });

  it("draws layers in order and runs the hooks in their slots", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    putWall(layers, 1, 1, "W", { ...ref, type: "wall" });
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "chest", variant: 0 } as never;
    layers.dressing.a = { prop_id: "table", x: 3, y: 3, rotation: 0, z: 0 };
    const catalog: DressingCatalog = new Map([
      ["table", { id: "table", name: "T", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null }],
    ]);
    const events: string[] = [];
    const { input: i, rec } = input(makeRuntime(PACK), {
      layers,
      dressing: catalog,
      glyphs: { [cellKey(4, 4)]: "trap" } as never,
      afterGround: () => events.push(`ground@${rec.drawImages.length}`),
      afterDressing: () => events.push(`dressing@${rec.drawImages.length}`),
    });
    drawMapContent(i);
    const cats = rec.drawImages.map((d) => sourceOf(d)?.category).filter(Boolean);
    const idx = (c: string): number => cats.indexOf(c as never);
    // Standing things sit on the ground and the walls rise over them.
    expect(idx("floor")).toBeLessThan(idx("chest"));
    expect(idx("chest")).toBeLessThan(idx("wallSegmentH"));
    expect(idx("wallSegmentH")).toBeLessThan(idx("trap"));
    // floor drawn before the ground hook, everything else after
    expect(events[0]).toBe("ground@1");
    expect(events[1]).toMatch(/^dressing@/);
    expect(idx("wallSegmentH")).toBeLessThan(idx("wallJoint"));
    expect(idx("wallJoint")).toBeLessThan(idx("trap"));
  });

  describe("passes", () => {
    const passLayers = (): ReturnType<typeof emptyLayers> => {
      const layers = emptyLayers();
      layers.floor[cellKey(1, 1)] = { floor: ref };
      putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
      putWall(layers, 1, 1, "W", { ...ref, type: "wall" });
      layers.solidBlock[cellKey(3, 3)] = { pack_id: PACK, pack_version: 1, variant: 0 } as never;
      layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "chest", variant: 0 } as never;
      return layers;
    };
    const run = (pass?: DrawMapInput["pass"]): (string | undefined)[] => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: passLayers(), glyphs: { [cellKey(4, 4)]: "trap" } as never, pass });
      drawMapContent(i);
      return rec.drawImages.map((d) => sourceOf(d)?.category);
    };

    it("ground draws the floor and the rock, and nothing that stands", () => {
      const cats = run("ground");
      expect(cats).toContain("floor");
      expect(cats).toContain("solidBlock");
      expect(cats).not.toContain("chest");
      expect(cats).not.toContain("wallSegmentH");
      expect(cats).not.toContain("trap");
    });

    it("standing draws props, walls and glyphs, and no floor or rock", () => {
      const cats = run("standing");
      expect(cats).toContain("chest");
      expect(cats).toContain("wallSegmentH");
      expect(cats).toContain("trap");
      expect(cats).not.toContain("floor");
      expect(cats).not.toContain("solidBlock");
    });

    it("an absent pass is the whole map, in the order it always was", () => {
      expect(run()).toEqual(run("all"));
      const cats = run();
      expect(cats.indexOf("chest")).toBeLessThan(cats.indexOf("solidBlock"));
      expect(cats.indexOf("solidBlock")).toBeLessThan(cats.indexOf("wallSegmentH"));
    });

    it("the two passes together draw what the whole map does", () => {
      const sorted = (a: (string | undefined)[]): string[] => a.map(String).sort();
      expect(sorted([...run("ground"), ...run("standing")])).toEqual(sorted(run("all")));
    });

    it("runs afterGround only in the ground pass and afterDressing only in the standing pass", () => {
      const events: string[] = [];
      for (const pass of ["ground", "standing"] as const) {
        const { input: i } = input(makeRuntime(PACK), {
          layers: passLayers(),
          pass,
          afterGround: () => events.push(`ground:${pass}`),
          afterDressing: () => events.push(`dressing:${pass}`),
        });
        drawMapContent(i);
      }
      expect(events).toEqual(["ground:ground", "dressing:standing"]);
    });
  });

  describe("omitLive", () => {
    const SWAY = { amount: 4, speed: 1 };
    const swayLayers = (): ReturnType<typeof emptyLayers> => {
      const layers = emptyLayers();
      layers.object[cellKey(1, 1)] = { ...ref, category: "objectPillar", variant: 0 };
      layers.object[cellKey(2, 1)] = { ...ref, category: "objectPillar", variant: 1 };
      layers.dressing.a = { prop_id: "palm", x: 3, y: 3, rotation: 0, z: 0 };
      layers.dressing.b = { prop_id: "rock", x: 4, y: 3, rotation: 0, z: 1 };
      return layers;
    };
    const art = {} as CanvasImageSource;
    const palm: DressingProp = { id: "palm", name: "P", footprint_w: 1, footprint_h: 1, image: art, flat: false, light: null, url: "https://cdn/palm.webp", sway: SWAY };
    const rock: DressingProp = { ...palm, id: "rock", sway: null };
    const runtime = () =>
      makeRuntime(PACK, {
        sway: { objectPillar: [SWAY, null] },
        assets: { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }, { variant: 1, url: "https://cdn/stump.webp" }] },
      });
    const count = (omitLive: boolean): number => {
      const { input: i, rec } = input(runtime(), {
        layers: swayLayers(),
        dressing: new Map([["palm", palm], ["rock", rock]]),
        pass: "standing",
        omitLive,
      });
      drawMapContent(i);
      return rec.drawImages.length;
    };

    it("leaves out exactly the objects and Dressing that sway", () => {
      expect(count(false)).toBe(4);
      expect(count(true)).toBe(2);
    });
  });

  describe("omitLive and door leaves", () => {
    const door = (variant: number) => {
      const layers = emptyLayers();
      putWall(layers, 1, 1, "N", { ...ref, variant, type: "doorClosed" });
      return layers;
    };
    const rt = () => makeRuntime(PACK, { assets: { doorLeaf: [{ variant: 0, url: "https://cdn/leaf-0.webp" }] } });
    const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);

    it("keeps the leaf unless asked to leave out what the live layer draws", () => {
      const { input: i, rec } = input(rt(), { layers: door(0) });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
    });

    it("skips a leaf that has art of its own and draws the doorway band", () => {
      const { input: i, rec } = input(rt(), { layers: door(0), omitLive: true });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH"]);
    });

    it("keeps a leaf whose variant has no art, since the live layer could not reproduce it", () => {
      const { input: i, rec } = input(rt(), { layers: door(1), omitLive: true });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
    });
  });


  it("paints the joint fallback square in the pack palette", () => {
    const rt = makeRuntime(PACK, { placeholders: ["wallJoint"], palette: { wallJoint: [1, 2, 3] } });
    const { input: i, rec } = input(rt, { layers: lCornerLayers() });
    drawMapContent(i);
    expect(rec.fillStyles).toContain("rgb(1,2,3)");
    expect(rec.fillStyles).not.toContain("rgb(40,36,32)");
  });

  it("draws joints that straddle the window border", () => {
    const layers = emptyLayers();
    // wall cell sits one cell outside the window; its joint is on the border
    layers.floor[cellKey(6, 6)] = { floor: ref };
    putWall(layers, 6, 6, "N", { ...ref, type: "wall" });
    putWall(layers, 6, 6, "W", { ...ref, type: "wall" });
    const { input: i, rec } = input(makeRuntime(PACK, { placeholders: ["wallJoint"] }), { layers });
    drawMapContent(i);
    expect(rec.fillRects).toHaveLength(1);
  });

  describe("doors (schema 4)", () => {
    const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);
    const edgeLayers = (side: "N" | "W", type: "doorClosed" | "doorOpen" | "grate"): ReturnType<typeof emptyLayers> => {
      const layers = emptyLayers();
      putWall(layers, 1, 1, side, { ...ref, type });
      return layers;
    };

    it("draws a closed N door as the doorway, then an unrotated leaf", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("N", "doorClosed") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
      expect(rec.rotates).toEqual([]);
      expect(rec.drawImages[0]).toMatchObject({ x: 128, y: 64, w: 128, h: 128 });
      expect(rec.drawImages[1]).toMatchObject({ x: 128, y: 64, w: 128, h: 128 });
    });

    it("swings an open N leaf by openDegrees about the hinge", () => {
      const rt = makeRuntime(PACK, { doorLeaf: { hingeX: 0.5, hingeY: 0.25, openDegrees: 60 } });
      const { input: i, rec } = input(rt, { layers: edgeLayers("N", "doorOpen") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
      expect(rec.rotates).toEqual([Math.PI / 3]);
      // tile top-left (128, 64), then the hinge at (0.5, 0.25) of a 128px tile
      expect(rec.translates).toEqual([[128, 64], [64, 32]]);
      expect(rec.drawImages[1]).toMatchObject({ x: -64, y: -32 });
    });

    it("falls back to the schema's default hinge and swing", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("N", "doorOpen") });
      drawMapContent(i);
      expect(rec.rotates).toEqual([(80 * Math.PI) / 180]);
      expect(rec.translates[1]).toEqual([32, 64]);
    });

    it("draws a W door as the H construction turned 90 degrees", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("W", "doorOpen") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayV", "doorLeaf"]);
      expect(rec.drawImages[0]).toMatchObject({ x: 64, y: 128 });
      expect(rec.rotates[0]).toBe(Math.PI / 2);
      expect(rec.rotates).toHaveLength(2);
    });

    it("draws a grate edge as edgeGrateH where a wall would draw", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("N", "grate") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["edgeGrateH"]);
      expect(rec.drawImages[0]).toMatchObject({ x: 128, y: 64 });
    });
  });
});

const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);
const lCornerLayers = (): ReturnType<typeof emptyLayers> => {
  const layers = emptyLayers();
  layers.floor[cellKey(1, 1)] = { floor: ref };
  putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
  putWall(layers, 1, 1, "W", { ...ref, type: "wall" });
  return layers;
};
const water = { pack_id: PACK, pack_version: 1, variant: 0 };

describe("variantAt", () => {
  const rt2d = makeRuntime(PACK, { continuous: { floor: 2, wallSegmentH: 3, curbH: 2 }, variantCount: 8 });

  it("picks (x mod n) + n * (y mod n) for a 2D texture", () => {
    expect(variantAt(rt2d, "floor", 0, 0, 7)).toBe(0);
    expect(variantAt(rt2d, "floor", 1, 0, 7)).toBe(1);
    expect(variantAt(rt2d, "floor", 3, 1, 7)).toBe(3);
  });

  it("uses a true modulo for negative cells", () => {
    expect(variantAt(rt2d, "floor", -1, -1, 7)).toBe(3);
    expect(variantAt(rt2d, "wallSegmentH", -1, 9, 0)).toBe(2);
  });

  it("walls and curbs run along their own axis, V reading the H period", () => {
    expect(variantAt(rt2d, "wallSegmentH", 4, 9, 0)).toBe(1);
    expect(variantAt(rt2d, "wallSegmentV", 9, 4, 0)).toBe(1);
    expect(variantAt(rt2d, "curbV", 9, 3, 0)).toBe(1);
  });

  it("keeps the stored variant when the pack declares too few pieces", () => {
    const few = makeRuntime(PACK, { continuous: { floor: 2 }, categoryCounts: { floor: 3 } });
    expect(variantAt(few, "floor", 1, 1, 2)).toBe(2);
  });

  it("keeps the stored variant for a category with no period", () => {
    expect(variantAt(rt2d, "solidBlock", 1, 1, 5)).toBe(5);
    expect(variantAt(makeRuntime(PACK), "floor", 1, 1, 5)).toBe(5);
  });

  it("is used for floor and walls when drawing", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(3, 1)] = { floor: { ...ref, variant: 7 } };
    putWall(layers, 3, 1, "N", { ...ref, type: "wall", variant: 7 });
    const { input: i, rec } = input(rt2d, { layers });
    drawMapContent(i);
    const floor = rec.drawImages.find((d) => sourceOf(d).category === "floor");
    const wall = rec.drawImages.find((d) => sourceOf(d).category === "wallSegmentH");
    expect(sourceOf(floor!).variant).toBe(1 + 2 * 1);
    expect(sourceOf(wall!).variant).toBe(0);
  });
});

describe("terrain", () => {
  const rt = makeRuntime(PACK, { variantCount: 4 });

  it("overpaints the floor with clipped terrainWater while retaining the source below", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    layers.floor[cellKey(2, 1)] = { floor: ref };
    layers.terrain[cellKey(1, 1)] = water;
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    const at = (x: number): (string | undefined)[] =>
      rec.drawImages.filter((d) => d.x === x * 128 && d.y === 128).map((d) => sourceOf(d).category);
    expect(at(1)).toEqual(["floor", "terrainWater"]);
    expect(rec.drawImages.every((draw) => draw.clips > 0)).toBe(true);
    expect(at(2)).toEqual(["floor"]);
  });

  it("does not paint square bank shading across an editable vector shoreline", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    layers.terrain[cellKey(1, 1)] = water;
    layers.terrain[cellKey(2, 1)] = water;
    layers.floor[cellKey(2, 1)] = { floor: ref };
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    expect(rec.gradients).toEqual([]);
  });
});

describe("vector shorelines", () => {
  const lake = () => {
    const layers = emptyLayers();
    for (const [x, y] of [[2, 2], [2, 1], [2, 3], [1, 2], [3, 2]]) layers.floor[cellKey(x, y)] = { floor: ref };
    layers.terrain[cellKey(2, 2)] = water;
    return sourceLayers(layers);
  };

  it("adds no grid curb or post where material boundaries meet floor or physical walls", () => {
    const layers = lake();
    putWall(layers, 2, 2, "N", { ...ref, type: "wall" });
    const before = input(makeRuntime(PACK, { variantCount: 4 }), { layers });
    drawMapContent(before.input);
    expect(cats(before.rec).filter((category) => category?.startsWith("curb"))).toEqual([]);
    putWall(layers, 3, 2, "W", { ...ref, type: "wall" }, false);
    const after = input(makeRuntime(PACK, { variantCount: 4 }), { layers });
    drawMapContent(after.input);
    expect(cats(after.rec).filter((category) => category?.startsWith("curb"))).toEqual([]);
  });

  it("renders the material boundary without curb art, posts, rotations or cell-bank shading", () => {
    const runtime = makeRuntime(PACK, { categoryCounts: { terrainWater: 1, curbH: 1, curbV: 1, curbPost: 1 } });
    const { input: i, rec } = input(runtime, { layers: lake() });
    drawMapContent(i);
    expect(cats(rec)).toContain("terrainWater");
    expect(cats(rec).filter((category) => category?.startsWith("curb"))).toEqual([]);
    expect(rec.rotates).toEqual([]);
    expect(rec.gradients).toEqual([]);
  });

  it("casts no artificial curb shadows, whatever the pack's flush setting", () => {
    for (const flush of [[], ["curbH", "curbV", "curbPost"]] as const) {
      const f = makeLayerFactory();
      const { input: i } = input(makeRuntime(PACK, { categoryCounts: { curbH: 1 }, flush: [...flush] }), { layers: lake(), shadows: true, makeCanvas: f.makeCanvas });
      renderShadowLayer(i);
      expect(f.layers.flatMap((layer) => cats(layer.rec)).filter((category) => category?.startsWith("curb"))).toEqual([]);
    }
  });
});


describe("decals and stairs", () => {
  it("draws a wall's decal over it, turned on a V wall", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall", decal: 2 });
    putWall(layers, 1, 1, "W", { ...ref, type: "wall", decal: 1 });
    const { input: i, rec } = input(makeRuntime(PACK, { categoryCounts: { wallDecal: 3 } }), { layers });
    drawMapContent(i);
    const c = cats(rec);
    expect(c.indexOf("wallDecal")).toBe(c.indexOf("wallSegmentH") + 1);
    expect(c.indexOf("wallDecal", c.indexOf("wallDecal") + 1)).toBe(c.indexOf("wallSegmentV") + 1);
    expect(rec.rotates).toEqual([Math.PI / 2]);
  });

  it("draws a stair's art for the side its rotation faces, unturned", () => {
    const layers = emptyLayers();
    layers.object[cellKey(1, 1)] = { pack_id: PACK, pack_version: 1, category: "stairsUp", variant: 0, rotation: 90 };
    layers.object[cellKey(3, 1)] = { pack_id: PACK, pack_version: 1, category: "stairsUp", variant: 0 };
    const { input: i, rec } = input(makeRuntime(PACK, { variantCount: 1 }), { layers });
    drawMapContent(i);
    const stairs = rec.drawImages.filter((d) => sourceOf(d).category === "stairsUp").map((d) => sourceOf(d).side);
    expect(stairs.sort()).toEqual(["E", "N"]);
    expect(rec.rotates).toEqual([]);
  });

  it("turns the N stair when a pack has no art for the side", () => {
    const layers = emptyLayers();
    layers.object[cellKey(1, 1)] = { pack_id: PACK, pack_version: 1, category: "stairsDown", variant: 0, rotation: 180 };
    const { input: i, rec } = input(makeRuntime(PACK, { variantCount: 0 }), { layers });
    drawMapContent(i);
    expect(rec.drawImages.filter((d) => sourceOf(d).category === "stairsDown").map((d) => sourceOf(d).side)).toEqual(["N"]);
    expect(rec.rotates).toEqual([Math.PI]);
  });

  it("gives a stair down a hollow on its top and left inner edges, laid only over the stair itself", () => {
    const layers = emptyLayers();
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "stairsDown", variant: 0 };
    const f = makeLayerFactory();
    const { input: i, rec } = input(makeRuntime(PACK), { layers, makeCanvas: f.makeCanvas });
    drawMapContent(i);
    // The stair and its fade go into a cell canvas, faded source-atop, and that canvas onto the map.
    const cell = f.layers.find((l) => l.width === 128 && l.height === 128);
    expect(cell).toBeDefined();
    expect(cats(cell!.rec)).toEqual(["stairsDown"]);
    expect(cell!.rec.gradients).toHaveLength(2);
    expect(cell!.rec.gradients[0]).toMatchObject({ x0: 0, y0: 0, y1: 128 * 0.35 });
    expect(cell!.rec.gradients[0].stops[0][1]).toContain("0.7");
    expect(cell!.rec.gradients[1]).toMatchObject({ x0: 0, y0: 0, x1: 128 * 0.35 });
    expect(cell!.ctx.globalCompositeOperation).toBe("source-atop");
    expect(rec.gradients).toHaveLength(0);
    expect(rec.drawImages.some((d) => (d.source as unknown) === cell!.canvas && d.x === 256 && d.y === 256)).toBe(true);
  });

  it("draws a stair down without its hollow when no canvas can be made", () => {
    const layers = emptyLayers();
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "stairsDown", variant: 0 };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(cats(rec)).toEqual(["stairsDown"]);
    expect(rec.gradients).toHaveLength(0);
  });
});

describe("shadows", () => {
  const shadowLayers = (): ReturnType<typeof emptyLayers> => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "objectChest", variant: 0 };
    layers.object[cellKey(3, 2)] = { pack_id: PACK, pack_version: 1, category: "rubble", variant: 0 };
    layers.object[cellKey(4, 2)] = { pack_id: PACK, pack_version: 1, category: "stairsUp", variant: 0 };
    layers.solidBlock[cellKey(0, 0)] = ref;
    return layers;
  };

  it("sends each class to its own layer", () => {
    const f = makeLayerFactory();
    const { input: i } = input(makeRuntime(PACK, { variantCount: 2 }), {
      layers: shadowLayers(),
      shadows: true,
      makeCanvas: f.makeCanvas,
    });
    const layer = renderShadowLayer(i);
    expect(layer).not.toBeNull();
    // Layer 0 is the output, followed by physical raised, standing and flat silhouettes.
    const [, raised, standing, flat] = f.layers;
    expect(cats(raised.rec)).toEqual(expect.arrayContaining(["solidBlock", "wallSegmentH"]));
    expect(cats(raised.rec)).not.toContain("objectChest");
    expect(cats(standing.rec)).toEqual(["objectChest"]);
    expect(cats(flat.rec)).toEqual(["rubble"]);
    for (const l of f.layers) expect(cats(l.rec)).not.toContain("stairsUp");
    // Two casts and three occlusion passes; shorelines have no artificial low silhouette.
    expect(f.layers[0].rec.shadowDraws).toHaveLength(5);
    expect(f.layers[0].rec.shadowDraws.filter((d) => d.blur === 128 * 0.03)).toHaveLength(3);
    const cast = f.layers[0].rec.shadowDraws.find((d) => d.color === "rgba(10,8,6,0.42)");
    expect(cast?.offsetY).toBeCloseTo(128 * 0.14);
  });

  it("composites the shadows before flat and standing things and the stair up after them, walls last", () => {
    const f = makeLayerFactory();
    const { input: i, rec } = input(makeRuntime(PACK, { variantCount: 2 }), {
      layers: shadowLayers(),
      shadows: true,
      makeCanvas: f.makeCanvas,
    });
    drawMapContent(i);
    const order = rec.drawImages.map((d) => (d.source as { layer?: number }).layer !== undefined ? "shadow" : sourceOf(d).category);
    // A flat thing's own occlusion is in the layer: drawn under it, it would grey the thing out.
    expect(order.indexOf("shadow")).toBeLessThan(order.indexOf("rubble"));
    expect(order.indexOf("rubble")).toBeLessThan(order.indexOf("objectChest"));
    expect(order.indexOf("objectChest")).toBeLessThan(order.indexOf("stairsUp"));
    expect(order.indexOf("stairsUp")).toBeLessThan(order.indexOf("wallSegmentH"));
  });

  it("draws everything, in the same order, with no shadow calls when no canvas can be made", () => {
    const withShadows = input(makeRuntime(PACK, { variantCount: 2 }), { layers: shadowLayers(), shadows: true });
    drawMapContent(withShadows.input);
    const plain = input(makeRuntime(PACK, { variantCount: 2 }), { layers: shadowLayers() });
    drawMapContent(plain.input);
    expect(cats(withShadows.rec)).toEqual(cats(plain.rec));
    expect(cats(plain.rec)).toEqual(expect.arrayContaining(["objectChest", "rubble", "stairsUp", "wallSegmentH", "solidBlock"]));
    expect(withShadows.rec.shadowDraws).toHaveLength(0);
  });

  it("uses a prebuilt shadow layer without rebuilding it", () => {
    const f = makeLayerFactory();
    const { input: i } = input(makeRuntime(PACK), { layers: shadowLayers(), shadows: true, makeCanvas: f.makeCanvas });
    const built = renderShadowLayer(i);
    const count = f.layers.length;
    const again = input(makeRuntime(PACK), { layers: shadowLayers(), shadows: true, makeCanvas: f.makeCanvas, shadowLayer: built });
    drawMapContent(again.input);
    expect(f.layers).toHaveLength(count);
    expect(again.rec.drawImages.some((d) => (d.source as { layer?: number }).layer === 0)).toBe(true);
  });
});

describe("lights", () => {
  // A torch by the rules: 20 feet bright, 20 more dim, so 8 cells of reach with the bright edge halfway.
  const FIRE = { color: "#ff8030", bright: 20, dim: 20, intensity: 0.6 };
  const lit = (lights: NonNullable<Parameters<typeof makeRuntime>[1]>["lights"]) => makeRuntime(PACK, { lights });
  const braziers = (x: number, y: number) => {
    const layers = emptyLayers();
    layers.object[cellKey(x, y)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    return layers;
  };
  const lightsOf = (rt: TilePackRuntime, over: Partial<DrawMapInput>) => {
    const { input: i, rec } = input(rt, { lights: true, ...over });
    drawMapContent(i);
    return rec;
  };

  it("puts the composite back after the glow", () => {
    const { input: i } = input(lit({ objectBrazier: [null, FIRE] }), { lights: true, layers: braziers(2, 2) });
    drawMapContent(i);
    expect(i.ctx.globalCompositeOperation).toBe("source-over");
  });

  it("sets the screen composite while the glow is filled", () => {
    const { ctx } = makeCtx();
    const ops: string[] = [];
    const spy = new Proxy(ctx, {
      get: (target, key) => (key === "fillRect" ? (...args: [number, number, number, number]) => { ops.push(target.globalCompositeOperation); target.fillRect(...args); } : Reflect.get(target, key)),
      set: (target, key, value) => Reflect.set(target, key, value),
    });
    const { input: i } = input(lit({ objectBrazier: [null, FIRE] }), { lights: true, layers: braziers(2, 2), ctx: spy });
    drawMapContent(i);
    expect(ops).toContain("screen");
  });

  it("draws nothing when lights are off", () => {
    const rec = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers: braziers(2, 2), lights: false });
    expect(rec.radialGradients).toHaveLength(0);
  });

  it("lays light over the shadows and flat things, under standing things and walls", () => {
    const f = makeLayerFactory();
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    layers.object[cellKey(3, 2)] = { pack_id: PACK, pack_version: 1, category: "rubble", variant: 0 };
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    const { input: i, rec } = input(lit({ objectBrazier: [null, FIRE] }), { layers, shadows: true, lights: true, makeCanvas: f.makeCanvas });
    drawMapContent(i);
    // Two canvases reach the map: the shadow layer first, then the masked glow.
    let canvases = 0;
    const order = rec.drawImages.map((d) =>
      (d.source as { layer?: number }).layer !== undefined ? (canvases++ === 0 ? "shadow" : "glow") : sourceOf(d).category,
    );
    expect(order).toEqual(["floor", "shadow", "rubble", "glow", "objectBrazier", "wallSegmentH"]);
  });
});

describe("pieces that sit on the window's border", () => {
  const wall = { ...ref, type: "wall" as const };

  it("draws a wall along the far edge of the last row and column, since those lines belong to the cells beyond", () => {
    const layers = emptyLayers();
    putWall(layers, 2, 6, "N", wall);
    putWall(layers, 6, 2, "W", wall);
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(cats(rec).sort()).toEqual(["wallSegmentH", "wallSegmentV"]);
  });

  it("paints no corner square while the pack behind the walls has not loaded, as the walls wait too", () => {
    const { input: i, rec } = input(null, { layers: lCornerLayers() });
    expect(() => drawMapContent(i)).not.toThrow();
    expect(rec.fillRects).toHaveLength(0);
    expect(rec.drawImages).toHaveLength(0);
  });

  it("adds no artificial curb or post where an unwalled shoreline reaches the window edge", () => {
    // A water region outside the viewport still must not leak grid curb art onto its first column.
    const layers = emptyLayers();
    for (const [x, y] of [[-1, 1], [0, 1], [-1, 2], [1, 1]]) layers.floor[cellKey(x, y)] = { floor: ref };
    layers.terrain[cellKey(-1, 1)] = water;
    const { input: i, rec } = input(makeRuntime(PACK, { variantCount: 4, categoryCounts: { curbV: 1, curbH: 1, curbPost: 1 } }), { layers });
    drawMapContent(i);
    expect(cats(rec).filter((category) => category?.startsWith("curb"))).toEqual([]);
  });

  it("keeps flush pack shorelines free of artificial curbs and posts too", () => {
    const layers = emptyLayers();
    for (const [x, y] of [[1, 1], [2, 1], [1, 2]]) layers.floor[cellKey(x, y)] = { floor: ref };
    layers.terrain[cellKey(1, 1)] = water;
    const flush = makeRuntime(PACK, { categoryCounts: { curbH: 1, curbV: 1, curbPost: 1 }, flush: ["curbH", "curbV", "curbPost"] });
    const { input: i, rec } = input(flush, { layers });
    drawMapContent(i);
    expect(cats(rec).filter((category) => category?.startsWith("curb"))).toEqual([]);
  });
});

describe("variantAt: where the stored variant gives way to the position", () => {
  it("uses the position when the pack declares exactly the pieces the period needs, and the stored variant when it has fewer", () => {
    const exact = makeRuntime(PACK, { continuous: { floor: 2, wallSegmentH: 3 }, categoryCounts: { floor: 4, wallSegmentH: 3 } });
    expect(variantAt(exact, "floor", 1, 1, 0)).toBe(3);
    expect(variantAt(exact, "wallSegmentH", 4, 0, 0)).toBe(1);
    const short = makeRuntime(PACK, { continuous: { floor: 2, wallSegmentH: 3 }, categoryCounts: { floor: 3, wallSegmentH: 2 } });
    expect(variantAt(short, "floor", 1, 1, 0)).toBe(0);
    expect(variantAt(short, "wallSegmentH", 4, 0, 0)).toBe(0);
  });

  it("makes a one-piece texture draw that piece everywhere, whatever variant was stored", () => {
    const one = makeRuntime(PACK, { continuous: { floor: 1 }, variantCount: 8 });
    expect(variantAt(one, "floor", 5, 7, 5)).toBe(0);
  });
});

describe("wall decals: only where one is set", () => {
  it("adds nothing to a plain wall, even in a pack that has decal art", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    const { input: i, rec } = input(makeRuntime(PACK, { categoryCounts: { wallDecal: 2 } }), { layers });
    drawMapContent(i);
    expect(cats(rec)).not.toContain("wallDecal");
  });

  it("adds nothing in a pack with no decal art at all, rather than a placeholder", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall", decal: 1 });
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(cats(rec)).not.toContain("wallDecal");
  });
});

describe("wall decals", () => {
  it("draws the first decal, index 0, as well as the others", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall", decal: 0 });
    const { input: i, rec } = input(makeRuntime(PACK, { categoryCounts: { wallDecal: 2 } }), { layers });
    drawMapContent(i);
    expect(cats(rec)).toContain("wallDecal");
  });
});

// #1125 story 5: walls are segments. A wall on a grid line draws as pack edge art; an angled one is a stroked line.
describe("angled and hidden walls", () => {
  const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);

  it("draws a wall marked invisible in no bake: no edge art and no joint", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" }, false);
    putWall(layers, 1, 1, "W", { ...ref, type: "wall" }, false);
    const { input: i, rec } = input(makeRuntime(PACK, { placeholders: ["wallJoint"] }), { layers });
    drawMapContent(i);
    expect(cats(rec)).toEqual([]);
    expect(rec.fillRects).toHaveLength(0);
  });

  it("draws an invisible wall dashed in the editor, where the DM can see and edit it", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" }, false);
    const { input: i, rec } = input(makeRuntime(PACK), { layers, showHiddenWalls: true });
    drawMapContent(i);
    expect(cats(rec)).toEqual([]);
    expect(rec.calls).toContain("setLineDash");
    expect(rec.points).toEqual([[128, 128], [256, 128]]);
  });

  it("draws nothing for hidden walls when none are hidden, even in the editor", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    const { input: i, rec } = input(makeRuntime(PACK), { layers, showHiddenWalls: true });
    drawMapContent(i);
    expect(rec.calls).not.toContain("setLineDash");
  });

  it("strokes an angled wall without wall art as a band along its line, capped half a band past each end, in the pack's wall tone", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...ref, type: "wall", a: [1, 1], b: [3, 2] };
    const rt = makeRuntime(PACK, { palette: { wallSegmentH: [7, 8, 9] } });
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    // A band is a quarter of a tile (app convention, WALL_BAND_RATIO): 32px at 128px a tile, so the caps reach 16px.
    const cap = 16 / Math.hypot(2, 1);
    expect(rec.points[0][0]).toBeCloseTo(128 - 2 * cap);
    expect(rec.points[0][1]).toBeCloseTo(128 - cap);
    expect(rec.points[1][0]).toBeCloseTo(384 + 2 * cap);
    expect(rec.points[1][1]).toBeCloseTo(256 + cap);
    expect(rec.strokeStyles).toContain("rgb(7,8,9)");
    expect(cats(rec)).toEqual([]); // no edge tile: art is one tile per grid edge
  });

  it("falls back to stone ink for an angled wall whose pack declares no palette", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...ref, type: "wall", a: [1, 1], b: [3, 2] };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.strokeStyles).toContain("rgb(40,36,32)");
  });

  it("draws an angled door as two posts and a leaf turned to the wall's angle", () => {
    const layers = emptyLayers();
    layers.walls.door = { ...ref, type: "doorClosed", a: [1, 1], b: [2, 2] };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.rotates[0]).toBeCloseTo(Math.PI / 4);
    expect(rec.fillRects).toHaveLength(1);
    expect(rec.fillRects[0].w).toBeCloseTo(Math.SQRT2 * 128);
  });

  it("swings an open angled door a quarter turn off the wall's line", () => {
    const layers = emptyLayers();
    layers.walls.door = { ...ref, type: "doorOpen", a: [1, 1], b: [3, 1] };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.rotates[0]).toBeCloseTo(Math.PI / 2);
  });

  it("skips an angled wall that lies far outside the draw window", () => {
    const layers = emptyLayers();
    layers.walls.far = { ...ref, type: "wall", a: [40, 40], b: [42, 41] };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.points).toEqual([]);
  });

  // The corner at grid point (1,1) has four arms: west and east along the row, north and south down the column.
  it.each([
    ["west", 0, 1, "N"],
    ["east", 1, 1, "N"],
    ["north", 1, 0, "W"],
    ["south", 1, 1, "W"],
  ] as const)("gives no corner when the %s arm is hidden and the only other arm is on the other axis", (_arm, hx, hy, hSide) => {
    const layers = emptyLayers();
    putWall(layers, hx, hy, hSide, { ...ref, type: "wall" }, false);
    // One visible arm across the other axis, so a drawn arm would make an L.
    if (hSide === "N") putWall(layers, 1, 1, "W", { ...ref, type: "wall" });
    else putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    const { input: i, rec } = input(makeRuntime(PACK, { placeholders: ["wallJoint"] }), { layers });
    drawMapContent(i);
    expect(rec.fillRects).toHaveLength(0);
  });

  it("draws an angled wall marked invisible in no bake", () => {
    const layers = emptyLayers();
    layers.walls.ghost = { ...ref, type: "wall", a: [1, 1], b: [3, 2], visible: false };
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.points).toEqual([]);
  });

  it("keeps hidden walls out of the shadows, even when the editor shows them", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" }, false);
    layers.walls.ghost = { ...ref, type: "wall", a: [1, 1], b: [3, 2], visible: false };
    const f = makeLayerFactory();
    const { input: i } = input(makeRuntime(PACK), { layers, shadows: true, showHiddenWalls: true, makeCanvas: f.makeCanvas });
    renderShadowLayer(i);
    for (const layer of f.layers) expect(layer.rec.calls).not.toContain("setLineDash");
  });
});

describe("angled walls get the wall texture (#1125, curved walls)", () => {
  const art = () => makeRuntime(PACK, { categoryCounts: { wallSegmentH: 1 } });
  /** Slices of the wall art bent onto a line (the nine-argument drawImage); a grid edge's tile is drawn whole. */
  const slices = (rec: Recorder) => rec.drawImages.filter((d) => d.src !== undefined && sourceOf(d)?.category === "wallSegmentH");

  it("draws a plain angled wall with the pack's wall art, where it used to be a bare line", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...ref, type: "wall", a: [1, 1], b: [3, 2] };
    const { input: i, rec } = input(art(), { layers });
    drawMapContent(i);
    expect(slices(rec).length).toBeGreaterThan(0);
  });

  it("draws a curved wall as more slices than the same wall straight, and the slices follow the curve", () => {
    const flat = emptyLayers();
    flat.walls.p = { ...ref, type: "wall", a: [1, 1], b: [4, 1] };
    flat.walls.q = { ...ref, type: "wall", a: [4, 1], b: [4, 4] };
    const bent = emptyLayers();
    bent.walls.p = { ...flat.walls.p, smoothB: true };
    bent.walls.q = { ...flat.walls.q, smoothA: true };
    const straight = input(art(), { layers: flat });
    drawMapContent(straight.input);
    const curved = input(art(), { layers: bent });
    drawMapContent(curved.input);
    expect(slices(curved.rec).length).toBeGreaterThan(slices(straight.rec).length);
    // Slices are rotated onto their piece: a straight wall turns only for its own two directions, a curve for many.
    expect(new Set(curved.rec.rotates.map((r) => r.toFixed(2))).size).toBeGreaterThan(new Set(straight.rec.rotates.map((r) => r.toFixed(2))).size);
  });

  it("carries the texture on from one piece of a curve to the next instead of restarting each", () => {
    const layers = emptyLayers();
    layers.walls.p = { ...ref, type: "wall", a: [1, 1], b: [4, 1], smoothB: true };
    layers.walls.q = { ...ref, type: "wall", a: [4, 1], b: [4, 4], smoothA: true };
    const { input: i, rec } = input(art(), { layers });
    drawMapContent(i);
    const starts = slices(rec).map((d) => d.src!.x);
    // A ribbon that restarted at every piece would begin each slice at the same place in the tile.
    expect(new Set(starts.map((x) => Math.round(x))).size).toBeGreaterThan(3);
  });

  it("leaves grid walls to their edge tiles: no bent slices for them", () => {
    const layers = emptyLayers();
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    const { input: i, rec } = input(art(), { layers });
    drawMapContent(i);
    expect(slices(rec)).toHaveLength(0);
    expect(cats(rec)).toContain("wallSegmentH");
  });

  it("draws a pack with only placeholder wall art as a band in its tone, as before", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...ref, type: "wall", a: [1, 1], b: [3, 2] };
    const rt = makeRuntime(PACK, { categoryCounts: { wallSegmentH: 1 }, placeholders: ["wallSegmentH"], palette: { wallSegmentH: [7, 8, 9] } });
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    expect(slices(rec)).toHaveLength(0);
    expect(rec.strokeStyles).toContain("rgb(7,8,9)");
  });

  it("puts the textured angled wall in the shadow silhouette, so it throws the shadow a grid wall does", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...ref, type: "wall", a: [1, 1], b: [3, 2] };
    const f = makeLayerFactory();
    const { input: i } = input(art(), { layers, shadows: true, makeCanvas: f.makeCanvas });
    renderShadowLayer(i);
    expect(f.layers.some((l) => l.rec.drawImages.some((d) => d.src !== undefined))).toBe(true);
  });

  it("keeps a door on an angled wall as posts and a leaf, with no ribbon", () => {
    const layers = emptyLayers();
    layers.walls.door = { ...ref, type: "doorClosed", a: [1, 1], b: [2, 2] };
    const { input: i, rec } = input(art(), { layers });
    drawMapContent(i);
    expect(slices(rec)).toHaveLength(0);
    expect(rec.fillRects).toHaveLength(1);
  });
});
