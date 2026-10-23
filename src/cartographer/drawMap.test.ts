import { describe, it, expect } from "vitest";
import { curbEdges, curbPosts, drawMapContent, renderShadowLayer, variantAt } from "./drawMap";
import type { DrawMapInput } from "./drawFrame";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";
import type { DressingCatalog, DressingProp } from "./dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { makeCtx, makeLayerFactory, makeRuntime, sourceOf, type Recorder } from "./testCanvas";

const PACK = "p";

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
      layers: emptyLayers(),
      runtime: () => rt,
      defaultPackId: PACK,
      glyphs: {},
      glyphPackId: PACK,
      dressing: new Map(),
      lights: false,
      ...overrides,
    },
  };
}

const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

describe("drawMapContent", () => {
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
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
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
      layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
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
      layers.floor[cellKey(1, 1)] = { wallN: { ...ref, variant, type: "doorClosed" } };
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

  const lCorner = (): ReturnType<typeof emptyLayers> => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
    return layers;
  };

  it("draws a rounded corner only when the pack has real art for it", () => {
    const real = input(makeRuntime(PACK, { categoryCounts: { wallRoundJoint: 1 } }), { layers: lCorner() });
    drawMapContent(real.input);
    expect(real.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(true);

    const fake = input(makeRuntime(PACK, { categoryCounts: { wallRoundJoint: 1 }, placeholders: ["wallRoundJoint"] }), {
      layers: lCorner(),
    });
    drawMapContent(fake.input);
    expect(fake.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(false);

    const none = input(makeRuntime(PACK), { layers: lCorner() });
    drawMapContent(none.input);
    expect(none.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(false);
  });

  it("paints the joint fallback square in the pack palette", () => {
    const rt = makeRuntime(PACK, { placeholders: ["wallJoint"], palette: { wallJoint: [1, 2, 3] } });
    const { input: i, rec } = input(rt, { layers: lCorner() });
    drawMapContent(i);
    expect(rec.fillStyles).toContain("rgb(1,2,3)");
    expect(rec.fillStyles).not.toContain("rgb(40,36,32)");
  });

  it("draws joints that straddle the window border", () => {
    const layers = emptyLayers();
    // wall cell sits one cell outside the window; its joint is on the border
    layers.floor[cellKey(6, 6)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
    const { input: i, rec } = input(makeRuntime(PACK, { placeholders: ["wallJoint"] }), { layers });
    drawMapContent(i);
    expect(rec.fillRects).toHaveLength(1);
  });

  describe("doors (schema 4)", () => {
    const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);
    const edgeLayers = (side: "wallN" | "wallW", type: "doorClosed" | "doorOpen" | "grate"): ReturnType<typeof emptyLayers> => {
      const layers = emptyLayers();
      layers.floor[cellKey(1, 1)] = { [side]: { ...ref, type } };
      return layers;
    };

    it("draws a closed N door as the doorway, then an unrotated leaf", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("wallN", "doorClosed") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
      expect(rec.rotates).toEqual([]);
      expect(rec.drawImages[0]).toMatchObject({ x: 128, y: 64, w: 128, h: 128 });
      expect(rec.drawImages[1]).toMatchObject({ x: 128, y: 64, w: 128, h: 128 });
    });

    it("swings an open N leaf by openDegrees about the hinge", () => {
      const rt = makeRuntime(PACK, { doorLeaf: { hingeX: 0.5, hingeY: 0.25, openDegrees: 60 } });
      const { input: i, rec } = input(rt, { layers: edgeLayers("wallN", "doorOpen") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayH", "doorLeaf"]);
      expect(rec.rotates).toEqual([Math.PI / 3]);
      // tile top-left (128, 64), then the hinge at (0.5, 0.25) of a 128px tile
      expect(rec.translates).toEqual([[128, 64], [64, 32]]);
      expect(rec.drawImages[1]).toMatchObject({ x: -64, y: -32 });
    });

    it("falls back to the schema's default hinge and swing", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("wallN", "doorOpen") });
      drawMapContent(i);
      expect(rec.rotates).toEqual([(80 * Math.PI) / 180]);
      expect(rec.translates[1]).toEqual([32, 64]);
    });

    it("draws a W door as the H construction turned 90 degrees", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("wallW", "doorOpen") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["doorwayV", "doorLeaf"]);
      expect(rec.drawImages[0]).toMatchObject({ x: 64, y: 128 });
      expect(rec.rotates[0]).toBe(Math.PI / 2);
      expect(rec.rotates).toHaveLength(2);
    });

    it("draws a grate edge as edgeGrateH where a wall would draw", () => {
      const { input: i, rec } = input(makeRuntime(PACK), { layers: edgeLayers("wallN", "grate") });
      drawMapContent(i);
      expect(cats(rec)).toEqual(["edgeGrateH"]);
      expect(rec.drawImages[0]).toMatchObject({ x: 128, y: 64 });
    });
  });
});

