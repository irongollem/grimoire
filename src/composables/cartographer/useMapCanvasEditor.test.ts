// Glue tests for the Cartographer's canvas engine. The pure pieces it wires
// together — CommandStack, pickVariant/hash32, zoomByFactor, detectHoveredEdge,
// the paintOps functions — all have their own colocated tests already
// (commandStack.test.ts, tileVariants.test.ts, viewport.test.ts,
// edgeHover.test.ts, paintOps.test.ts). This file is about the wiring itself:
// does a pointer event compute the right cell/edge and dispatch to the right
// op, does a stroke collapse into one undo command, does the dirty flag
// track edits, does the render loop thread the right values through.
//
// Canvas 2D is absent in the test DOM (happy-dom's getContext("2d") returns
// null), so canvasEl is a plain fake object whose getContext returns a
// truthy-but-inert stub — enough to get render() past its early-return — and
// "@/cartographer/renderMap" is mocked so the actual drawing never has to
// run against that stub. See src/lib/locations/planCanvas.test.ts for the
// sibling "record what a fake 2D context was asked to draw" approach; this
// file doesn't need that because renderMap itself is swapped out.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computed, defineComponent, h, nextTick, ref, type ComputedRef, type Ref } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { useMapCanvasEditor, type MapCanvasEditorOptions } from "./useMapCanvasEditor";
import {
  emptyLayers,
  type CellKey,
  type CellMetadata,
  type DungeonMapLayers,
} from "@/types/dungeonMap.types";
import type { PlaceItem, Tool } from "@/cartographer/tools";
import type { PackCategory } from "@/cartographer/packSchema";
import type { WallKind } from "@/cartographer/wallKinds";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { renderMap, type MapRenderReferenceImage } from "@/cartographer/renderMap";
import { pickVariant } from "@/cartographer/tileVariants";
import type { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";
import type { usePlanPalette } from "@/composables/cartographer/usePlanPalette";

vi.mock("@/cartographer/renderMap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/cartographer/renderMap")>();
  return { ...actual, renderMap: vi.fn() };
});

const mockedRenderMap = vi.mocked(renderMap);

// The Plan layer's own pointer dispatch (#884 review finding 2 — see the
// "Plan layer" describe block below). Mocked wholesale: this file exercises
// the Drawing's own wiring, and the one thing it needs to prove about the
// Plan here is that a layer switch calls `abandonGesture()` — everything
// else `usePlanCanvasTools` does has its own coverage in
// usePlanCanvasTools.ts's own consumers (`useRegionPointer.test.ts`).
const { abandonGestureMock } = vi.hoisted(() => ({ abandonGestureMock: vi.fn() }));
vi.mock("@/composables/cartographer/usePlanCanvasTools", () => ({
  usePlanCanvasTools: () => ({
    onPointerDown: vi.fn(() => false),
    onPointerMove: vi.fn(),
    onPointerLeave: vi.fn(),
    onDoubleClick: vi.fn(),
    dispose: vi.fn(),
    abandonGesture: abandonGestureMock,
    renderScene: vi.fn(() => ({
      regions: [], ways: [], activeRegionId: null, cellsOverride: undefined,
      hoveredDoorEdge: null, tracingRing: null, tracingClosed: false, tracingHoverPoint: null,
      templateDraft: null, templateRingPreview: [],
    })),
    renderDeps: {
      hoveredDoorEdge: ref(null), strokeCells: ref(null), draftRing: ref([]),
      templateDraft: ref(null), liveDrag: ref(null), penHoverPoint: ref(null),
    },
  }),
}));

/** A narrow stand-in for `usePlanPalette`'s return value — only what
 *  `useMapCanvasEditor` itself reads directly (the render-dep refs, and
 *  `undo.{undo,redo,canUndo,canRedo}`); `usePlanCanvasTools` is mocked above
 *  so nothing else here needs to behave like the real thing. */
function fakePlan(): ReturnType<typeof usePlanPalette> {
  const stub = {
    regions: ref([]),
    ways: ref([]),
    planTool: ref("space"),
    traceTool: ref("paint"),
    templateShape: ref("circle"),
    zoneKind: ref("terrain"),
    zoneLabel: ref(""),
    activeRegionId: ref(null),
    activeRegion: computed(() => null),
    undo: {
      push: vi.fn(),
      undo: vi.fn(async () => {}),
      redo: vi.fn(async () => {}),
      clear: vi.fn(),
      canUndo: ref(false),
      canRedo: ref(false),
      busy: ref(false),
    },
    isBusy: computed(() => false),
    startNewSpace: vi.fn(),
    startNewZone: vi.fn(),
    commitCells: vi.fn(),
    commitRing: vi.fn(async () => {}),
    commitTemplate: vi.fn(),
    confirmConvert: vi.fn(async () => true),
    claimFloorRegion: vi.fn(async () => {}),
    existingDoorAtEdge: vi.fn(() => null),
    placeDoorAt: vi.fn(),
    cycleDoorKind: vi.fn(),
    removeDoor: vi.fn(),
  };
  return stub as unknown as ReturnType<typeof usePlanPalette>;
}

// requestAnimationFrame runs synchronously so a watched-ref mutation's
// scheduled render happens immediately — happy-dom's own rAF is
// Immediate-based and would need real event-loop ticks to observe.
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
});

// ── Fakes ────────────────────────────────────────────────────────────────

function fakeCanvas(): HTMLCanvasElement {
  const el = {
    width: 0,
    height: 0,
    getContext: () => ({}) as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
  return el as unknown as HTMLCanvasElement;
}

/** variantCount fixed at 6 for every category unless overridden — matches
 *  tileVariants.test.ts's own fixture so expected numbers can be reused. */
function fakeRuntime(overrides: Partial<Record<PackCategory, number>> = {}): TilePackRuntime {
  const manifest: TilePackRuntime["manifest"] = {
    pack_id: "pack-1",
    name: "Test Pack",
    description: "",
    pack_version: 3,
    schema_version: 3,
    base_tile_size: BASE_TILE_SIZE,
    assets: {},
  };
  return {
    manifest,
    validation: { valid: true, missing: [], extras: [], warnings: [] },
    lastingUrls: true,
    getTile: vi.fn(),
    variantCount: (category) => overrides[category] ?? 6,
  };
}

/** A narrow stand-in for useCartographerStructure's return value — only the
 *  members useCartographerStructureTools actually touches (structure,
 *  selectedSpaceKey, spaceRows, selectSpaceAt, renameSpace), same approach as
 *  useCartographerStructureTools.test.ts's own fakeStructure(). Cast through
 *  the module's own return type via `unknown` rather than `any` so the fake
 *  stays structurally honest about what it's standing in for. */
function fakeStructure(): ReturnType<typeof useCartographerStructure> {
  const stub = {
    structure: ref({ spaces: [], ways: [], stairs: [], links: [] }),
    selectedSpaceKey: ref<string | null>(null),
    spaceRows: ref([]),
    selectSpaceAt: vi.fn(),
    renameSpace: vi.fn(() => false),
  };
  return stub as unknown as ReturnType<typeof useCartographerStructure>;
}

// A two-by-one table, so a hit can land on its second cell.
const DRESSING_CATALOG: DressingCatalog = new Map([
  ["table", { id: "table", name: "Table", footprint_w: 2, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null }],
]);

interface Harness {
  layers: Ref<DungeonMapLayers>;
  dirty: Ref<boolean>;
  editRevision: Ref<number>;
  activeTool: Ref<Tool>;
  canvasEl: Ref<HTMLCanvasElement | null>;
  editor: ReturnType<typeof useMapCanvasEditor>;
  placeItem: Ref<PlaceItem | null>;
  placeRotation: Ref<number>;
  selectedDressingId: Ref<string | null>;
  activeWallKind: Ref<WallKind>;
  activeWallDecal: Ref<number>;
  getReferenceImage: ReturnType<typeof vi.fn<(tilePx: number, offset: { x: number; y: number }) => MapRenderReferenceImage | null>>;
}

function makeHarness(over: Partial<MapCanvasEditorOptions> = {}): Harness {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const metadata = ref<Record<CellKey, CellMetadata>>({});
  const dirty = ref(false);
  const editRevision = ref(0);
  const activeTool = ref<Tool>("floor");
  const canvasEl = ref<HTMLCanvasElement | null>(fakeCanvas());
  const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
  const runtime = fakeRuntime();
  const packRuntime = computed(() => runtime) as ComputedRef<TilePackRuntime | null>;
  const getReferenceImage = vi.fn((): MapRenderReferenceImage | null => null);
  const placeItem = ref<PlaceItem | null>({ kind: "object", category: "objectChest", variant: "any" });
  const placeRotation = ref(0);
  const selectedDressingId = ref<string | null>(null);
  const activeWallKind = ref<WallKind>("wall");
  const activeWallDecal = ref(0);

  const opts: MapCanvasEditorOptions = {
    canvasEl,
    layers,
    metadata,
    dirty,
    editRevision,
    currentPackId: ref("pack-1"),
    darkness: ref("daylight"),
    packRuntime,
    selectablePacks: computed(() => [{ pack_id: "pack-1", pack_version: 3 }]),
    loadedRuntimes,
    dressing: ref(DRESSING_CATALOG),
    placeItem,
    selectedDressingId,
    cellGlyphs: computed(() => ({})),
    activeTool,
    tools: [
      { id: "floor", shortcut: "f" },
      { id: "wall", shortcut: "w" },
    ],
    viewMode: () => false,
    placeRotation,
    activeWallKind,
    activeWallDecal,
    activeTemplateShape: ref("circle"),
    brushRadius: ref(1.5),
    rectWalls: ref(true),
    selectedCell: ref(null),
    toolOptionsRef: ref(null),
    structure: fakeStructure(),
    mapKey: computed(() => "map-test"),
    getReferenceImage,
    extraRenderDeps: [],
    ...over,
  };

  const editor = useMapCanvasEditor(opts);
  return {
    layers, dirty, editRevision, activeTool, canvasEl, editor, getReferenceImage,
    placeItem, placeRotation, selectedDressingId, activeWallKind, activeWallDecal,
  };
}

function down(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y, pointerId: 1, ...init });
}
function move(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointermove", { clientX: x, clientY: y, pointerId: 1, ...init });
}
function up(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerup", { clientX: x, clientY: y, pointerId: 1, ...init });
}

