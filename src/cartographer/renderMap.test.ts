import { describe, it, expect, vi } from "vitest";
import { putWall } from "./testWalls";
import { convertCellGround } from "./groundRegions";
import * as lightMaskModule from "./lightMask";
import { renderMap, type MapRenderScene } from "./renderMap";
import { emptyLayers, cellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { DressingCatalog } from "./dressing";
import { makeCtx, makeLayerFactory, makeRuntime, sourceOf, type Recorder } from "./testCanvas";

// Counts real mask computations (the wrapped function still runs).
vi.mock("./lightMask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lightMask")>();
  return { ...actual, lightMask: vi.fn(actual.lightMask) };
});
const maskCalls = (): number => vi.mocked(lightMaskModule.lightMask).mock.calls.length;

// Fixture ingestion is one-time, just as saved rows convert once before rendering. The same source identity must
// survive hover/pan renders so these tests still exercise the renderer's real caches.
const sourceFixtures = new WeakMap<DungeonMapLayers, DungeonMapLayers>();
function sourceLayers(layers: DungeonMapLayers): DungeonMapLayers {
  const existing = sourceFixtures.get(layers);
  if (existing) return existing;
  let id = 0;
  const converted = convertCellGround(layers, () => `fixture-${id++}`);
  sourceFixtures.set(layers, converted);
  return converted;
}

function baseScene(overrides: Partial<MapRenderScene> = {}): { scene: MapRenderScene; rec: Recorder } {
  const { ctx, rec } = makeCtx();
  const scene: MapRenderScene = {
    ctx,
    canvasWidth: 800,
    canvasHeight: 600,
    tilePx: 64,
    viewportOffset: { x: 0, y: 0 },
    bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    metadata: {},
    glyphs: {},
    runtimes: new Map(),
    fallbackRuntime: null,
    currentPackId: "stone-dungeon",
    activeTool: "floor",
    viewMode: false,
    hoveredEdge: null,
    hoverCell: null,
    selectedCell: null,
    previewCells: new Set(),
    dressing: new Map(),
    gridAlpha: 0.06,
    ...overrides,
    // These fixtures represent saved cell layers; authoring and rendering consume their converted sources.
    layers: sourceLayers(overrides.layers ?? emptyLayers()),
  };
  return { scene, rec };
}

describe("renderMap — empty map", () => {
  it("draws the background fill and the grid, and no tiles", () => {
    const { scene, rec } = baseScene();
    renderMap(scene);

    expect(rec.fillStyles[0]).toBe("rgb(20, 18, 16)");
    expect(rec.fillRects[0]).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(rec.calls).toContain("stroke"); // grid overlay
    expect(rec.drawImages).toHaveLength(0);
  });
});

describe("renderMap: the Grid switch", () => {
  it("draws no grid lines at all when the grid is switched off", () => {
    const { scene, rec } = baseScene({ gridAlpha: null });
    renderMap(scene);
    expect(rec.calls).not.toContain("stroke");
  });

  it("strokes the grid at the strength it is given, so Bold is stronger than Faint", () => {
    const faint = baseScene({ gridAlpha: 0.06 });
    renderMap(faint.scene);
    const bold = baseScene({ gridAlpha: 0.36 });
    renderMap(bold.scene);
    expect(faint.rec.strokeStyles[0]).toBe("rgba(255, 255, 255, 0.06)");
    expect(bold.rec.strokeStyles[0]).toBe("rgba(255, 255, 255, 0.36)");
  });
});

describe("renderMap: brush cursor", () => {
  it("draws a circle at the pointer while the brush is active, dashed when erasing", () => {
    const { scene, rec } = baseScene({ activeTool: "brush", brushPreview: { x: 1.5, y: 2.5, radius: 1.5, erase: false } });
    renderMap(scene);
    expect(rec.calls).toContain("arc");

    const erasing = baseScene({ activeTool: "brush", brushPreview: { x: 1.5, y: 2.5, radius: 1.5, erase: true } });
    renderMap(erasing.scene);
    expect(erasing.rec.calls).toContain("setLineDash");
  });

  it("draws none for another tool", () => {
    const { scene, rec } = baseScene({ activeTool: "floor", brushPreview: { x: 1, y: 1, radius: 1, erase: false } });
    renderMap(scene);
    expect(rec.calls).not.toContain("arc");
  });
});