const cats = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d)?.category);
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
    layers.floor[cellKey(3, 1)] = { floor: { ...ref, variant: 7 }, wallN: { ...ref, type: "wall", variant: 7 } };
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

  it("draws terrainWater instead of the floor in its cell", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    layers.floor[cellKey(2, 1)] = { floor: ref };
    layers.terrain[cellKey(1, 1)] = water;
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    const at = (x: number): (string | undefined)[] =>
      rec.drawImages.filter((d) => d.x === x * 128 && d.y === 128).map((d) => sourceOf(d).category);
    expect(at(1)).toEqual(["terrainWater"]);
    expect(at(2)).toEqual(["floor"]);
  });

  it("darkens the sides facing a bank, harder on top and left", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    layers.terrain[cellKey(1, 1)] = water;
    layers.terrain[cellKey(2, 1)] = water;
    layers.floor[cellKey(2, 1)] = { floor: ref };
    const { input: i, rec } = input(rt, { layers });
    drawMapContent(i);
    // cell (1,1): top, left, bottom open; right shares water. Four sides minus one.
    const own = rec.gradients.filter((g) => g.x0 >= 128 && g.y0 >= 128 && g.y0 <= 256 && g.x0 < 256);
    expect(own).toHaveLength(3);
    const top = own.find((g) => g.y0 === 128 && g.y1 > g.y0);
    expect(top?.stops[0][1]).toContain("0.65");
    expect(top?.y1).toBeCloseTo(128 + 128 * 0.3);
    const bottom = own.find((g) => g.y0 === 256 && g.y1 < g.y0);
    expect(bottom?.stops[0][1]).toContain("0.35");
  });
});