// A click that starts and ends a stroke at the same cell — the shortest
// path through onPointerDown/onPointerUp that still pushes an undo command.
function clickCell(editor: ReturnType<typeof useMapCanvasEditor>, px: number, py: number): void {
  editor.onPointerDown(down(px, py));
  editor.onPointerUp(up(px, py));
}

// ── Undo / redo ──────────────────────────────────────────────────────────

describe("undo/redo", () => {
  it("a paint mutates layers and pushes one command", () => {
    const { editor, layers } = makeHarness();
    expect(editor.canUndo.value).toBe(false);
    clickCell(editor, 10, 10); // cell (0,0) at zoom 1 / offset 0
    expect(layers.value.floor["0,0" as CellKey]?.floor?.pack_id).toBe("pack-1");
    expect(editor.canUndo.value).toBe(true);
    expect(editor.canRedo.value).toBe(false);
  });

  it("undo restores the previous layers/metadata exactly", () => {
    const { editor, layers } = makeHarness();
    const before = JSON.parse(JSON.stringify(layers.value)) as DungeonMapLayers;
    clickCell(editor, 10, 10);
    expect(layers.value).not.toEqual(before);

    editor.undoEdit();
    expect(layers.value).toEqual(before);
    expect(editor.canUndo.value).toBe(false);
    expect(editor.canRedo.value).toBe(true);
  });

  it("undo leaves dirty true — the command's revert() marks dirty exactly like apply() does", () => {
    // pushCommand's revert() sets dirty.value = true unconditionally (same
    // as apply()): the module has no notion of "back to the saved state",
    // only "the layers just changed". Clearing dirty on save is the
    // caller's job (MapWorkbench.vue's markSaved/resetEdits — not part of
    // this composable, so not exercised here).
    const { editor, dirty } = makeHarness();
    clickCell(editor, 10, 10);
    expect(dirty.value).toBe(true);
    editor.undoEdit();
    expect(dirty.value).toBe(true);
  });

  it("redo reapplies the undone edit", () => {
    const { editor, layers } = makeHarness();
    clickCell(editor, 10, 10);
    const painted = JSON.parse(JSON.stringify(layers.value)) as DungeonMapLayers;
    editor.undoEdit();
    editor.redoEdit();
    expect(layers.value).toEqual(painted);
    expect(editor.canUndo.value).toBe(true);
    expect(editor.canRedo.value).toBe(false);
  });

  it("undo past the start is a safe no-op", () => {
    const { editor, layers } = makeHarness();
    const before = JSON.parse(JSON.stringify(layers.value)) as DungeonMapLayers;
    editor.undoEdit();
    editor.undoEdit();
    expect(layers.value).toEqual(before);
    expect(editor.canUndo.value).toBe(false);
  });

  it("redo past the end is a safe no-op", () => {
    const { editor, layers } = makeHarness();
    clickCell(editor, 10, 10);
    const painted = JSON.parse(JSON.stringify(layers.value)) as DungeonMapLayers;
    editor.redoEdit();
    editor.redoEdit();
    expect(layers.value).toEqual(painted);
    expect(editor.canRedo.value).toBe(false);
  });

  it("a new edit after an undo truncates the redo stack", () => {
    const { editor, layers } = makeHarness();
    clickCell(editor, 10, 10); // paint (0,0)
    editor.undoEdit();
    expect(editor.canRedo.value).toBe(true);

    clickCell(editor, 138, 10); // paint (1,0) instead — a different branch
    expect(editor.canRedo.value).toBe(false);

    editor.redoEdit(); // no-op: nothing left to redo
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeDefined();
  });
});

// ── Dirty flag ───────────────────────────────────────────────────────────

describe("dirty flag", () => {
  it("is false initially and true after an edit", () => {
    const { editor, dirty } = makeHarness();
    expect(dirty.value).toBe(false);
    clickCell(editor, 10, 10);
    expect(dirty.value).toBe(true);
  });

  it("stays false for a click that changes nothing (no command pushed)", () => {
    // eraser on an already-empty cell: eraseCell() is a no-op, so
    // pointerup's `before !== after` check never fires pushCommand.
    const { editor, dirty } = makeHarness({ activeTool: ref<Tool>("eraser") });
    clickCell(editor, 10, 10);
    expect(dirty.value).toBe(false);
    expect(editor.canUndo.value).toBe(false);
  });
});

// ── Viewport / cell math ─────────────────────────────────────────────────

describe("screen point -> cell", () => {
  it("maps to the expected cell at zoom 1 / zero pan offset", () => {
    const { editor } = makeHarness();
    editor.onPointerMove(move(200, 5)); // 200/128 -> 1, 5/128 -> 0
    expect(editor.hoverCell.value).toEqual([1, 0]);
  });

  it("maps to the expected cell at a non-1 zoom and a non-zero pan offset, and back", () => {
    const { editor } = makeHarness();
    editor.zoom.value = 2; // tile = 256 device-px
    editor.viewportOffset.value = { x: 100, y: 50 };

    // Pick a target cell, derive the screen point landing in its centre
    // under this exact zoom/offset, then confirm hoverCell recovers it —
    // the "and back" half of the round trip.
    const targetCell: [number, number] = [3, -1];
    const tilePx = BASE_TILE_SIZE * editor.zoom.value;
    const screenX = targetCell[0] * tilePx + tilePx / 2 - editor.viewportOffset.value.x;
    const screenY = targetCell[1] * tilePx + tilePx / 2 - editor.viewportOffset.value.y;

    editor.onPointerMove(move(screenX, screenY));
    expect(editor.hoverCell.value).toEqual(targetCell);
  });
});

describe("edge-hover targeting", () => {
  it("picks the nearest edge within 25% of a cell's side for an edge-aware tool", () => {
    const { editor, activeTool } = makeHarness();
    activeTool.value = "wall";
    // Cell (0,0) spans [0,128)x[0,128) at zoom 1 / offset 0. y=10 is 10px
    // from the top edge — well inside the 32px (25% of 128) threshold.
    editor.onPointerMove(move(64, 10));
    expect(editor.hoveredEdge.value).toEqual({ x: 0, y: 0, side: "N" });
  });

  it("leaves hoveredEdge null in the interior of a cell, past the threshold", () => {
    const { editor, activeTool } = makeHarness();
    activeTool.value = "wall";
    editor.onPointerMove(move(64, 64)); // dead centre — 64px from every edge
    expect(editor.hoveredEdge.value).toBeNull();
  });

  it("only tracks edge-hover for edge-aware tools (wall/door/eraser) — floor leaves it null even near an edge", () => {
    const { editor, activeTool } = makeHarness();
    activeTool.value = "floor";
    editor.onPointerMove(move(64, 10)); // same near-edge point as the "picks" case above
    expect(editor.hoveredEdge.value).toBeNull();
  });

  it("threads the zoom-dependent tile size into the (absolute-pixel) threshold", () => {
    const { editor, activeTool } = makeHarness();
    activeTool.value = "wall";
    // Same screen point, 40px above the nearest horizontal cell boundary.
    // At zoom 1 the tile is 128px (32px band) — 40px is outside it.
    editor.onPointerMove(move(64, 40));
    expect(editor.hoveredEdge.value).toBeNull();

    // At zoom 4 the tile is 512px (128px band) — the same 40px offset is
    // now comfortably inside it. The threshold has to scale with the
    // zoom-dependent tile size for this to snap.
    editor.zoom.value = 4;
    editor.onPointerMove(move(64, 40));
    expect(editor.hoveredEdge.value).toEqual({ x: 0, y: 0, side: "N" });
  });
});

// ── Deterministic variant picking ───────────────────────────────────────

describe("deterministic variant picking", () => {
  it('the painted floor variant matches pickVariant(mapKey, "floor", x, y, count) exactly', () => {
    const { editor, layers } = makeHarness();
    clickCell(editor, 300, 300); // cell (2,2)
    const expected = pickVariant("map-test", "floor", 2, 2, 6);
    expect(layers.value.floor["2,2" as CellKey]?.floor?.variant).toBe(expected);
  });

  it('the painted solid variant seeds on the literal "solid", not "solidBlock"', () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "solid";
    clickCell(editor, 300, 300); // cell (2,2)
    const expectedSolid = pickVariant("map-test", "solid", 2, 2, 6);
    const wrongIfMisseeded = pickVariant("map-test", "solidBlock", 2, 2, 6);
    expect(layers.value.solidBlock["2,2" as CellKey]?.variant).toBe(expectedSolid);
    // Only meaningful if the two seed strings actually diverge for this cell —
    // guards the assertion above against a false positive.
    expect(expectedSolid).not.toBe(wrongIfMisseeded);
  });

  it("the same cell and pack yield the same variant across independent instances — the property the renderer relies on", () => {
    const a = makeHarness();
    const b = makeHarness();
    clickCell(a.editor, 300, 300);
    clickCell(b.editor, 300, 300);
    expect(a.layers.value.floor["2,2" as CellKey]?.floor?.variant).toBe(
      b.layers.value.floor["2,2" as CellKey]?.floor?.variant,
    );
  });
});