describe("renderMap — viewport culling", () => {
  it("draws a floor cell inside bounds at x*tilePx - viewportOffset.x", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    const { scene, rec } = baseScene({
      layers,
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      viewportOffset: { x: 10, y: 20 },
      tilePx: 64,
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    });
    renderMap(scene);

    const floorDraws = rec.drawImages.filter((d) => sourceOf(d).category === "floor");
    expect(floorDraws).toHaveLength(1);
    expect(floorDraws[0]).toMatchObject({ x: 2 * 64 - 10, y: 3 * 64 - 20, w: 64, h: 64 });
  });

  it("does not draw a floor cell outside bounds", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(50, 50)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    const { scene, rec } = baseScene({
      layers,
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
    });
    renderMap(scene);

    expect(rec.drawImages.filter((d) => sourceOf(d).category === "floor")).toHaveLength(0);
  });
});

describe("renderMap — layer ordering", () => {
  it("draws the solidBlock layer above the floor layer for the same cell", () => {
    const layers = emptyLayers();
    const k = cellKey(1, 1);
    layers.floor[k] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    layers.solidBlock[k] = { pack_id: "stone-dungeon", pack_version: 1, variant: 0 };
    const { scene, rec } = baseScene({
      layers,
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
    });
    renderMap(scene);

    const categories = rec.drawImages.map((d) => sourceOf(d).category);
    const floorIdx = categories.indexOf("floor");
    const solidIdx = categories.indexOf("solidBlock");
    expect(floorIdx).toBeGreaterThanOrEqual(0);
    expect(solidIdx).toBeGreaterThan(floorIdx);
  });
});

describe("renderMap — hazard/feature glyph layer (#804)", () => {
  it("draws a glyph against the current pack at variant 0", () => {
    const { scene, rec } = baseScene({
      glyphs: { [cellKey(2, 2)]: "hazardPit" },
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      currentPackId: "stone-dungeon",
    });
    renderMap(scene);

    const glyphDraws = rec.drawImages.filter((d) => sourceOf(d).category === "hazardPit");
    expect(glyphDraws).toHaveLength(1);
    expect(sourceOf(glyphDraws[0]!)).toMatchObject({ pack: "stone-dungeon", variant: 0 });
    expect(glyphDraws[0]).toMatchObject({ x: 2 * 64, y: 2 * 64, w: 64, h: 64 });
  });

  it("draws nothing for a cell with no glyph entry", () => {
    const { scene, rec } = baseScene({
      glyphs: {},
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
    });
    renderMap(scene);

    expect(rec.drawImages).toHaveLength(0);
  });

  it("falls back to fallbackRuntime when the current pack isn't loaded", () => {
    const { scene, rec } = baseScene({
      glyphs: { [cellKey(0, 0)]: "featureAltar" },
      // Non-empty so the `runtimes.size > 0` gate opens; "missing-pack" is
      // deliberately absent from it so the glyph must resolve via fallback.
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      fallbackRuntime: makeRuntime("fallback-pack"),
      currentPackId: "missing-pack",
    });
    renderMap(scene);

    const glyphDraws = rec.drawImages.filter((d) => sourceOf(d).category === "featureAltar");
    expect(glyphDraws).toHaveLength(1);
    expect(sourceOf(glyphDraws[0]!).pack).toBe("fallback-pack");
  });

  it("draws the glyph above the object layer for the same cell", () => {
    const layers = emptyLayers();
    const k = cellKey(1, 1);
    layers.object[k] = { pack_id: "stone-dungeon", pack_version: 1, variant: 0, category: "objectChest" };
    const { scene, rec } = baseScene({
      layers,
      glyphs: { [k]: "hazardPit" },
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
    });
    renderMap(scene);

    const categories = rec.drawImages.map((d) => sourceOf(d).category);
    expect(categories.indexOf("hazardPit")).toBeGreaterThan(categories.indexOf("objectChest"));
  });
});