describe("curbEdges and curbPosts", () => {
  const floorCell = { floor: ref };

  it("puts a curb on every edge between terrain and floor", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = floorCell;
    layers.floor[cellKey(2, 1)] = floorCell;
    layers.terrain[cellKey(1, 1)] = water;
    expect(curbEdges(layers)).toEqual([{ x: 2, y: 1, axis: "V", packId: PACK, waterSide: "W" }]);
  });

  it("gives none where the edge already carries a seg, nor between terrain cells, nor to void", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = floorCell;
    layers.floor[cellKey(2, 1)] = { floor: ref, wallW: { ...ref, type: "wall" } };
    layers.floor[cellKey(3, 1)] = floorCell;
    layers.terrain[cellKey(1, 1)] = water;
    layers.terrain[cellKey(0, 1)] = water; // next to void on the far side, next to terrain here
    expect(curbEdges(layers)).toEqual([]);
  });

  it("records which side the water is on, so a curb can face it", () => {
    const layers = emptyLayers();
    for (const [x, y] of [[2, 2], [2, 1], [2, 3], [1, 2], [3, 2]]) layers.floor[cellKey(x, y)] = floorCell;
    layers.terrain[cellKey(2, 2)] = water;
    expect(curbEdges(layers).map((c) => `${c.axis}${c.x},${c.y}${c.waterSide}`).sort()).toEqual(["H2,2S", "H2,3N", "V2,2E", "V3,2W"]);
  });

  it("puts a post where a curb meets a wall", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" } };
    layers.floor[cellKey(2, 1)] = floorCell;
    layers.terrain[cellKey(1, 1)] = water;
    // the V curb on x=2 runs (2,1)-(2,2); the wall on y=1 ends at the point (2,1)
    const posts = curbPosts(layers);
    expect(posts).toContainEqual({ x: 2, y: 1, packId: PACK });
  });

  it("puts a post where an H and a V curb turn, and none along a straight run", () => {
    const layers = emptyLayers();
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [3, 1]]) layers.floor[cellKey(x, y)] = floorCell;
    layers.terrain[cellKey(1, 1)] = water;
    const posts = curbPosts(layers);
    expect(posts.map((p) => `${p.x},${p.y}`).sort()).toEqual(["2,2"]);
    // (2,1) -> (2,2) is the V curb, (1,2) -> (2,2) the H curb: they meet at (2,2).
  });

  it("draws curbs on the gridline like walls, and a post centred on the point", () => {
    const layers = emptyLayers();
    for (const [x, y] of [[1, 1], [2, 1], [1, 2]]) layers.floor[cellKey(x, y)] = floorCell;
    layers.terrain[cellKey(1, 1)] = water;
    const { input: i, rec } = input(makeRuntime(PACK, { variantCount: 4 }), { layers });
    drawMapContent(i);
    const v = rec.drawImages.find((d) => sourceOf(d).category === "curbV");
    const h = rec.drawImages.find((d) => sourceOf(d).category === "curbH");
    expect(v).toMatchObject({ x: 256 - 64, y: 128, w: 128 });
    // the H curb has its water to the north, so it is turned a half about the centre of its spot on the gridline
    expect(h).toMatchObject({ x: -64, y: -64, w: 128 });
    expect(rec.translates).toContainEqual([128 + 64, 256]);
    const post = rec.drawImages.find((d) => sourceOf(d).category === "curbPost");
    expect(post?.w).toBeCloseTo(128 * 0.24);
    expect(post!.x + post!.w / 2).toBeCloseTo(256);
    expect(post!.y + post!.h / 2).toBeCloseTo(256);
  });
});
describe("curbs on the map", () => {
  const floorCell = { floor: ref };
  const lake = () => {
    const layers = emptyLayers();
    for (const [x, y] of [[2, 2], [2, 1], [2, 3]]) layers.floor[cellKey(x, y)] = floorCell;
    layers.terrain[cellKey(2, 2)] = water;
    return layers;
  };

  it("draws a curb as painted where the water is below it, and turned a half where it is above", () => {
    const { input: i, rec } = input(makeRuntime(PACK, { categoryCounts: { curbH: 1 } }), { layers: lake() });
    drawMapContent(i);
    const curbs = rec.drawImages.filter((d) => sourceOf(d)?.category === "curbH");
    expect(curbs).toHaveLength(2);
    // the top bank (water south of it) is drawn as painted; the bottom bank (water north) is turned 180 degrees
    expect(rec.rotates).toEqual([Math.PI]);
  });

  it("sinks water below stone banks but not below flush ones (surf on a beach)", () => {
    const sunk = (rt: TilePackRuntime) => {
      const { input: i, rec } = input(rt, { layers: lake() });
      drawMapContent(i);
      return rec.gradients.length;
    };
    expect(sunk(makeRuntime(PACK, { categoryCounts: { curbH: 1 } }))).toBeGreaterThan(0);
    expect(sunk(makeRuntime(PACK, { categoryCounts: { curbH: 1 }, flush: ["curbH", "curbV"] }))).toBe(0);
  });

  it("leaves a pack's flush curbs out of the shadows, and keeps a stone lip's", () => {
    const shadowCats = (rt: TilePackRuntime) => {
      const f = makeLayerFactory();
      const { input: i } = input(rt, { layers: lake(), shadows: true, makeCanvas: f.makeCanvas });
      renderShadowLayer(i);
      return cats(f.layers[2].rec);
    };
    expect(shadowCats(makeRuntime(PACK, { categoryCounts: { curbH: 1 } }))).toContain("curbH");
    expect(shadowCats(makeRuntime(PACK, { categoryCounts: { curbH: 1 }, flush: ["curbH", "curbV", "curbPost"] }))).not.toContain("curbH");
  });
});


describe("decals and stairs", () => {
  it("draws a wall's decal over it, turned on a V wall", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { wallN: { ...ref, type: "wall", decal: 2 }, wallW: { ...ref, type: "wall", decal: 1 } };
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
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" } };
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
    // layer 0 is the output; then raised, low, standing, flat
    const [, raised, , standing, flat] = f.layers;
    expect(cats(raised.rec)).toEqual(expect.arrayContaining(["solidBlock", "wallSegmentH"]));
    expect(cats(raised.rec)).not.toContain("objectChest");
    expect(cats(standing.rec)).toEqual(["objectChest"]);
    expect(cats(flat.rec)).toEqual(["rubble"]);
    for (const l of f.layers) expect(cats(l.rec)).not.toContain("stairsUp");
    // 3 casts + 4 occlusion passes, drawn on the output layer
    expect(f.layers[0].rec.shadowDraws).toHaveLength(7);
    expect(f.layers[0].rec.shadowDraws.filter((d) => d.blur === 128 * 0.03)).toHaveLength(4);
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
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" } };
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