// ── Per-tool paint dispatch ───────────────────────────────────────────────

describe("stroke painting", () => {
  it("a drag across several cells collapses into ONE undo command", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(10, 10)); // (0,0)
    editor.onPointerMove(move(138, 10)); // (1,0)
    editor.onPointerMove(move(266, 10)); // (2,0)
    editor.onPointerUp(up(266, 10));

    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["2,0" as CellKey]).toBeDefined();

    editor.undoEdit(); // one undo should revert every cell painted in the drag
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["2,0" as CellKey]).toBeUndefined();
    expect(editor.canUndo.value).toBe(false);
  });
});

describe("round brush", () => {
  it("paints discs along a drag, between the pointer samples, as ONE undo command", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "brush";
    editor.onPointerDown(down(64, 64)); // (0.5, 0.5)
    editor.onPointerMove(move(448, 64)); // (3.5, 0.5): a jump, the brush must fill the gap
    editor.onPointerUp(up(448, 64));

    for (const k of ["0,0", "1,0", "2,0", "3,0"] as CellKey[]) {
      expect(layers.value.floor[k]?.floor).toBeDefined();
    }
    expect(layers.value.area["0,0" as CellKey]?.mask).toBe("full");
    // A fractional edge: the disc reaches 1.5 cells either side of 0.5, so the row above is partial.
    expect(layers.value.area["0,-1" as CellKey]).toBeDefined();

    editor.undoEdit();
    expect(Object.keys(layers.value.floor)).toHaveLength(0);
    expect(Object.keys(layers.value.area)).toHaveLength(0);
    expect(editor.canUndo.value).toBe(false);
  });

  it("Alt erases what the brush painted", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "brush";
    clickCell(editor, 64, 64);
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();
    editor.onPointerDown(down(64, 64, { altKey: true }));
    editor.onPointerUp(up(64, 64, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
  });

  it("a stroke that changes nothing pushes no command", () => {
    const { editor, activeTool } = makeHarness();
    activeTool.value = "brush";
    editor.onPointerDown(down(64, 64, { altKey: true }));
    editor.onPointerUp(up(64, 64, { altKey: true }));
    expect(editor.canUndo.value).toBe(false);
  });
});