describe("renderMap — runtime fallback rule", () => {
  it("falls back to fallbackRuntime when a cell's pack_id isn't in runtimes", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(0, 0)] = { floor: { pack_id: "missing-pack", pack_version: 1, variant: 0 } };
    const { scene, rec } = baseScene({
      layers,
      // Non-empty so the `runtimes.size > 0` gate opens; "missing-pack" is
      // deliberately absent from it so the cell must resolve via fallback.
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      fallbackRuntime: makeRuntime("fallback-pack"),
    });
    renderMap(scene);

    const floorDraws = rec.drawImages.filter((d) => sourceOf(d).category === "floor");
    expect(floorDraws).toHaveLength(1);
    expect(sourceOf(floorDraws[0]).pack).toBe("fallback-pack");
  });

  it("draws nothing when both the cell's pack and the fallback runtime are missing", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(0, 0)] = { floor: { pack_id: "missing-pack", pack_version: 1, variant: 0 } };
    const { scene, rec } = baseScene({
      layers,
      runtimes: new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]),
      fallbackRuntime: null,
    });
    renderMap(scene);

    expect(rec.drawImages.filter((d) => sourceOf(d).category === "floor")).toHaveLength(0);
  });
});

describe("renderMap: Dressing layer (#1062)", () => {
  const art = (name: string): CanvasImageSource => ({ name }) as unknown as CanvasImageSource;
  const catalog: DressingCatalog = new Map([
    ["table", { id: "table", name: "Table", footprint_w: 2, footprint_h: 1, image: art("table"), flat: false, light: null, url: null, sway: null }],
    ["bed", { id: "bed", name: "Bed", footprint_w: 1, footprint_h: 2, image: art("bed"), flat: false, light: null, url: null, sway: null }],
    ["bare", { id: "bare", name: "Bare", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null }],
  ]);

  it("draws a prop's image over its whole footprint, at the anchor cell", () => {
    const layers = emptyLayers();
    layers.dressing.a = { prop_id: "table", x: 1, y: 2, rotation: 0, z: 0 };
    const { scene, rec } = baseScene({ layers, dressing: catalog });
    renderMap(scene);
    const call = rec.drawImages.find((c) => (c.source as { name?: string }).name === "table")!;
    expect(call.w).toBe(128);
    expect(call.h).toBe(64);
    expect(rec.translates).toContainEqual([64 + 64, 2 * 64 + 32]);
  });

  it("draws a footprint placeholder when the prop has no image", () => {
    const layers = emptyLayers();
    layers.dressing.a = { prop_id: "bare", x: 0, y: 0, rotation: 0, z: 0 };
    const { scene, rec } = baseScene({ layers, dressing: catalog });
    renderMap(scene);
    expect(rec.roundRects).toBe(1);
    expect(rec.drawImages).toHaveLength(0);
  });

  it("draws a placement whose prop is missing from the catalog as a placeholder", () => {
    const layers = emptyLayers();
    layers.dressing.a = { prop_id: "gone", x: 0, y: 0, rotation: 0, z: 0 };
    const { scene, rec } = baseScene({ layers, dressing: catalog });
    renderMap(scene);
    expect(rec.roundRects).toBe(1);
  });

  it("draws in z order, not insertion order", () => {
    const layers = emptyLayers();
    layers.dressing.top = { prop_id: "bed", x: 0, y: 0, rotation: 0, z: 5 };
    layers.dressing.low = { prop_id: "table", x: 0, y: 0, rotation: 0, z: 1 };
    const { scene, rec } = baseScene({ layers, dressing: catalog });
    renderMap(scene);
    expect(rec.drawImages.map((c) => (c.source as { name: string }).name)).toEqual(["table", "bed"]);
  });

  it("draws above the stamped objects", () => {
    const layers = emptyLayers();
    layers.object[cellKey(0, 0)] = { pack_id: "p", pack_version: 1, variant: 0, category: "floor" as never };
    layers.dressing.a = { prop_id: "table", x: 0, y: 0, rotation: 0, z: 0 };
    const { scene, rec } = baseScene({ layers, dressing: catalog, runtimes: new Map([["p", makeRuntime("p")]]) });
    renderMap(scene);
    const names = rec.drawImages.map((c) => (c.source as { name?: string }).name ?? "tile");
    expect(names.lastIndexOf("table")).toBeGreaterThan(names.indexOf("tile"));
  });

  it("culls a prop wholly outside the visible cells, and keeps one that reaches in", () => {
    const layers = emptyLayers();
    layers.dressing.far = { prop_id: "table", x: 20, y: 20, rotation: 0, z: 0 };
    layers.dressing.edge = { prop_id: "bed", x: -1, y: 0, rotation: 90, z: 1 };
    const { scene, rec } = baseScene({ layers, dressing: catalog });
    renderMap(scene);
    const names = rec.drawImages.map((c) => (c.source as { name: string }).name);
    expect(names).not.toContain("table");
    expect(names).toContain("bed");
  });

  it("draws the ghost translucent, and the selection outline", () => {
    const layers = emptyLayers();
    layers.dressing.a = { prop_id: "table", x: 0, y: 0, rotation: 0, z: 0 };
    const { scene, rec } = baseScene({
      layers,
      dressing: catalog,
      dressingGhost: { placement: { prop_id: "bed", x: 3, y: 3, rotation: 0, z: 0 }, alpha: 0.5 },
      selectedDressingId: "a",
    });
    renderMap(scene);
    const ghost = rec.drawImages.find((c) => (c.source as { name: string }).name === "bed")!;
    expect(ghost.alpha).toBe(0.5);
    expect(rec.strokeStyles).toContain("rgba(80,180,255,0.9)");
  });
});


