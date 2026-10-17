import { describe, it, expect } from "vitest";
import { drawMapContent } from "./drawMap";
import { gatherLightSources, renderLightLayer } from "./drawLights";
import type { DrawMapInput } from "./drawFrame";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";
import type { DressingCatalog } from "./dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { makeCtx, makeLayerFactory, makeRuntime, type Recorder } from "./testCanvas";

const PACK = "p";
const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

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

  it("lights the cell centre of an object whose variant declares a light", () => {
    const rec = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers: braziers(2, 3) });
    expect(rec.radialGradients).toHaveLength(1);
    expect(rec.radialGradients[0]).toMatchObject({ x0: 2.5 * 128, y0: 3.5 * 128, r0: 0, x1: 2.5 * 128, y1: 3.5 * 128, r1: 8 * 128 });
    expect(rec.radialGradients[0].stops).toEqual([
      [0, "rgba(255,128,48,0.6)"],
      [0.125, "rgba(255,128,48,0.33)"],
      [0.5, "rgba(255,128,48,0.132)"],
      [1, "rgba(255,128,48,0)"],
    ]);
    expect(rec.fillRects).toContainEqual({ x: 2.5 * 128 - 8 * 128, y: 3.5 * 128 - 8 * 128, w: 16 * 128, h: 16 * 128 });
  });

  it("translates by the origin and uses the default intensity", () => {
    const rec = lightsOf(lit({ objectBrazier: [null, { color: "#ffffff", bright: 5, dim: 5 }] }), { layers: braziers(1, 1), origin: { x: 64, y: 0 } });
    expect(rec.radialGradients[0]).toMatchObject({ x0: 1.5 * 128 - 64, y0: 1.5 * 128 });
    expect(rec.radialGradients[0].stops[0][1]).toBe("rgba(255,255,255,0.35)");
  });

  it("draws nothing for a null entry, a category without lights, or a variant past the list", () => {
    const layers = braziers(2, 2);
    expect(lightsOf(lit({ objectBrazier: [null, null] }), { layers }).radialGradients).toHaveLength(0);
    expect(lightsOf(lit({ objectChest: [FIRE] }), { layers }).radialGradients).toHaveLength(0);
    expect(lightsOf(lit({ objectBrazier: [FIRE] }), { layers }).radialGradients).toHaveLength(0);
    expect(lightsOf(makeRuntime(PACK), { layers }).radialGradients).toHaveLength(0);
  });

  it("lights a wall decal at its edge midpoint", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = {
      floor: ref,
      wallN: { ...ref, type: "wall", decal: 1 },
      wallW: { ...ref, type: "wall", decal: 0 },
    };
    const decalFire = { color: "#ffcc66", bright: 20, dim: 20 };
    const rec = lightsOf(lit({ wallDecal: [decalFire, { ...decalFire, color: "#ff0000" }] }), { layers });
    expect(rec.radialGradients.map((g) => [g.x0, g.y0, g.stops[0][1]])).toEqual([
      [2.5 * 128, 3 * 128, "rgba(255,0,0,0.35)"],
      [2 * 128, 3.5 * 128, "rgba(255,204,102,0.35)"],
    ]);
  });

  it("ignores a decal on something that is not a wall", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: ref, wallN: { ...ref, type: "doorClosed", decal: 0 } };
    expect(lightsOf(lit({ wallDecal: [FIRE] }), { layers }).radialGradients).toHaveLength(0);
  });

  it("lights from a dressing prop at its footprint centre, turned to the nearest quarter", () => {
    const layers = emptyLayers();
    layers.dressing.a = { prop_id: "brazier", x: 1, y: 1, rotation: 0, z: 0 };
    layers.dressing.b = { prop_id: "plain", x: 4, y: 4, rotation: 0, z: 0 };
    layers.dressing.c = { prop_id: "brazier", x: 3, y: 0, rotation: 90, z: 0 };
    const catalog: DressingCatalog = new Map([
      ["brazier", { id: "brazier", name: "B", footprint_w: 2, footprint_h: 1, image: null, flat: false, light: FIRE, url: null, sway: null }],
      ["plain", { id: "plain", name: "P", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null }],
    ]);
    const rec = lightsOf(makeRuntime(PACK), { layers, dressing: catalog });
    expect(rec.radialGradients.map((g) => [g.x0, g.y0])).toEqual([
      [2 * 128, 1.5 * 128],
      [3.5 * 128, 1 * 128],
    ]);
  });

  it("lets a source just outside the window light its edge, but not one beyond the longest range", () => {
    // The longest reach is 60 + 60 feet: 24 cells.
    const near = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers: braziers(-20, 2) });
    expect(near.radialGradients).toHaveLength(1);
    const far = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers: braziers(-25, 2) });
    expect(far.radialGradients).toHaveLength(0);
    const edge = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers: braziers(5 + 24, 2) });
    expect(edge.radialGradients).toHaveLength(1);
  });

  it("mixes neighbours: one gradient each, both additive", () => {
    const layers = braziers(1, 1);
    layers.object[cellKey(2, 1)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    const rec = lightsOf(lit({ objectBrazier: [null, FIRE] }), { layers });
    expect(rec.radialGradients).toHaveLength(2);
  });
});