describe("terrain tool", () => {
  it("a drag paints water and its floor, and collapses into ONE undo command", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "terrain";
    editor.onPointerDown(down(10, 10)); // (0,0)
    editor.onPointerMove(move(138, 10)); // (1,0)
    editor.onPointerUp(up(138, 10));

    for (const k of ["0,0", "1,0"] as CellKey[]) {
      expect(layers.value.terrain[k]).toMatchObject({ pack_id: "pack-1" });
      expect(layers.value.floor[k]?.floor).toBeDefined();
    }
    expect(layers.value.terrain["0,0" as CellKey]?.variant).toBe(
      pickVariant("map-test", "terrain", 0, 0, 6),
    );

    editor.undoEdit();
    expect(layers.value.terrain["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.terrain["1,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(editor.canUndo.value).toBe(false);
  });

  it("Alt erases the water and keeps the floor", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "terrain";
    clickCell(editor, 10, 10);
    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerUp(up(10, 10, { altKey: true }));
    expect(layers.value.terrain["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();
  });

  it("the eraser takes the water before the floor", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "terrain";
    clickCell(editor, 10, 10);
    activeTool.value = "eraser";
    clickCell(editor, 10, 10);
    expect(layers.value.terrain["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();
    clickCell(editor, 10, 10);
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
  });
});

describe("wall kinds", () => {
  function hoverTopEdge(editor: Harness["editor"]): void {
    editor.onPointerMove(move(64, 10)); // the N edge of (0,0)
  }

  it.each([
    ["wall", "wallSegmentH"],
    ["grate", "edgeGrateH"],
    ["sluice", "edgeSluiceH"],
  ] as const)("paints a %s edge with variants from %s", (kind, category) => {
    const { editor, layers, activeTool, activeWallKind } = makeHarness();
    activeTool.value = "wall";
    activeWallKind.value = kind;
    hoverTopEdge(editor);
    clickCell(editor, 64, 10);
    const seg = layers.value.floor["0,0" as CellKey]?.wallN;
    expect(seg?.type).toBe(kind);
    expect(seg?.variant).toBe(pickVariant("map-test", category, 0, 0, 6));
  });

  it("Alt with a painted kind erases the edge", () => {
    const { editor, layers, activeTool, activeWallKind } = makeHarness();
    activeTool.value = "wall";
    activeWallKind.value = "grate";
    hoverTopEdge(editor);
    clickCell(editor, 64, 10);
    editor.onPointerDown(down(64, 10, { altKey: true }));
    editor.onPointerUp(up(64, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
  });

  it("Decal sets the chosen decal on an existing wall, and Alt removes it", () => {
    const { editor, layers, activeTool, activeWallKind, activeWallDecal } = makeHarness();
    activeTool.value = "wall";
    hoverTopEdge(editor);
    clickCell(editor, 64, 10);
    activeWallKind.value = "decal";
    activeWallDecal.value = 2;
    clickCell(editor, 64, 10);
    expect(layers.value.floor["0,0" as CellKey]?.wallN).toMatchObject({ type: "wall", decal: 2 });

    editor.onPointerDown(down(64, 10, { altKey: true }));
    editor.onPointerUp(up(64, 10, { altKey: true }));
    const wall = layers.value.floor["0,0" as CellKey]?.wallN;
    expect(wall?.type).toBe("wall");
    expect(wall?.decal).toBeUndefined();
  });

  it("Decal on an empty edge paints nothing and pushes no command", () => {
    const { editor, layers, activeTool, activeWallKind } = makeHarness();
    activeTool.value = "wall";
    activeWallKind.value = "decal";
    hoverTopEdge(editor);
    clickCell(editor, 64, 10);
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(editor.canUndo.value).toBe(false);
  });
});

describe("stamp categories", () => {
  it("a stairsUp stamp writes an object cell with that category and the stamp rotation", () => {
    const { editor, layers, activeTool, placeItem, placeRotation } = makeHarness();
    activeTool.value = "place";
    placeItem.value = { kind: "object", category: "stairsUp", variant: "any" };
    placeRotation.value = 90;
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toMatchObject({
      category: "stairsUp",
      rotation: 90,
      variant: pickVariant("map-test", "stairsUp", 0, 0, 6),
    });
  });
});

describe("place tool: objects", () => {
  it("a chosen variant is stamped as chosen, wherever the click lands", () => {
    const { editor, layers, activeTool, placeItem } = makeHarness();
    activeTool.value = "place";
    placeItem.value = { kind: "object", category: "objectBarrel", variant: 3 };
    clickCell(editor, 10, 10);
    clickCell(editor, 10 + BASE_TILE_SIZE, 10);
    expect(layers.value.object["0,0" as CellKey]).toMatchObject({ category: "objectBarrel", variant: 3 });
    expect(layers.value.object["1,0" as CellKey]).toMatchObject({ category: "objectBarrel", variant: 3 });
  });

  it("Any mixes the variants by position, as the stamp always did", () => {
    const { editor, layers, activeTool, placeItem } = makeHarness();
    activeTool.value = "place";
    placeItem.value = { kind: "object", category: "objectBarrel", variant: "any" };
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toMatchObject({
      variant: pickVariant("map-test", "objectBarrel", 0, 0, 6),
    });
  });

  it("a variant the active set does not have falls back to mixing", () => {
    const { editor, layers, activeTool, placeItem } = makeHarness();
    activeTool.value = "place";
    placeItem.value = { kind: "object", category: "objectBarrel", variant: 40 };
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toMatchObject({
      variant: pickVariant("map-test", "objectBarrel", 0, 0, 6),
    });
  });

  it("with an object in hand, a right-click takes an object away, and a prop above it goes first", () => {
    const { editor, layers, activeTool } = makeHarness();
    activeTool.value = "place";
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toBeDefined();
    editor.onPointerDown(down(10, 10, { button: 2 }));
    editor.onPointerUp(up(10, 10, { button: 2 }));
    expect(layers.value.object["0,0" as CellKey]).toBeUndefined();
    expect(editor.canUndo.value).toBe(true);
  });

  it("with nothing in hand, a click on empty ground stamps nothing", () => {
    const { editor, layers, activeTool, placeItem } = makeHarness();
    activeTool.value = "place";
    placeItem.value = null;
    clickCell(editor, 10, 10);
    expect(layers.value.object).toEqual({});
  });
});

describe("eraser tool priority", () => {
  it("erases the object in preference to the floor beneath it", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "place";
    clickCell(editor, 10, 10); // paint an object at (0,0)
    activeTool.value = "floor";
    clickCell(editor, 10, 10); // also floor it
    expect(layers.value.object["0,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();

    activeTool.value = "eraser";
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined(); // floor untouched — object took priority
  });

  it("erases the solid block in preference to the floor beneath it when there is no object", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "solid";
    clickCell(editor, 10, 10);
    activeTool.value = "floor";
    clickCell(editor, 10, 10);
    expect(layers.value.solidBlock["0,0" as CellKey]).toBeDefined();

    activeTool.value = "eraser";
    clickCell(editor, 10, 10);
    expect(layers.value.solidBlock["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();
  });

  it("erases an annotation on pointerdown (single click)", () => {
    const { editor, activeTool, layers } = makeHarness();
    layers.value.annotation["0,0" as CellKey] = { text: "Nave" };
    activeTool.value = "eraser";
    clickCell(editor, 10, 10);
    expect(layers.value.annotation["0,0" as CellKey]).toBeUndefined();
  });

  // context/features/cartographer.md documents the eraser priority as
  // object -> annotation -> solidBlock -> floor/edge, for the tool as a
  // whole — not just for the first cell of a stroke. onPointerDown's eraser
  // branch checks layers.annotation before falling through to
  // solidBlock/floor; onPointerMove's branch (driving every cell after the
  // first, i.e. a drag) must apply the same ladder or a drag that crosses
  // an annotated cell silently leaves that annotation behind.
  it("also erases an annotation reached mid-drag, not only on the stroke's first cell", () => {
    const { editor, activeTool, layers } = makeHarness();
    layers.value.annotation["1,0" as CellKey] = { text: "Nave" };
    activeTool.value = "eraser";

    editor.onPointerDown(down(10, 10)); // (0,0) — bare, nothing to erase there
    // (192, 64) is the CENTRE of cell (1,0) — deliberately far from any
    // edge, so the eraser's own edge-hover check (which the "eraser" tool
    // also participates in) doesn't pre-empt this with an edge erase.
    editor.onPointerMove(move(192, 64));
    editor.onPointerUp(up(192, 64));

    expect(layers.value.annotation["1,0" as CellKey]).toBeUndefined();
  });
});

describe("one-shot tools", () => {
  it("wrap-walls on a cell with no floor does nothing and pushes no undo step", () => {
    const { editor, activeTool, layers } = makeHarness();
    layers.value.floor["5,5" as CellKey] = { floor: { pack_id: "pack-1", pack_version: 3, variant: 0 } };
    activeTool.value = "wrap";
    clickCell(editor, 10, 10); // (0,0): empty
    expect(layers.value.floor["5,5" as CellKey]?.wallN).toBeUndefined();
    expect(editor.canUndo.value).toBe(false);
  });

  it("wrap-walls places boundary walls around an existing floor region as a single undo step", () => {
    const { editor, activeTool, layers } = makeHarness();
    // Paint a 2x2 floor block by hand (bypassing pointer dispatch — the
    // point of this test is applyWrapWalls, not the floor tool).
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      layers.value.floor[`${x},${y}` as CellKey] = { floor: { pack_id: "pack-1", pack_version: 3, variant: 0 } };
    }
    expect(editor.canUndo.value).toBe(false); // manual setup above pushed nothing

    activeTool.value = "wrap";
    editor.onPointerDown(down(10, 10)); // inside cell (0,0), part of the region
    // One-shot tools apply on pointerdown alone — a trailing pointerup must
    // not push a second command.
    editor.onPointerUp(up(10, 10));

    expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeDefined();
    expect(layers.value.floor["0,0" as CellKey]?.wallW).toBeDefined();
    expect(editor.canUndo.value).toBe(true);

    editor.undoEdit();
    expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeUndefined();
    expect(layers.value.floor["0,0" as CellKey]?.wallW).toBeUndefined();
    expect(editor.canUndo.value).toBe(false); // the whole wrap reverted in one step
  });
});

// ── centerMap ────────────────────────────────────────────────────────────

describe("centerMap", () => {
  it("centres the viewport on the origin tile for an empty map", () => {
    const { editor, canvasEl } = makeHarness();
    canvasEl.value!.width = 800;
    canvasEl.value!.height = 600;
    editor.centerMap();
    // cx = cy = 0.5 (origin tile centre) at zoom 1 / tile 128.
    expect(editor.viewportOffset.value).toEqual({ x: 0.5 * 128 - 400, y: 0.5 * 128 - 300 });
  });

  it("centres the viewport on the bounding box of every painted floor cell", () => {
    const { editor, layers, canvasEl } = makeHarness();
    canvasEl.value!.width = 800;
    canvasEl.value!.height = 600;
    layers.value.floor["0,0" as CellKey] = { floor: { pack_id: "pack-1", pack_version: 3, variant: 0 } };
    layers.value.floor["3,1" as CellKey] = { floor: { pack_id: "pack-1", pack_version: 3, variant: 0 } };

    editor.centerMap();
    // bbox x: [0,3] -> cx = (0+3+1)/2 = 2; bbox y: [0,1] -> cy = (0+1+1)/2 = 1.
    expect(editor.viewportOffset.value).toEqual({ x: 2 * 128 - 400, y: 1 * 128 - 300 });
  });
});

// ── onWheel ──────────────────────────────────────────────────────────────

describe("onWheel", () => {
  // happy-dom's WheelEvent drops the modifier fields of its init dict, so the
  // event is a plain object carrying just what the handler reads.
  function wheel(over: Partial<Record<"deltaX" | "deltaY" | "ctrlKey" | "shiftKey", number | boolean>>): WheelEvent {
    return {
      clientX: 100, clientY: 100, deltaX: 0, deltaY: 0, deltaMode: 0,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over,
    } as unknown as WheelEvent;
  }

  it("a plain wheel scrolls the map and leaves the zoom alone", () => {
    const { editor } = makeHarness();
    editor.onWheel(wheel({ deltaY: 100 }));
    expect(editor.zoom.value).toBe(1);
    expect(editor.viewportOffset.value).toEqual({ x: 0, y: 100 });
  });

  it("Ctrl+wheel up zooms in, keeping the cursor's world point stationary", () => {
    const { editor } = makeHarness();
    editor.onWheel(wheel({ deltaY: -100, ctrlKey: true }));
    expect(editor.zoom.value).toBeGreaterThan(1);
    // The world point under the cursor (100, 100) at zoom 1 is (100, 100); it must still be.
    expect((editor.viewportOffset.value.x + 100) / editor.zoom.value).toBeCloseTo(100, 6);
    expect((editor.viewportOffset.value.y + 100) / editor.zoom.value).toBeCloseTo(100, 6);
  });

  it("Ctrl+wheel down zooms out", () => {
    const { editor } = makeHarness();
    editor.onWheel(wheel({ deltaY: 100, ctrlKey: true }));
    expect(editor.zoom.value).toBeLessThan(1);
  });
});

// ── Panning triggers ─────────────────────────────────────────────────────
// Middle, Space and the Pan tool pan; Shift does not, because it is the draw
// modifier now.

describe("what starts a pan", () => {
  it("a Shift+drag with a painting tool paints instead of panning", () => {
    const { editor, layers } = makeHarness();
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10, { shiftKey: true }));
    editor.onPointerMove(move(60, 10, { shiftKey: true }));
    editor.onPointerUp(up(60, 10, { shiftKey: true }));
    expect(editor.viewportOffset.value).toEqual(before);
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
  });

  it("a Shift+click with Select armed selects the cell rather than panning", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    editor.onPointerDown(down(10, 10, { shiftKey: true }));
    editor.onPointerUp(up(10, 10, { shiftKey: true }));
    expect(selectedCell.value).toEqual([0, 0]);
  });

  it("the middle button pans with any tool, painting nothing", () => {
    const { editor, layers } = makeHarness();
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10, { button: 1 }));
    editor.onPointerMove(move(60, 10, { button: 1 }));
    editor.onPointerUp(up(60, 10, { button: 1 }));
    expect(editor.viewportOffset.value).not.toEqual(before);
    expect(Object.keys(layers.value.floor)).toHaveLength(0);
  });

  it("the middle button pans even over the Link tool, which selects cells on a left click", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor } = makeHarness({ activeTool: ref<Tool>("link"), selectedCell });
    editor.onPointerDown(down(10, 10, { button: 1 }));
    editor.onPointerUp(up(10, 10, { button: 1 }));
    expect(selectedCell.value).toBeNull();
  });

  it("the Pan tool pans on a plain left drag", () => {
    const { editor } = makeHarness({ activeTool: ref<Tool>("pan") });
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10));
    editor.onPointerMove(move(60, 10));
    editor.onPointerUp(up(60, 10));
    expect(editor.viewportOffset.value).not.toEqual(before);
  });
});

// ── Render wiring (reference-image placement) ─────────────────────────────

describe("render wiring", () => {
  it("threads the current tilePx and viewportOffset into getReferenceImage", async () => {
    const { editor, getReferenceImage } = makeHarness();
    getReferenceImage.mockClear();
    editor.zoom.value = 1.5;
    editor.viewportOffset.value = { x: 42, y: 7 };
    await nextTick(); // flush the watcher -> scheduleRender -> (stubbed, synchronous) rAF -> render()

    expect(getReferenceImage).toHaveBeenCalled();
    const [tilePx, offset] = getReferenceImage.mock.calls.at(-1)!;
    expect(tilePx).toBeCloseTo(BASE_TILE_SIZE * 1.5); // dpr is 1 in the test DOM
    expect(offset).toEqual({ x: 42, y: 7 });
  });

  it("passes getReferenceImage's return value straight through to renderMap's scene", async () => {
    const fakeImage: MapRenderReferenceImage = {
      source: {} as CanvasImageSource,
      x: 1,
      y: 2,
      width: 10,
      height: 20,
      opacity: 0.2,
    };
    const { editor } = makeHarness({ getReferenceImage: vi.fn(() => fakeImage) });
    mockedRenderMap.mockClear();
    editor.zoom.value = 2;
    await nextTick();

    const lastCall = mockedRenderMap.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall![0].referenceImage).toBe(fakeImage);
  });
});

// ── editRevision (#884 review finding 1) ────────────────────────────────────
// The host's autosave debounce re-arms off this, not off `dirty` — `dirty`
// only reports its false→true edge, so a second edit while already `true`
// would otherwise go unnoticed. Every `dirty.value = true` site in this
// module funnels through `markDirty()`, which bumps both.