describe("renderMap — shadow cache", () => {
  const stoneLayers = (): ReturnType<typeof emptyLayers> => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    putWall(layers, 1, 1, "N", { pack_id: "stone-dungeon", pack_version: 1, variant: 0, type: "wall" });
    return layers;
  };

  it("reuses the shadow layer across renders that differ only by hover, and rebuilds on an edit", () => {
    const f = makeLayerFactory();
    const layers = stoneLayers();
    const runtimes = new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]);
    const dressing: DressingCatalog = new Map();
    const scene = (overrides: Partial<MapRenderScene> = {}): MapRenderScene =>
      baseScene({ layers, runtimes, dressing, makeCanvas: f.makeCanvas, layersRevision: 1, ...overrides }).scene;

    renderMap(scene());
    const built = f.layers.length;
    expect(built).toBeGreaterThan(0);

    renderMap(scene({ hoverCell: [2, 2], selectedCell: [1, 1], previewCells: new Set([cellKey(3, 3)]) }));
    expect(f.layers).toHaveLength(built);

    renderMap(scene({ layersRevision: 2 }));
    expect(f.layers.length).toBeGreaterThan(built);
  });

  it("reuses the masked light glow across hover, and rebuilds it on an edit", () => {
    const f = makeLayerFactory();
    const layers = stoneLayers();
    layers.object[cellKey(2, 2)] = { pack_id: "stone-dungeon", pack_version: 1, category: "objectBrazier", variant: 0 };
    const rt = makeRuntime("stone-dungeon", { lights: { objectBrazier: [{ color: "#ff8030", bright: 20, dim: 20 }] } });
    const runtimes = new Map([["stone-dungeon", rt]]);
    const dressing: DressingCatalog = new Map();
    const scene = (overrides: Partial<MapRenderScene> = {}): MapRenderScene =>
      baseScene({ layers, runtimes, dressing, makeCanvas: f.makeCanvas, layersRevision: 1, ...overrides }).scene;
    const masks = (): number => f.layers.flatMap((l) => l.rec.putImages).length;

    renderMap(scene());
    expect(masks()).toBe(1);
    renderMap(scene({ hoverCell: [2, 2] }));
    expect(masks()).toBe(1);
    renderMap(scene({ layersRevision: 2 }));
    expect(masks()).toBe(2);
  });

  it("a pan rebuilds the light layer but recomputes no masks; an edit recomputes them", () => {
    const f = makeLayerFactory();
    const layers = stoneLayers();
    layers.object[cellKey(2, 2)] = { pack_id: "stone-dungeon", pack_version: 1, category: "objectBrazier", variant: 0 };
    const rt = makeRuntime("stone-dungeon", { lights: { objectBrazier: [{ color: "#ff8030", bright: 20, dim: 20 }] } });
    const runtimes = new Map([["stone-dungeon", rt]]);
    const dressing: DressingCatalog = new Map();
    const scene = (overrides: Partial<MapRenderScene> = {}): MapRenderScene =>
      baseScene({ layers, runtimes, dressing, makeCanvas: f.makeCanvas, layersRevision: 5, ...overrides }).scene;
    const puts = (): number => f.layers.flatMap((l) => l.rec.putImages).length;
    const base = maskCalls();
    renderMap(scene());
    const first = puts();
    expect(first).toBe(1);
    expect(maskCalls() - base).toBe(1);
    // A pan changes the window and offset: the layer is rebuilt (more canvases), the mask array is not recomputed.
    renderMap(scene({ viewportOffset: { x: 40, y: 12 }, bounds: { minX: 0, minY: 0, maxX: 6, maxY: 6 } }));
    expect(puts()).toBe(2);
    expect(maskCalls() - base).toBe(1);
    renderMap(scene({ layersRevision: 6 }));
    expect(maskCalls() - base).toBe(2);
  });

  it("rebuilds when the zoom or the window changes", () => {
    const f = makeLayerFactory();
    const layers = stoneLayers();
    const runtimes = new Map([["stone-dungeon", makeRuntime("stone-dungeon")]]);
    const dressing: DressingCatalog = new Map();
    const scene = (overrides: Partial<MapRenderScene>): MapRenderScene =>
      baseScene({ layers, runtimes, dressing, makeCanvas: f.makeCanvas, layersRevision: 1, ...overrides }).scene;
    renderMap(scene({}));
    const built = f.layers.length;
    renderMap(scene({ tilePx: 32 }));
    expect(f.layers.length).toBeGreaterThan(built);
  });
});

