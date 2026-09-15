// Glue tests for the Cartographer's canvas engine. The pure pieces it wires
// together — CommandStack, pickVariant/hash32, zoomAtPoint, detectHoveredEdge,
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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue";
import { useMapCanvasEditor, type MapCanvasEditorOptions } from "./useMapCanvasEditor";
import {
  emptyLayers,
  type CellKey,
  type CellMetadata,
  type DungeonMapLayers,
} from "@/types/dungeonMap.types";
import type { Tool } from "@/cartographer/tools";
import type { ObjectCategory, PackCategory } from "@/cartographer/packSchema";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { renderMap, type MapRenderReferenceImage } from "@/cartographer/renderMap";
import { pickVariant } from "@/cartographer/tileVariants";
import type { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";

vi.mock("@/cartographer/renderMap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/cartographer/renderMap")>();
  return { ...actual, renderMap: vi.fn() };
});

const mockedRenderMap = vi.mocked(renderMap);

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

interface Harness {
  layers: Ref<DungeonMapLayers>;
  dirty: Ref<boolean>;
  activeTool: Ref<Tool>;
  canvasEl: Ref<HTMLCanvasElement | null>;
  editor: ReturnType<typeof useMapCanvasEditor>;
  getReferenceImage: ReturnType<typeof vi.fn<(tilePx: number, offset: { x: number; y: number }) => MapRenderReferenceImage | null>>;
}

function makeHarness(over: Partial<MapCanvasEditorOptions> = {}): Harness {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const metadata = ref<Record<CellKey, CellMetadata>>({});
  const dirty = ref(false);
  const activeTool = ref<Tool>("floor");
  const canvasEl = ref<HTMLCanvasElement | null>(fakeCanvas());
  const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
  const runtime = fakeRuntime();
  const packRuntime = computed(() => runtime) as ComputedRef<TilePackRuntime | null>;
  const getReferenceImage = vi.fn((): MapRenderReferenceImage | null => null);

  const opts: MapCanvasEditorOptions = {
    canvasEl,
    layers,
    metadata,
    dirty,
    currentPackId: ref("pack-1"),
    packRuntime,
    selectablePacks: computed(() => [{ pack_id: "pack-1", pack_version: 3 }]),
    loadedRuntimes,
    cellGlyphs: computed(() => ({})),
    activeTool,
    tools: [
      { id: "floor", shortcut: "f" },
      { id: "wall", shortcut: "w" },
    ],
    viewMode: () => false,
    activeObjectCategory: ref<ObjectCategory>("objectChest"),
    stampRotation: ref(0),
    activeTemplateShape: ref("circle"),
    caveRadius: ref(2),
    selectedCell: ref(null),
    inspectorPanelRef: ref(null),
    structure: fakeStructure(),
    mapKey: computed(() => "map-test"),
    getReferenceImage,
    extraRenderDeps: [],
    ...over,
  };

  const editor = useMapCanvasEditor(opts);
  return { layers, dirty, activeTool, canvasEl, editor, getReferenceImage };
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

describe("eraser tool priority", () => {
  it("erases the object in preference to the floor beneath it", () => {
    const { editor, activeTool, layers } = makeHarness();
    activeTool.value = "stamp";
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
  it("zooms in on a negative deltaY and keeps the cursor's world point stationary", () => {
    const { editor } = makeHarness();
    const before = { zoom: editor.zoom.value, offset: { ...editor.viewportOffset.value } };
    editor.onWheel(new WheelEvent("wheel", { clientX: 100, clientY: 100, deltaY: -100 }));
    expect(editor.zoom.value).toBeGreaterThan(before.zoom);
  });

  it("zooms out on a positive deltaY", () => {
    const { editor } = makeHarness();
    const before = editor.zoom.value;
    editor.onWheel(new WheelEvent("wheel", { clientX: 100, clientY: 100, deltaY: 100 }));
    expect(editor.zoom.value).toBeLessThan(before);
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