describe("editRevision", () => {
  it("bumps on every edit that marks dirty, not just the first", () => {
    // Not asserting an exact count: pushCommand's registered apply() (run
    // once immediately by CommandStack.apply, then again on every redo)
    // calls markDirty() itself on top of the direct paint call, so one
    // click legitimately bumps more than once. What finding 1 needs is that
    // it keeps bumping on a SECOND edit while `dirty` was already `true` —
    // a plain `watch(dirty, ...)` would miss that entirely.
    const { editor, editRevision } = makeHarness();
    expect(editRevision.value).toBe(0);

    clickCell(editor, 10, 10); // (0,0)
    const afterFirstClick = editRevision.value;
    expect(afterFirstClick).toBeGreaterThan(0);

    clickCell(editor, 138, 10); // (1,0) — dirty was already true; must still bump
    expect(editRevision.value).toBeGreaterThan(afterFirstClick);
  });

  it("also bumps on undo/redo, which mutate layers the same as a fresh edit", () => {
    const { editor, editRevision } = makeHarness();
    clickCell(editor, 10, 10);
    const afterPaint = editRevision.value;

    editor.undoEdit();
    expect(editRevision.value).toBeGreaterThan(afterPaint);

    const afterUndo = editRevision.value;
    editor.redoEdit();
    expect(editRevision.value).toBeGreaterThan(afterUndo);
  });

  it("does not bump for a click that changes nothing", () => {
    const { editor, editRevision } = makeHarness({ activeTool: ref<Tool>("eraser") });
    clickCell(editor, 10, 10); // eraser on an already-empty cell — no-op
    expect(editRevision.value).toBe(0);
  });
});

// ── Plan layer (#884 review finding 2) ──────────────────────────────────────
// A Space/Zone stroke, pen drag or template drag started on the Plan and
// released after switching to Drawing used to still commit — nothing tore
// down `useRegionPointer`'s window listeners on a layer switch, only on
// unmount. `abandonGesture()` (see usePlanCanvasTools.ts / useRegionPointer.ts)
// is what the switch below must call.

describe("Plan layer", () => {
  beforeEach(() => { abandonGestureMock.mockClear(); });

  it("abandons an in-flight Plan gesture when the active layer switches away from Plan", async () => {
    const activeLayer = ref<"drawing" | "plan">("plan");
    makeHarness({ plan: fakePlan(), activeLayer });
    await nextTick();

    activeLayer.value = "drawing";
    await nextTick();

    expect(abandonGestureMock).toHaveBeenCalledOnce();
  });

  it("undoes and redoes the Plan's own edits, and reports the Plan's own undo state, while the Plan layer is active", async () => {
    const plan = fakePlan();
    plan.undo.canUndo.value = true;
    const activeLayer = ref<"drawing" | "plan">("plan");
    const { editor } = makeHarness({ plan, activeLayer });
    // The Drawing has an edit of its own to undo, which a Plan undo must not touch.
    activeLayer.value = "drawing";
    clickCell(editor, 10, 10);
    activeLayer.value = "plan";
    await nextTick();
    editor.undoEdit();
    editor.redoEdit();
    expect(plan.undo.undo).toHaveBeenCalledTimes(1);
    expect(plan.undo.redo).toHaveBeenCalledTimes(1);
    expect(editor.canUndo.value).toBe(true);
    plan.undo.canUndo.value = false;
    expect(editor.canUndo.value).toBe(false);

    activeLayer.value = "drawing";
    expect(editor.canUndo.value).toBe(true);
    editor.undoEdit();
    expect(plan.undo.undo).toHaveBeenCalledTimes(1);
    expect(editor.canUndo.value).toBe(false);
  });

  it("does not abandon anything while staying on the Plan layer, or with no site at all", async () => {
    makeHarness(); // no `plan`/`activeLayer` — the standalone-route shape
    await nextTick();
    expect(abandonGestureMock).not.toHaveBeenCalled();
  });
});

// ── Touch: two fingers pan and pinch, one finger paints ─────────────────

describe("touch", () => {
  const touch = (id: number) => ({ pointerType: "touch", pointerId: id }) as PointerEventInit;
  const painted = (layers: Ref<DungeonMapLayers>) => Object.keys(layers.value.floor).length;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("one finger paints, after a short hold", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(10, 10, touch(1)));
    expect(painted(layers)).toBe(0);
    vi.advanceTimersByTime(100);
    expect(painted(layers)).toBe(1);
    editor.onPointerUp(up(10, 10, touch(1)));
    expect(editor.canUndo.value).toBe(true);
  });

  it("a quick tap still paints", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(10, 10, touch(1)));
    editor.onPointerUp(up(10, 10, touch(1)));
    expect(painted(layers)).toBe(1);
  });

  it("a finger that only wobbles keeps waiting, and paints once it has moved past the slop", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(10, 10, touch(1)));
    editor.onPointerMove(move(12, 10, touch(1))); // 2px: under the slop
    expect(painted(layers)).toBe(0);
    editor.onPointerMove(move(60, 10, touch(1)));
    expect(painted(layers)).toBeGreaterThan(0);
    editor.onPointerUp(up(60, 10, touch(1)));
  });

  it("a finger landing while a pinch is still settling is not a tool press", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(100, 100, touch(1)));
    editor.onPointerDown(down(200, 100, touch(2)));
    editor.onPointerUp(up(200, 100, touch(2))); // one finger left, the pinch still on
    editor.onPointerDown(down(300, 300, touch(3)));
    vi.advanceTimersByTime(500);
    editor.onPointerUp(up(300, 300, touch(3)));
    editor.onPointerUp(up(100, 100, touch(1)));
    expect(painted(layers)).toBe(0);
    expect(editor.canUndo.value).toBe(false);
  });

  it("two fingers pan and zoom instead of painting", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(100, 100, touch(1)));
    editor.onPointerDown(down(200, 100, touch(2)));
    editor.onPointerMove(move(50, 100, touch(1)));
    editor.onPointerMove(move(250, 100, touch(2)));
    vi.advanceTimersByTime(500);
    expect(editor.zoom.value).toBeCloseTo(2, 5);
    editor.onPointerUp(up(50, 100, touch(1)));
    editor.onPointerUp(up(250, 100, touch(2)));
    expect(painted(layers)).toBe(0);
    expect(editor.canUndo.value).toBe(false);
  });

  it("a second finger arriving mid-stroke rolls the stroke back", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(10, 10, touch(1)));
    vi.advanceTimersByTime(100);
    editor.onPointerMove(move(60, 10, touch(1)));
    expect(painted(layers)).toBeGreaterThan(0);
    editor.onPointerDown(down(200, 200, touch(2)));
    expect(painted(layers)).toBe(0);
    editor.onPointerUp(up(60, 10, touch(1)));
    editor.onPointerUp(up(200, 200, touch(2)));
    expect(painted(layers)).toBe(0);
    expect(editor.canUndo.value).toBe(false);
  });

  it("the last finger of a pinch does not paint on its way out", () => {
    const { editor, layers } = makeHarness();
    editor.onPointerDown(down(100, 100, touch(1)));
    editor.onPointerDown(down(200, 100, touch(2)));
    editor.onPointerUp(up(200, 100, touch(2)));
    editor.onPointerMove(move(10, 10, touch(1)));
    vi.advanceTimersByTime(500);
    editor.onPointerUp(up(10, 10, touch(1)));
    expect(painted(layers)).toBe(0);
  });
});

// ── Select tool ──────────────────────────────────────────────────
// A plain click selects the cell; a drag pans instead — never paints,
// whatever tool a previous session left armed.

describe("view mode", () => {
  it("only pans: a press paints nothing and pushes no undo step, and a drag moves the map", () => {
    const { editor, layers } = makeHarness({ viewMode: () => true });
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10));
    editor.onPointerMove(move(60, 40));
    editor.onPointerUp(up(60, 40));
    expect(layers.value.floor).toEqual({});
    expect(editor.canUndo.value).toBe(false);
    expect(editor.viewportOffset.value).not.toEqual(before);
  });
});

describe("select tool", () => {
  it("a click that wobbles within the slop still selects, and does not pan", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10));
    editor.onPointerMove(move(12, 11)); // 2px: under the 4px slop
    editor.onPointerUp(up(12, 11));
    expect(selectedCell.value).toEqual([0, 0]);
    expect(editor.viewportOffset.value).toEqual(before);
  });

  it("a plain click selects the cell and paints nothing", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor, layers } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    clickCell(editor, 10, 10); // (0,0)
    expect(selectedCell.value).toEqual([0, 0]);
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(editor.canUndo.value).toBe(false);
  });

  it("a drag pans the viewport instead of selecting", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10));
    editor.onPointerMove(move(60, 10)); // past the 4px slop
    editor.onPointerUp(up(60, 10));
    expect(editor.viewportOffset.value).not.toEqual(before);
    expect(selectedCell.value).toBeNull();
  });

  it("RMB still pans with Select armed, exactly as with any other tool", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10, { button: 2 }));
    editor.onPointerMove(move(60, 10, { button: 2 }));
    editor.onPointerUp(up(60, 10, { button: 2 }));
    expect(editor.viewportOffset.value).not.toEqual(before);
    expect(selectedCell.value).toBeNull();
  });

  it("one finger pans on touch — never paints and never selects mid-drag", () => {
    const selectedCell = ref<[number, number] | null>(null);
    const { editor, layers } = makeHarness({ activeTool: ref<Tool>("select"), selectedCell });
    vi.useFakeTimers();
    editor.onPointerDown(down(10, 10, { pointerType: "touch", pointerId: 1 }));
    vi.advanceTimersByTime(100); // past the touch hold
    editor.onPointerMove(move(80, 10, { pointerType: "touch", pointerId: 1 }));
    editor.onPointerUp(up(80, 10, { pointerType: "touch", pointerId: 1 }));
    expect(Object.keys(layers.value.floor).length).toBe(0);
    vi.useRealTimers();
  });
});

// ── Alt inverts a painting tool ──────────────────────────────────
// Same modifier idea as the Plan's Door tool (usePlanCanvasTools.ts):
// holding Alt while a tool would paint erases what it paints instead.