describe("renderMap: darkness veil", () => {
  const paintOne = () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    return layers;
  };
  const lantern = (id: string): DressingCatalog =>
    new Map([[id, { id, name: "Lantern", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: { color: "#ffaa33", bright: 10, dim: 10 }, url: null, sway: null }]]);

  /** A canvas factory with readable image data: what the veil painted, per sample. */
  function veilCanvas() {
    const all: { w: number; h: number; alpha: number[]; canvas: { veil?: boolean; mask?: boolean } }[] = [];
    const makeCanvas = (w: number, h: number) => {
      const { ctx } = makeCtx();
      const fake = ctx as unknown as Record<string, unknown>;
      fake.createImageData = (iw: number, ih: number) => ({ data: new Uint8ClampedArray(iw * ih * 4) });
      const canvas: { veil?: boolean; mask?: boolean } = {};
      const drawImage = fake.drawImage as (...a: unknown[]) => void;
      // A canvas drawn into another canvas is a light's mask, not the veil: the veil is drawn onto the map itself.
      fake.drawImage = (source: { mask?: boolean }, ...rest: unknown[]) => {
        source.mask = true;
        drawImage.call(ctx, source, ...rest);
      };
      fake.putImageData = (img: { data: Uint8ClampedArray }) => {
        canvas.veil = true;
        all.push({ w, h, canvas, alpha: Array.from({ length: w * h }, (_, i) => img.data[i * 4 + 3]) });
      };
      return { canvas: canvas as unknown as CanvasImageSource, ctx };
    };
    return {
      makeCanvas,
      get grids() {
        return all.filter((g) => !g.canvas.mask);
      },
    };
  }
  const veilDraws = (rec: Recorder) => rec.drawImages.filter((d) => (d.source as { veil?: boolean }).veil === true);

  it("lays the veil over the painted area only", () => {
    const v = veilCanvas();
    const { scene, rec } = baseScene({ layers: paintOne(), darkness: "dark", makeCanvas: v.makeCanvas });
    renderMap(scene);
    expect(veilDraws(rec).map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([{ x: 128, y: 192, w: 64, h: 64 }]);
    // One cell at 4 samples per cell, no light: the whole grid is the dark veil.
    expect(v.grids[0].w).toBe(4);
    expect(new Set(v.grids[0].alpha)).toEqual(new Set([Math.round(0.6 * 255)]));
  });

  it("casts no veil in daylight or on an empty map", () => {
    const day = veilCanvas();
    const a = baseScene({ layers: paintOne(), darkness: "daylight", makeCanvas: day.makeCanvas });
    renderMap(a.scene);
    expect(veilDraws(a.rec)).toHaveLength(0);
    const empty = veilCanvas();
    const b = baseScene({ darkness: "dark", makeCanvas: empty.makeCanvas });
    renderMap(b.scene);
    expect(veilDraws(b.rec)).toHaveLength(0);
  });

  it("leaves the veil to the animated one above while motion plays, so the lit edge can breathe", () => {
    const v = veilCanvas();
    const { scene, rec } = baseScene({ layers: paintOne(), darkness: "dark", makeCanvas: v.makeCanvas, omitLive: true });
    renderMap(scene);
    expect(veilDraws(rec)).toHaveLength(0);
  });

  it("the aids pass draws the editing aids and none of the map, the standing pass the map and none of the aids", () => {
    // While motion plays the aids sit on a canvas above the animated veil; drawn into the standing canvas they would be dimmed.
    const layers = paintOne();
    const aids = baseScene({ layers, darkness: "dark", activeTool: "link", selectedCell: [2, 3], pass: "aids", omitLive: true });
    renderMap(aids.scene);
    expect(aids.rec.calls.filter((c) => c === "strokeRect").length).toBeGreaterThan(0);
    expect(aids.rec.drawImages).toHaveLength(0);
    const standing = baseScene({ layers, darkness: "dark", activeTool: "link", selectedCell: [2, 3], pass: "standing", omitLive: true });
    renderMap(standing.scene);
    expect(standing.rec.calls.filter((c) => c === "strokeRect")).toHaveLength(0);
  });

  it("clears the veil around a light and keeps dim ambient at least dim", () => {
    const layers = emptyLayers();
    for (let x = 0; x < 6; x++) layers.floor[cellKey(x, 0)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    layers.dressing["lamp"] = { prop_id: "lamp", x: 0, y: 0, rotation: 0, z: 0 };
    const dark = veilCanvas();
    renderMap(baseScene({ layers, dressing: lantern("lamp"), darkness: "dark", makeCanvas: dark.makeCanvas }).scene);
    const alpha = dark.grids[0].alpha;
    expect(alpha[0]).toBe(0); // at the lamp: bright
    expect(alpha[alpha.length - 1]).toBe(Math.round(0.6 * 255)); // six cells off: beyond the 4-cell reach
    const dim = veilCanvas();
    renderMap(baseScene({ layers, dressing: lantern("lamp"), darkness: "dim", makeCanvas: dim.makeCanvas }).scene);
    expect(dim.grids[0].alpha[0]).toBe(0);
    expect(Math.max(...dim.grids[0].alpha)).toBe(Math.round(0.3 * 255));
  });

  it("reuses the light levels until the map is edited (the revision bumps) or its level changes", () => {
    const layers = emptyLayers();
    for (let x = 0; x < 8; x++) layers.floor[cellKey(x, 0)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    const dressing = lantern("lamp");
    const v = veilCanvas();
    const scene = (o: Partial<MapRenderScene> = {}): MapRenderScene =>
      baseScene({ layers, dressing, darkness: "dark", makeCanvas: v.makeCanvas, layersRevision: 1, ...o }).scene;
    renderMap(scene());
    const unlit = v.grids[0].alpha;
    // The editor paints into the same layers object: only the revision says it changed.
    layers.dressing["lamp"] = { prop_id: "lamp", x: 0, y: 0, rotation: 0, z: 0 };
    renderMap(scene({ viewportOffset: { x: 30, y: 12 }, hoverCell: [1, 1], tilePx: 32 }));
    expect(v.grids[1].alpha).toEqual(unlit);
    renderMap(scene({ layersRevision: 2 }));
    expect(v.grids[2].alpha).not.toEqual(unlit);
    renderMap(scene({ layersRevision: 2, darkness: "dim" }));
    expect(v.grids[3].alpha).not.toEqual(v.grids[2].alpha);
  });
});

describe("renderMap: grid and overlays", () => {
  it("draws a grid line on every cell boundary, the far side of the last cell included", () => {
    const { scene, rec } = baseScene({ bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 } });
    renderMap(scene);
    // vertical lines run the canvas height, horizontal ones its width
    const vertical = rec.points.filter(([, y], i, all) => y === 0 && all[i + 1]?.[1] === 600).map(([x]) => x);
    const horizontal = rec.points.filter(([x], i, all) => x === 0 && all[i + 1]?.[0] === 800).map(([, y]) => y);
    expect(vertical).toEqual([0, 64, 128, 192]);
    expect(horizontal).toEqual([0, 64, 128]);
  });

  it("draws nothing from the packs while none has loaded, even with a fallback to hand", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(0, 0)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    const { scene, rec } = baseScene({ layers, runtimes: new Map(), fallbackRuntime: makeRuntime("stone-dungeon") });
    renderMap(scene);
    expect(rec.drawImages).toHaveLength(0);
  });

  it("marks a cell with a note or an encounter by a dot, and a cell with neither not at all", () => {
    const dots = (metadata: MapRenderScene["metadata"]): number => {
      const { scene, rec } = baseScene({ metadata });
      renderMap(scene);
      return rec.calls.filter((c) => c === "arc").length;
    };
    expect(dots({ [cellKey(1, 1)]: { note_id: "n" } })).toBe(1);
    expect(dots({ [cellKey(1, 1)]: { encounter_id: "e" } })).toBe(1);
    expect(dots({ [cellKey(1, 1)]: { note_id: "n", encounter_id: "e" }, [cellKey(2, 2)]: { trap_id: "t" } })).toBe(1);
  });

  it("outlines the selected cell for the link and annotate tools only", () => {
    const outlines = (activeTool: MapRenderScene["activeTool"]): number => {
      const { scene, rec } = baseScene({ activeTool, selectedCell: [2, 2] });
      renderMap(scene);
      return rec.calls.filter((c) => c === "strokeRect").length;
    };
    const baseline = outlines("floor");
    expect(outlines("link")).toBe(baseline + 1);
    expect(outlines("annotate")).toBe(baseline + 1);
    expect(outlines("wall")).toBe(baseline);
  });

  describe("hover highlights", () => {
    const strokes = (over: Partial<MapRenderScene>): { styles: string[]; rects: number } => {
      const { scene, rec } = baseScene(over);
      renderMap(scene);
      return { styles: rec.strokeStyles, rects: rec.calls.filter((c) => c === "strokeRect").length };
    };
    const quiet = strokes({}).rects;

    // Erasing is drawn in red: a colour whose red channel clearly leads the other two.
    const reddish = (css: string): boolean => {
      const [r, g, b] = (css.match(/[\d.]+/g) ?? []).map(Number);
      return r! > g! + 80 && r! > b! + 80;
    };

    it("outlines the hovered cell for the floor and eraser tools, in red for the eraser only", () => {
      const floor = strokes({ activeTool: "floor", hoverCell: [1, 1] });
      const eraser = strokes({ activeTool: "eraser", hoverCell: [1, 1] });
      expect(floor.rects).toBe(quiet + 1);
      expect(eraser.rects).toBe(quiet + 1);
      expect(eraser.styles.some(reddish)).toBe(true);
      expect(floor.styles.some(reddish)).toBe(false);
    });

    it("outlines no cell for a wall tool, nor for the eraser while it is pointing at an edge", () => {
      expect(strokes({ activeTool: "wall", hoverCell: [1, 1] }).rects).toBe(quiet);
      expect(strokes({ activeTool: "eraser", hoverCell: [1, 1], hoveredEdge: { x: 1, y: 1, side: "N" } }).rects).toBe(quiet);
    });

    it("draws the hovered edge in red when erasing, and not otherwise", () => {
      const edge = { x: 1, y: 1, side: "N" } as const;
      expect(strokes({ activeTool: "wall", hoveredEdge: edge }).styles.some(reddish)).toBe(false);
      expect(strokes({ activeTool: "eraser", hoveredEdge: edge }).styles.some(reddish)).toBe(true);
    });
  });
});

