import { describe, it, expect } from "vitest";
import { renderMap, type MapRenderScene } from "./renderMap";
import { BASE_TILE_SIZE, type PackCategory } from "@/cartographer/packSchema";
import type { TilePackManifest } from "@/cartographer/packSchema";
import type { ValidationResult } from "@/cartographer/validatePack";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";

// ── Fake canvas context ─────────────────────────────────────────────────────
// happy-dom's canvas.getContext("2d") returns null, and even a real one would
// only tell us pixels were painted, not why. Recording the calls made against
// a narrow structural stand-in for CanvasRenderingContext2D lets these tests
// assert layer ordering and the viewport-culling arithmetic directly, without
// touching pixels — same idiom as src/lib/tokenRenderer.test.ts.

interface DrawImageCall {
  source: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FakeCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  textAlign: string;
  textBaseline: string;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(source: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
}

interface Recorder {
  calls: string[];
  fillRects: { x: number; y: number; w: number; h: number }[];
  drawImages: DrawImageCall[];
  fillStyles: string[];
  strokeStyles: string[];
}

function makeCtx(): { ctx: CanvasRenderingContext2D; rec: Recorder } {
  const rec: Recorder = { calls: [], fillRects: [], drawImages: [], fillStyles: [], strokeStyles: [] };
  let fillStyle = "";
  let strokeStyle = "";
  const noop = (): void => {};
  const fake: FakeCtx = {
    imageSmoothingEnabled: true,
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "start",
    textBaseline: "alphabetic",
    font: "",
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; rec.fillStyles.push(v); },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; rec.strokeStyles.push(v); },
    fillRect: (x, y, w, h) => { rec.calls.push("fillRect"); rec.fillRects.push({ x, y, w, h }); },
    strokeRect: () => rec.calls.push("strokeRect"),
    drawImage: (source, x, y, w, h) => {
      rec.calls.push("drawImage");
      rec.drawImages.push({ source, x, y, w, h });
    },
    beginPath: () => rec.calls.push("beginPath"),
    moveTo: () => rec.calls.push("moveTo"),
    lineTo: () => rec.calls.push("lineTo"),
    stroke: () => rec.calls.push("stroke"),
    fill: () => rec.calls.push("fill"),
    arc: () => rec.calls.push("arc"),
    save: () => rec.calls.push("save"),
    restore: () => rec.calls.push("restore"),
    translate: noop,
    rotate: noop,
    fillText: () => rec.calls.push("fillText"),
  };
  return { ctx: fake as unknown as CanvasRenderingContext2D, rec };
}

// ── Fake tile pack runtime ──────────────────────────────────────────────────
// getTile's sentinel source carries the category it was drawn for, so a test
// can tell which layer produced a given drawImage call just by inspecting the
// recorded source — that's what makes the layer-ordering assertion possible
// without a real image.

interface TileSentinel {
  pack: string;
  category: PackCategory;
  variant: number;
  side?: string;
}

function makeRuntime(packId: string, opts: { variantCount?: number } = {}): TilePackRuntime {
  const manifest: TilePackManifest = {
    pack_id: packId,
    name: packId,
    description: "",
    pack_version: 1,
    schema_version: 2,
    base_tile_size: BASE_TILE_SIZE,
    assets: {},
  };
  const validation: ValidationResult = { valid: true, missing: [], extras: [], warnings: [] };
  return {
    manifest,
    validation,
    getTile: (category, variant, side) => ({
      source: { pack: packId, category, variant, side } satisfies TileSentinel as unknown as CanvasImageSource,
      isPlaceholder: false,
    }),
    variantCount: () => opts.variantCount ?? 0,
  };
}

function sourceOf(call: DrawImageCall): TileSentinel {
  return call.source as TileSentinel;
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
    layers: emptyLayers(),
    metadata: {},
    runtimes: new Map(),
    fallbackRuntime: null,
    currentPackId: "stone-dungeon",
    activeTool: "floor",
    viewMode: false,
    hoveredEdge: null,
    hoverCell: null,
    selectedCell: null,
    previewCells: new Set(),
    ...overrides,
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