describe("lights behind walls", () => {
  const FIRE = { color: "#ff8030", bright: 20, dim: 20, intensity: 0.6 };
  const rt = () => makeRuntime(PACK, { lights: { objectBrazier: [null, FIRE] } });
  // A brazier in cell (1,2); a wall down the x = 3 gridline from y = 0 to 5. `door` swaps the segment on row 2.
  const walled = (door?: "doorOpen" | "doorClosed") => {
    const layers = emptyLayers();
    layers.object[cellKey(1, 2)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    for (let y = 0; y <= 5; y++) {
      layers.floor[cellKey(3, y)] = { floor: ref, wallW: { ...ref, type: y === 2 && door ? door : "wall" } };
    }
    return layers;
  };
  /** The light's visibility mask, 24 samples across (cells 0..5 at four per cell) as rows of bytes. */
  const maskOf = (layers: ReturnType<typeof emptyLayers>) => {
    const f = makeLayerFactory();
    const { input: i } = input(rt(), { layers, lights: true, makeCanvas: f.makeCanvas });
    drawMapContent(i);
    const put = f.layers.flatMap((l) => l.rec.putImages);
    expect(put).toHaveLength(1);
    return { rows: (y: number) => put[0].alpha.slice(y * put[0].width, (y + 1) * put[0].width), width: put[0].width };
  };
  // The mask covers the light's whole square, here x -7..9 and y -6..10 (reach 8 around (1.5, 2.5)).
  const sampleX = (cell: number): number => Math.floor((cell + 7) * 4);
  const sampleY = (cell: number): number => Math.floor((cell + 6) * 4);

  it("leaves the far side of a wall untouched and lights the near side", () => {
    const m = maskOf(walled());
    const row = m.rows(sampleY(2.5));
    expect(row[sampleX(2.5)]).toBe(255);
    expect(row[sampleX(4.5)]).toBe(0);
    expect(m.rows(sampleY(0.5))[sampleX(4.5)]).toBe(0);
    expect(m.rows(sampleY(0.5))[sampleX(0.5)]).toBe(255);
  });

  it("lets glow through an open door but not a closed one", () => {
    const open = maskOf(walled("doorOpen"));
    expect(open.rows(sampleY(2.5))[sampleX(4.5)]).toBe(255);
    expect(open.rows(sampleY(0.5))[sampleX(4.5)]).toBe(0);
    const shut = maskOf(walled("doorClosed"));
    expect(shut.rows(sampleY(2.5))[sampleX(4.5)]).toBe(0);
  });

  it("lays the masked glow through the map's own canvas, built once for every light", () => {
    const f = makeLayerFactory();
    const layers = walled();
    layers.object[cellKey(0, 4)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    const { input: i } = input(rt(), { layers, lights: true, makeCanvas: f.makeCanvas });
    drawMapContent(i);
    expect(f.layers.flatMap((l) => l.rec.putImages)).toHaveLength(2);
  });

  it("uses a prebuilt light layer without rebuilding it", () => {
    const f = makeLayerFactory();
    const { input: i } = input(rt(), { layers: walled(), lights: true, makeCanvas: f.makeCanvas });
    const built = renderLightLayer(i);
    const count = f.layers.length;
    const again = input(rt(), { layers: walled(), lights: true, makeCanvas: f.makeCanvas, lightLayer: built });
    drawMapContent(again.input);
    expect(f.layers).toHaveLength(count);
  });

  it("skips the mask for a map with nothing to wall light off", () => {
    const f = makeLayerFactory();
    const layers = emptyLayers();
    layers.object[cellKey(1, 2)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    const { input: i } = input(rt(), { layers, lights: true, makeCanvas: f.makeCanvas });
    drawMapContent(i);
    expect(f.layers.flatMap((l) => l.rec.putImages)).toHaveLength(0);
    expect(f.layers.flatMap((l) => l.rec.radialGradients)).toHaveLength(1);
  });

  it("still draws the glow, unmasked, when no canvas can be made", () => {
    const { input: i, rec } = input(rt(), { layers: walled(), lights: true });
    drawMapContent(i);
    expect(rec.radialGradients).toHaveLength(1);
    expect(rec.fillRects.length).toBeGreaterThan(0);
  });
});

describe("gatherLightSources", () => {
  const FIRE = { color: "#ff8030", bright: 20, dim: 20 };
  const rt = makeRuntime(PACK, { lights: { objectBrazier: [null, FIRE], wallDecal: [FIRE] } });
  const gather = (layers: ReturnType<typeof emptyLayers>, reach: DrawMapInput["bounds"] | null, dressing: DressingCatalog = new Map()) =>
    gatherLightSources(layers, () => rt, dressing, reach);

  it("finds an object light at its cell centre", () => {
    const layers = emptyLayers();
    layers.object[cellKey(2, 3)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    expect(gather(layers, null)).toEqual([{ x: 2.5, y: 3.5, light: FIRE }]);
  });

  it("finds a wall decal at its edge midpoint, and ignores a decal on a door", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: ref, wallN: { ...ref, type: "wall", decal: 0 }, wallW: { ...ref, type: "doorClosed", decal: 0 } };
    expect(gather(layers, null)).toEqual([{ x: 2.5, y: 3, light: FIRE }]);
  });

  it("limits a windowed search to the window", () => {
    const layers = emptyLayers();
    layers.object[cellKey(1, 1)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    layers.object[cellKey(9, 9)] = { pack_id: PACK, pack_version: 1, category: "objectBrazier", variant: 1 };
    expect(gather(layers, { minX: 0, minY: 0, maxX: 3, maxY: 3 })).toHaveLength(1);
    expect(gather(layers, null)).toHaveLength(2);
  });
});