describe("Alt inverts a painting tool", () => {
  it("floor: Alt+click erases an existing cell instead of painting", () => {
    const { editor, activeTool, layers } = makeHarness();
    clickCell(editor, 10, 10); // paint (0,0)
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();

    activeTool.value = "floor";
    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerUp(up(10, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
  });

  it("floor: Alt+drag erases every cell the stroke crosses, as one undo step", () => {
    const { editor, layers } = makeHarness();
    // Paint a run first, unaltered.
    editor.onPointerDown(down(10, 10));
    editor.onPointerMove(move(138, 10));
    editor.onPointerUp(up(138, 10));
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeDefined();

    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerMove(move(138, 10, { altKey: true }));
    editor.onPointerUp(up(138, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();

    editor.undoEdit(); // the whole erase stroke reverts in one step
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeDefined();
  });

  it("solid: Alt+click erases a solid block", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "solid";
    clickCell(editor, 10, 10);
    expect(layers.value.solidBlock["0,0" as CellKey]).toBeDefined();

    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerUp(up(10, 10, { altKey: true }));
    expect(layers.value.solidBlock["0,0" as CellKey]).toBeUndefined();
  });

  it("stamp: Alt+click erases the object, same as RMB does", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "place";
    clickCell(editor, 10, 10);
    expect(layers.value.object["0,0" as CellKey]).toBeDefined();

    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerUp(up(10, 10, { altKey: true }));
    expect(layers.value.object["0,0" as CellKey]).toBeUndefined();
  });

  it("wall: Alt+click erases a wall edge", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "wall";
    editor.onPointerMove(move(64, 10)); // near cell (0,0)'s north edge
    editor.onPointerDown(down(64, 10));
    editor.onPointerUp(up(64, 10));
    expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeDefined();

    editor.onPointerMove(move(64, 10, { altKey: true }));
    editor.onPointerDown(down(64, 10, { altKey: true }));
    editor.onPointerUp(up(64, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeUndefined();
  });

  it("door: Alt+click removes the door, reverting to a plain wall, same as RMB does", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "wall";
    editor.onPointerMove(move(64, 10));
    editor.onPointerDown(down(64, 10));
    editor.onPointerUp(up(64, 10));

    activeTool.value = "door";
    editor.onPointerMove(move(64, 10));
    editor.onPointerDown(down(64, 10));
    editor.onPointerUp(up(64, 10));
    expect(layers.value.floor["0,0" as CellKey]?.wallN?.type).toBe("doorClosed");

    editor.onPointerMove(move(64, 10, { altKey: true }));
    editor.onPointerDown(down(64, 10, { altKey: true }));
    editor.onPointerUp(up(64, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]?.wallN?.type).toBe("wall");
  });

  it("rect: Alt+drag erases the cells the rectangle covers", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "rect";
    editor.onPointerDown(down(10, 10)); // (0,0)
    editor.onPointerMove(move(138, 10)); // (1,0)
    editor.onPointerUp(up(138, 10));
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeDefined();

    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerMove(move(138, 10, { altKey: true }));
    editor.onPointerUp(up(138, 10, { altKey: true }));
    expect(layers.value.floor["0,0" as CellKey]).toBeUndefined();
    expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
  });

  it("tools with nothing to invert (eraser, fill) ignore Alt", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "fill";
    // Paint one cell by hand so fill has a region to flood.
    layers.value.floor["0,0" as CellKey] = { floor: { pack_id: "pack-1", pack_version: 3, variant: 0 } };
    editor.onPointerDown(down(10, 10, { altKey: true }));
    editor.onPointerUp(up(10, 10, { altKey: true }));
    // Fill still floods/paints — Alt has no erase mirror for a one-shot tool.
    expect(layers.value.floor["0,0" as CellKey]).toBeDefined();
  });
});

// ── altHeld ───────────────────────────────────────────────────────
// The keydown/keyup/blur listeners live inside onMounted, beside the
// existing shortcut listener — calling useMapCanvasEditor() bare, as
// makeHarness does everywhere else in this file, never runs onMounted at
// all (Vue silently drops it outside a component, with only a dev warning).
// These two need a real mounted host to exercise that wiring.

// Mounted editors listen on the window; one left from an earlier test would take another's keys.
enableAutoUnmount(afterEach);

describe("altHeld", () => {
  function mountForLifecycle(
    tool: Tool = "floor",
    radius = ref(1.5),
    keysActive?: () => boolean,
  ): ReturnType<typeof useMapCanvasEditor> {
    let captured!: ReturnType<typeof useMapCanvasEditor>;
    const runtime = fakeRuntime();
    const Host = defineComponent({
      setup() {
        captured = useMapCanvasEditor({
          canvasEl: ref<HTMLCanvasElement | null>(fakeCanvas()),
          layers: ref<DungeonMapLayers>(emptyLayers()),
          metadata: ref<Record<CellKey, CellMetadata>>({}),
          dirty: ref(false),
          editRevision: ref(0),
          currentPackId: ref("pack-1"),
          darkness: ref("daylight"),
          packRuntime: computed(() => runtime) as ComputedRef<TilePackRuntime | null>,
          selectablePacks: computed(() => [{ pack_id: "pack-1", pack_version: 3 }]),
          loadedRuntimes: ref(new Map()),
          dressing: ref(new Map()),
          placeItem: ref<PlaceItem | null>(null),
          selectedDressingId: ref<string | null>(null),
          cellGlyphs: computed(() => ({})),
          activeTool: ref<Tool>(tool),
          tools: [{ id: "floor", shortcut: "f" }],
          viewMode: () => false,
          placeRotation: ref(0),
          activeWallKind: ref<WallKind>("wall"),
          activeWallDecal: ref(0),
          activeTemplateShape: ref("circle"),
          brushRadius: radius,
          rectWalls: ref(true),
          selectedCell: ref(null),
          toolOptionsRef: ref(null),
          structure: fakeStructure(),
          mapKey: computed(() => "map-test"),
          getReferenceImage: () => null,
          extraRenderDeps: [],
          keysActive,
        });
        return () => h("div");
      },
    });
    mount(Host);
    return captured;
  }

  it("tracks the physical Alt key via window keydown/keyup", () => {
    const editor = mountForLifecycle();
    expect(editor.altHeld.value).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(editor.altHeld.value).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    expect(editor.altHeld.value).toBe(false);
  });

  it("[ and ] resize the brush by a quarter cell, within 0.5 and 6", () => {
    const radius = ref(1.5);
    mountForLifecycle("brush", radius);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
    expect(radius.value).toBe(1.75);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    expect(radius.value).toBe(1.25);
    radius.value = 0.5;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    expect(radius.value).toBe(0.5);
    radius.value = 6;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
    expect(radius.value).toBe(6);
  });

  it("clears on window blur, so a stuck Alt from alt-tabbing away doesn't linger", () => {
    const editor = mountForLifecycle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt" }));
    expect(editor.altHeld.value).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(editor.altHeld.value).toBe(false);
  });

  it("Space turns a left drag into a pan with the armed tool, and releasing it ends that", () => {
    const editor = mountForLifecycle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
    expect(editor.spaceHeld.value).toBe(true);
    const before = { ...editor.viewportOffset.value };
    editor.onPointerDown(down(10, 10));
    expect(editor.isPanning.value).toBe(true);
    editor.onPointerMove(move(60, 10));
    editor.onPointerUp(up(60, 10));
    expect(editor.viewportOffset.value).not.toEqual(before);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
    expect(editor.spaceHeld.value).toBe(false);
    editor.onPointerDown(down(10, 10));
    expect(editor.isPanning.value).toBe(false);
    editor.onPointerUp(up(10, 10));
  });

  it("window blur lets go of Space", () => {
    const editor = mountForLifecycle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
    window.dispatchEvent(new Event("blur"));
    expect(editor.spaceHeld.value).toBe(false);
  });

  it("Ctrl+1 shows 100% and Ctrl+0 fits an empty map at 100% too", () => {
    const editor = mountForLifecycle();
    editor.zoom.value = 2;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", ctrlKey: true }));
    expect(editor.zoom.value).toBe(1);
    editor.zoom.value = 3;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", code: "Digit0", ctrlKey: true }));
    expect(editor.zoom.value).toBe(1);
  });

  it("Space and the zoom keys are left to the page while the pointer and focus are elsewhere", () => {
    let overMap = false;
    const editor = mountForLifecycle("floor", ref(1.5), () => overMap);
    const space = new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(editor.spaceHeld.value).toBe(false);
    expect(space.defaultPrevented).toBe(false);

    editor.zoom.value = 3;
    const zoomKey = new KeyboardEvent("keydown", { key: "0", code: "Digit0", ctrlKey: true, cancelable: true });
    window.dispatchEvent(zoomKey);
    expect(editor.zoom.value).toBe(3);
    expect(zoomKey.defaultPrevented).toBe(false);

    overMap = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
    expect(editor.spaceHeld.value).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", code: "Digit0", ctrlKey: true }));
    expect(editor.zoom.value).toBe(1);

    // Letting go is never gated, so leaving the map with Space down cannot stick the hand.
    overMap = false;
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
    expect(editor.spaceHeld.value).toBe(false);
  });

  it("Ctrl+= and Ctrl+- step the zoom in and out", () => {
    const editor = mountForLifecycle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", code: "Equal", ctrlKey: true }));
    expect(editor.zoom.value).toBeCloseTo(1.25, 6);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", code: "Minus", ctrlKey: true }));
    expect(editor.zoom.value).toBeCloseTo(1, 6);
  });
});