// #1125 frames 16-17: while motion plays the editor draws two canvases with the live water between them.
describe("renderMap: the two passes under playing motion", () => {
  const ref = { pack_id: "p", pack_version: 1, variant: 0 };
  const SWAY = { amount: 4, speed: 1 };
  const twoPassScene = (over: Partial<MapRenderScene> = {}): { scene: MapRenderScene; rec: Recorder } => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    layers.object[cellKey(2, 2)] = { ...ref, category: "objectPillar", variant: 0 };
    putWall(layers, 1, 1, "N", { ...ref, type: "wall" });
    const runtime = makeRuntime("p", {
      sway: { objectPillar: [SWAY] },
      assets: { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }] },
    });
    return baseScene({ layers, runtimes: new Map([["p", runtime]]), currentPackId: "p", ...over });
  };
  const categories = (rec: Recorder): (string | undefined)[] => rec.drawImages.map((d) => sourceOf(d).category);

  it("the ground canvas holds the floor and none of what stands, so the live water can lie between them", () => {
    const { scene, rec } = twoPassScene({ pass: "ground", previewCells: new Set([cellKey(1, 1)]) });
    renderMap(scene);
    // The editing aids (a drag preview here) belong to the standing canvas above.
    expect(rec.fillRects).toEqual([{ x: 0, y: 0, w: 800, h: 600 }]);
    expect(categories(rec)).toContain("floor");
    expect(categories(rec).filter((c) => c !== "floor")).toEqual([]);
    expect(rec.fillStyles[0]).toBe("rgb(20, 18, 16)");
  });

  it("the standing canvas holds the walls and the standing objects and no floor, and does not paint a background over the ground", () => {
    const { scene, rec } = twoPassScene({ pass: "standing" });
    renderMap(scene);
    expect(categories(rec)).not.toContain("floor");
    expect(categories(rec).some((c) => c?.startsWith("wall"))).toBe(true);
    expect(categories(rec)).toContain("objectPillar");
    expect(rec.fillRects.some((r) => r.w === 800 && r.h === 600)).toBe(false);
    expect(rec.calls).toContain("clearRect"); // transparent, so the ground canvas shows through
  });

  it("omitLive leaves a swaying prop to the live layer so it is never drawn twice", () => {
    const still = twoPassScene({ pass: "standing", omitLive: true });
    renderMap(still.scene);
    expect(categories(still.rec)).not.toContain("objectPillar");
    const plain = twoPassScene({ pass: "standing" });
    renderMap(plain.scene);
    expect(categories(plain.rec)).toContain("objectPillar");
  });

  it("without a pass the whole map is one canvas, as before", () => {
    const { scene, rec } = twoPassScene();
    renderMap(scene);
    const c = categories(rec);
    expect(c).toContain("floor");
    expect(c).toContain("objectPillar");
    expect(c.indexOf("floor")).toBeLessThan(c.indexOf("objectPillar"));
  });
});