// ── Dressing tool (epic #1062) ───────────────────────────────────────────
// The gestures themselves are covered in useDressingTool.test.ts; these prove
// the editor routes pointer events to it and keeps undo, the eraser and the
// render scene in step.

describe("place tool: props", () => {
  const CELL = BASE_TILE_SIZE; // a cell's CSS pixels at zoom 1

  function armed() {
    const h = makeHarness();
    h.activeTool.value = "place";
    h.placeItem.value = { kind: "prop", propId: "table" };
    return h;
  }

  /** The placement ids on the layer, in insertion order. */
  const ids = (layers: Ref<DungeonMapLayers>) => Object.keys(layers.value.dressing);

  it("a click with a prop armed places it at that cell as one undo step and selects it", () => {
    const { editor, layers, selectedDressingId } = armed();
    clickCell(editor, 2 * CELL + 5, CELL + 5);
    const [id] = ids(layers);
    expect(layers.value.dressing[id]).toMatchObject({ prop_id: "table", x: 2, y: 1, rotation: 0 });
    expect(selectedDressingId.value).toBe(id);
    editor.undoEdit();
    expect(ids(layers)).toEqual([]);
    expect(editor.canUndo.value).toBe(false);
  });

  it("with nothing armed, a click on a placed prop selects it and a click elsewhere deselects", () => {
    const { editor, layers, placeItem, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    placeItem.value = null;
    selectedDressingId.value = null;
    clickCell(editor, CELL + 5, 5); // the table's second cell
    expect(selectedDressingId.value).toBe(ids(layers)[0]);
    clickCell(editor, 6 * CELL, 6 * CELL);
    expect(selectedDressingId.value).toBeNull();
  });

  it("dragging a placed prop moves it by whole cells, keeping the grab offset, as one undo step", () => {
    const { editor, layers, placeItem } = armed();
    clickCell(editor, 5, 5);
    placeItem.value = null;
    const [id] = ids(layers);
    editor.onPointerDown(down(CELL + 5, 5)); // grab by the second cell
    editor.onPointerMove(move(4 * CELL + 5, 2 * CELL + 5));
    editor.onPointerMove(move(5 * CELL + 5, 2 * CELL + 5));
    editor.onPointerUp(up(5 * CELL + 5, 2 * CELL + 5));
    expect(layers.value.dressing[id]).toMatchObject({ x: 4, y: 2 });
    editor.undoEdit(); // the move alone
    expect(layers.value.dressing[id]).toMatchObject({ x: 0, y: 0 });
    editor.undoEdit(); // then the placement
    expect(ids(layers)).toEqual([]);
  });

  it("a right-click removes the topmost prop under the pointer without panning", () => {
    const { editor, layers, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    const down2 = down(CELL + 5, 5, { button: 2 });
    editor.onPointerDown(down2);
    editor.onPointerUp(up(CELL + 5, 5, { button: 2 }));
    expect(ids(layers)).toEqual([]);
    expect(selectedDressingId.value).toBeNull();
    expect(editor.canUndo.value).toBe(true);
  });

  it("Alt+click removes too", () => {
    const { editor, layers } = armed();
    clickCell(editor, 5, 5);
    editor.onPointerDown(down(5, 5, { altKey: true }));
    editor.onPointerUp(up(5, 5, { altKey: true }));
    expect(ids(layers)).toEqual([]);
  });

  it("the Eraser takes a prop before the object under it", () => {
    const { editor, layers, activeTool } = armed();
    clickCell(editor, 5, 5);
    activeTool.value = "eraser";
    clickCell(editor, 5, 5);
    expect(ids(layers)).toEqual([]);
  });

  it("feeds the renderer a ghost under the cursor while armed, none once the pointer leaves", async () => {
    const { editor, placeRotation } = armed();
    placeRotation.value = 90;
    editor.onPointerMove(move(3 * CELL + 5, 4 * CELL + 5));
    await nextTick();
    const scene = () => mockedRenderMap.mock.calls.at(-1)![0];
    expect(scene().dressingGhost).toEqual({
      placement: { prop_id: "table", x: 3, y: 4, rotation: 90, z: 0 },
      alpha: expect.any(Number),
    });
    editor.onPointerLeave(up(0, 0));
    await nextTick();
    expect(scene().dressingGhost).toBeNull();
  });

  it("feeds the renderer the selected prop's id, and drops it when the tool is left", async () => {
    const { editor, activeTool, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    await nextTick();
    const scene = () => mockedRenderMap.mock.calls.at(-1)![0];
    expect(scene().selectedDressingId).toBe(selectedDressingId.value);
    activeTool.value = "floor";
    await nextTick();
    expect(selectedDressingId.value).toBeNull();
  });

  it("undoing the placement leaves no dangling selection", async () => {
    const { editor, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    expect(selectedDressingId.value).not.toBeNull();
    editor.undoEdit();
    await nextTick();
    expect(selectedDressingId.value).toBeNull();
  });

  it("rotateSelectedDressing turns the selection (one undo step) and the brush with it", () => {
    const { editor, layers, placeRotation, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    editor.rotateSelectedDressing(90);
    expect(layers.value.dressing[selectedDressingId.value!].rotation).toBe(90);
    expect(placeRotation.value).toBe(90);
    editor.undoEdit();
    expect(layers.value.dressing[selectedDressingId.value!].rotation).toBe(0);
  });

  it("deleteSelectedDressing removes the selection as one undo step", () => {
    const { editor, layers, selectedDressingId } = armed();
    clickCell(editor, 5, 5);
    editor.deleteSelectedDressing();
    expect(ids(layers)).toEqual([]);
    expect(selectedDressingId.value).toBeNull();
    editor.undoEdit();
    expect(ids(layers)).toHaveLength(1);
  });

  it("a middle-button press is left to the pan", () => {
    const { editor, layers } = armed();
    editor.onPointerDown(down(5, 5, { button: 1 }));
    editor.onPointerUp(up(5, 5, { button: 1 }));
    expect(ids(layers)).toEqual([]);
  });
});

describe("place tool: keys", () => {
  // The window keydown listener lives in onMounted, so the harness has to be
  // built inside a mounted component.
  function mountHarness(): Harness {
    let captured!: Harness;
    mount(defineComponent({
      setup() {
        captured = makeHarness();
        return () => h("div");
      },
    }));
    captured.activeTool.value = "place";
    captured.placeItem.value = { kind: "prop", propId: "table" };
    return captured;
  }

  const press = (key: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key }));

  it("Q and E turn the brush while nothing is selected", () => {
    const { placeRotation } = mountHarness();
    press("e");
    expect(placeRotation.value).toBe(90);
    press("q");
    press("q");
    expect(placeRotation.value).toBe(270);
  });

  it("Q and E turn the selected prop, one undo step each, and the brush follows", () => {
    const { editor, layers, placeRotation, selectedDressingId } = mountHarness();
    clickCell(editor, 5, 5);
    press("e");
    press("e");
    const id = selectedDressingId.value!;
    expect(layers.value.dressing[id].rotation).toBe(180);
    expect(placeRotation.value).toBe(180);
    editor.undoEdit();
    expect(layers.value.dressing[id].rotation).toBe(90);
  });

  it("Delete removes the selected prop; with nothing selected it does nothing", () => {
    const { editor, layers, selectedDressingId } = mountHarness();
    press("Delete");
    expect(editor.canUndo.value).toBe(false);
    clickCell(editor, 5, 5);
    press("Delete");
    expect(Object.keys(layers.value.dressing)).toEqual([]);
    expect(selectedDressingId.value).toBeNull();
  });

  it("Escape puts the armed prop down first, then leaves the tool", () => {
    const { placeItem, activeTool } = mountHarness();
    press("Escape");
    expect(placeItem.value).toBeNull();
    expect(activeTool.value).toBe("place");
  });
});

// ── Shift draws (#1096) ──────────────────────────────────────────────────
// Shift+click joins to where the last stroke ended; Shift while dragging locks
// to 45 degrees (cells and brush) or to a grid line (wall); Shift makes a
// rectangle square and snaps a line. Cells are 128px at zoom 1.

describe("Shift draws straight", () => {
  const cellPx = (n: number): number => n * BASE_TILE_SIZE + 10;
  const shift = { shiftKey: true };

  describe("brush", () => {
    it("Shift+click joins from the end of the last stroke, painting the stretch between", () => {
      const { editor, layers, activeTool } = makeHarness({ brushRadius: ref(0.5) });
      activeTool.value = "brush";
      clickCell(editor, 64, 64); // ends at (0.5, 0.5)
      editor.onPointerDown(down(448, 64, shift)); // (3.5, 0.5)
      editor.onPointerUp(up(448, 64, shift));
      for (const k of ["0,0", "1,0", "2,0", "3,0"] as CellKey[]) {
        expect(layers.value.floor[k]?.floor).toBeDefined();
      }
      editor.undoEdit();
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
      expect(layers.value.floor["0,0" as CellKey]?.floor).toBeDefined();
    });

    it("a plain click does not join", () => {
      const { editor, layers, activeTool } = makeHarness({ brushRadius: ref(0.5) });
      activeTool.value = "brush";
      clickCell(editor, 64, 64);
      clickCell(editor, 448, 64);
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    });

    it("forgets the end point on Escape", () => {
      // The key listener lives on the window from onMounted, so the harness is built in a mounted component.
      let captured!: Harness;
      mount(defineComponent({ setup() { captured = makeHarness({ brushRadius: ref(0.5) }); return () => h("div"); } }));
      const { editor, layers, activeTool } = captured;
      activeTool.value = "brush";
      clickCell(editor, 64, 64);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      editor.onPointerDown(down(448, 64, shift));
      editor.onPointerUp(up(448, 64, shift));
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    });

    it("forgets the end point when the tool changes", () => {
      const { editor, layers, activeTool } = makeHarness({ brushRadius: ref(0.5) });
      activeTool.value = "brush";
      clickCell(editor, 64, 64);
      activeTool.value = "floor";
      activeTool.value = "brush";
      editor.onPointerDown(down(448, 64, shift));
      editor.onPointerUp(up(448, 64, shift));
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    });

    it("Shift while dragging snaps the stroke to 45 degrees", () => {
      const { editor, layers, activeTool } = makeHarness({ brushRadius: ref(0.4) });
      activeTool.value = "brush";
      editor.onPointerDown(down(64, 64));
      editor.onPointerMove(move(448, 164, shift)); // a cell below the row it started on
      editor.onPointerUp(up(448, 164, shift));
      expect(layers.value.floor["3,0" as CellKey]?.floor).toBeDefined();
      expect(layers.value.floor["3,1" as CellKey]).toBeUndefined();
    });

    it("Alt+Shift erases a straight cut", () => {
      const { editor, layers, activeTool } = makeHarness({ brushRadius: ref(0.5) });
      activeTool.value = "brush";
      editor.onPointerDown(down(64, 64));
      editor.onPointerMove(move(448, 64));
      editor.onPointerUp(up(448, 64));
      editor.onPointerDown(down(64, 64, { altKey: true }));
      editor.onPointerUp(up(64, 64, { altKey: true }));
      editor.onPointerDown(down(448, 64, { altKey: true, shiftKey: true }));
      editor.onPointerUp(up(448, 64, { altKey: true, shiftKey: true }));
      expect(layers.value.floor["2,0" as CellKey]).toBeUndefined();
    });
  });

  describe("cell painters", () => {
    it("Shift+click paints a straight line from the last painted cell, as one undo step", () => {
      const { editor, layers } = makeHarness();
      clickCell(editor, cellPx(0), cellPx(0));
      editor.onPointerDown(down(cellPx(3), cellPx(2), shift));
      editor.onPointerUp(up(cellPx(3), cellPx(2), shift));
      expect(Object.keys(layers.value.floor)).toHaveLength(4);
      expect(layers.value.floor["3,2" as CellKey]).toBeDefined();
      editor.undoEdit();
      expect(Object.keys(layers.value.floor)).toEqual(["0,0"]);
    });

    it("Shift while dragging snaps to 45 degrees and fills every cell on the way", () => {
      const { editor, layers } = makeHarness();
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerMove(move(cellPx(4), cellPx(1), shift));
      editor.onPointerUp(up(cellPx(4), cellPx(1), shift));
      for (const k of ["0,0", "1,0", "2,0", "3,0", "4,0"] as CellKey[]) {
        expect(layers.value.floor[k]).toBeDefined();
      }
      expect(layers.value.floor["4,1" as CellKey]).toBeUndefined();
    });

    it("Alt+Shift erases the same line", () => {
      const { editor, layers } = makeHarness();
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      for (const n of [1, 2, 3]) editor.onPointerMove(move(cellPx(n), cellPx(0)));
      editor.onPointerUp(up(cellPx(3), cellPx(0)));
      editor.onPointerDown(down(cellPx(0), cellPx(0), { altKey: true }));
      editor.onPointerUp(up(cellPx(0), cellPx(0), { altKey: true }));
      editor.onPointerDown(down(cellPx(3), cellPx(0), { altKey: true, shiftKey: true }));
      editor.onPointerUp(up(cellPx(3), cellPx(0), { altKey: true, shiftKey: true }));
      expect(Object.keys(layers.value.floor)).toEqual([]);
    });

    it("Shift+click with no earlier stroke paints just the clicked cell", () => {
      const { editor, layers } = makeHarness();
      editor.onPointerDown(down(cellPx(3), cellPx(2), shift));
      editor.onPointerUp(up(cellPx(3), cellPx(2), shift));
      expect(Object.keys(layers.value.floor)).toEqual(["3,2"]);
    });
  });

  describe("wall", () => {
    function hoverTopEdge(editor: Harness["editor"]): void {
      editor.onPointerMove(move(64, 10)); // the N edge of (0,0)
    }

    it("Shift+click with no earlier wall paints one edge, never the cell's four", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "wall";
      hoverTopEdge(editor);
      editor.onPointerDown(down(64, 10, shift));
      editor.onPointerUp(up(64, 10, shift));
      const cell = layers.value.floor["0,0" as CellKey];
      expect(cell?.wallN).toBeDefined();
      expect(cell?.wallW).toBeUndefined();
      expect(layers.value.floor["0,1" as CellKey]).toBeUndefined();
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    });

    it("Shift+click runs a straight wall from the last one, as one undo step", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "wall";
      hoverTopEdge(editor);
      clickCell(editor, 64, 10); // N edge of (0,0); the run starts at its east end, vertex (1, 0)
      editor.onPointerDown(down(500, 5, shift)); // nearest vertex (4, 0)
      editor.onPointerUp(up(500, 5, shift));
      for (const k of ["0,0", "1,0", "2,0", "3,0"] as CellKey[]) {
        expect(layers.value.floor[k]?.wallN).toBeDefined();
      }
      expect(layers.value.floor["4,0" as CellKey]).toBeUndefined();
      editor.undoEdit();
      expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeDefined();
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
    });

    it("Alt+Shift erases the run", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "wall";
      hoverTopEdge(editor);
      clickCell(editor, 64, 10);
      editor.onPointerDown(down(500, 5, shift));
      editor.onPointerUp(up(500, 5, shift));
      // The run ended at vertex (4, 0); Alt+Shift back to (0, 0) takes all four edges out.
      editor.onPointerDown(down(5, 5, { altKey: true, shiftKey: true }));
      editor.onPointerUp(up(5, 5, { altKey: true, shiftKey: true }));
      for (const k of ["0,0", "1,0", "2,0", "3,0"] as CellKey[]) {
        expect(layers.value.floor[k]?.wallN).toBeUndefined();
      }
    });

    it("Shift+drag after a wall carries on along the run's line, and run and drag undo together", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "wall";
      hoverTopEdge(editor);
      clickCell(editor, 64, 10); // N edge of (0,0); the run starts at vertex (1, 0)
      editor.onPointerDown(down(300, 5, shift)); // nearest vertex (2, 0): one edge, then the drag begins
      expect(layers.value.floor["1,0" as CellKey]?.wallN).toBeDefined();
      editor.onPointerMove(move(330, 5, shift)); // N edge of (2, 0)
      editor.onPointerMove(move(330, 138, shift)); // a parallel row: off the line, so nothing
      editor.onPointerMove(move(450, 5, shift)); // N edge of (3, 0)
      editor.onPointerUp(up(450, 5, shift));
      for (const k of ["0,0", "1,0", "2,0", "3,0"] as CellKey[]) {
        expect(layers.value.floor[k]?.wallN).toBeDefined();
      }
      expect(layers.value.floor["2,1" as CellKey]).toBeUndefined();
      editor.undoEdit();
      expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeDefined();
      expect(layers.value.floor["1,0" as CellKey]).toBeUndefined();
      expect(layers.value.floor["3,0" as CellKey]).toBeUndefined();
    });

    it("Shift while dragging stays on the row the stroke began on", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "wall";
      hoverTopEdge(editor);
      editor.onPointerDown(down(64, 10, shift));
      editor.onPointerMove(move(200, 138, shift)); // the N edge of (1, 1): a parallel line
      editor.onPointerMove(move(200, 10, shift)); // the N edge of (1, 0)
      editor.onPointerUp(up(200, 10, shift));
      expect(layers.value.floor["1,1" as CellKey]).toBeUndefined();
      expect(layers.value.floor["1,0" as CellKey]?.wallN).toBeDefined();
    });
  });

  describe("rectangle", () => {
    it("Shift makes it a square", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "rect";
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerMove(move(cellPx(3), cellPx(1), shift));
      editor.onPointerUp(up(cellPx(3), cellPx(1), shift));
      expect(layers.value.floor["3,3" as CellKey]?.floor).toBeDefined();
      expect(layers.value.floor["0,3" as CellKey]?.floor).toBeDefined();
    });

    it("wraps its walls by default", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "rect";
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerUp(up(cellPx(1), cellPx(0)));
      expect(layers.value.floor["0,0" as CellKey]?.wallN).toBeDefined();
      expect(layers.value.floor["0,0" as CellKey]?.wallW).toBeDefined();
    });

    it("leaves the walls off when the Walls option is off, Shift or not", () => {
      const { editor, layers, activeTool } = makeHarness({ rectWalls: ref(false) });
      activeTool.value = "rect";
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerUp(up(cellPx(1), cellPx(0), shift));
      expect(layers.value.floor["1,1" as CellKey]?.floor).toBeDefined();
      for (const cell of Object.values(layers.value.floor)) {
        expect(cell.wallN).toBeUndefined();
        expect(cell.wallW).toBeUndefined();
      }
    });
  });

  describe("line", () => {
    it("Shift snaps the end to 45 degrees", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "line";
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerUp(up(cellPx(4), cellPx(1), shift));
      expect(layers.value.floor["4,0" as CellKey]).toBeDefined();
      expect(layers.value.floor["4,1" as CellKey]).toBeUndefined();
    });

    it("Alt+Shift erases the snapped line", () => {
      const { editor, layers, activeTool } = makeHarness();
      activeTool.value = "line";
      editor.onPointerDown(down(cellPx(0), cellPx(0)));
      editor.onPointerUp(up(cellPx(4), cellPx(0)));
      editor.onPointerDown(down(cellPx(0), cellPx(0), { altKey: true }));
      editor.onPointerUp(up(cellPx(4), cellPx(1), { altKey: true, shiftKey: true }));
      expect(Object.keys(layers.value.floor)).toEqual([]);
    });
  });
});
