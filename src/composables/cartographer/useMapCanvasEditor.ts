// The Cartographer's canvas engine: viewport, pointer/paint dispatch,
// undo/redo, deterministic variant picking, and the render loop.
//
// Pulled out of MapWorkbench.vue (epic #884 S6) to keep that component under
// its line cap (CLAUDE.md "Component Granularity"). MapWorkbench still owns tool
// *selection* state (`activeTool`, the `TOOLS` palette, per-tool inspector
// fields like `placeRotation`/`brushRadius`) and hands them in here as refs;
// this composable owns what happens on the canvas once a tool is active.
//
// Every mutation function here writes through the same `layers`/`metadata`
// refs the caller owns — nothing here is a copy, so watching those refs
// elsewhere (structure derivation, dirty tracking) keeps working unchanged.

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from "vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { PlaceItem, Tool } from "@/cartographer/tools";
import type { StampCategory } from "@/cartographer/stampCategories";
import { pinchOf, pinchViewport, type Pinch, type CanvasViewport, type CellBounds } from "@/cartographer/viewport";
import { clampBrushRadius, resolveKeyAction, type EditorLayer } from "@/cartographer/keymap";
import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers, type CellMetadata, type DarknessLevel } from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE, categoryLabel, type PackCategory } from "@/cartographer/packSchema";
import { wallKindCategory, type WallKind } from "@/cartographer/wallKinds";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingCatalog } from "@/cartographer/dressing";
import { renderMap, type MapRenderReferenceImage, type MapRenderScene } from "@/cartographer/renderMap";
import type { WallNodeMarks } from "@/cartographer/drawWallNodes";
import { pickVariant } from "@/cartographer/tileVariants";
import * as paintOps from "@/cartographer/paintOps";
import type { PaintedWallKind } from "@/cartographer/paintOps";
import type { PaintContext } from "@/cartographer/paintOps";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { floodFill, boundaryEdges } from "@/cartographer/floodFill";
import { CommandStack } from "@/cartographer/commandStack";
import { cellsForTemplate } from "@/lib/map/gestures/template";
import type { Disc } from "@/cartographer/area";
import { groundCellBounds, paintGroundCells } from "@/cartographer/groundRegions";
import { useGroundRegionEdit } from "./useGroundRegionEdit";
import { useSelectTool } from "./useSelectTool";
import type { BrushRegionMode, GroundRegion, GroundWallMode } from "@/types/dungeonMap.types";
import { applyBrushStroke } from "@/cartographer/groundRegions";
import { cellsInRect, rectangleGesture } from "@/lib/map/gestures/rectangle";
import { cellsInLine } from "@/lib/map/gestures/line";
import { constrainShapeEnd, isCellPainter, useStraightStrokes, type CellPainter } from "@/composables/cartographer/useStraightStrokes";
import { useDressingTool } from "@/composables/cartographer/useDressingTool";
import { useAngledWallTool } from "@/composables/cartographer/useAngledWallTool";
import { useLightTool } from "@/composables/cartographer/useLightTool";
import { wallAt } from "@/cartographer/wallGraph";
import type { TileLight } from "@/cartographer/packSchema";
import { PLAN_TOOLS } from "@/composables/cartographer/usePlanPalette";
import { usePlanCanvasTools } from "@/composables/cartographer/usePlanCanvasTools";
import { isTextEntry } from "@/lib/canvasControls/keyTargets";
import { useCanvasNavigation } from "@/composables/cartographer/useCanvasNavigation";
import type { usePlanPalette } from "@/composables/cartographer/usePlanPalette";
import {
  drawPlanDoorHover,
  drawPlanSpaces,
  drawPlanTracingOverlay,
  drawPlanWays,
  drawPlanZones,
  type TileViewport,
} from "@/cartographer/planOverlay";
import type { GridPoint } from "@/types/locationMapRegion.types";

type TemplateShape = "circle" | "octagon" | "hex";

export interface MapCanvasEditorOptions {
  canvasEl: Ref<HTMLCanvasElement | null>;
  layers: Ref<DungeonMapLayers>;
  metadata: Ref<Record<CellKey, CellMetadata>>;
  dirty: Ref<boolean>;
  /** Bumped on every edit that sets `dirty` — not just the false→true
   *  transition `dirty` itself only reports once. The host's autosave
   *  (`useSiteDrawingEditor`) re-arms its debounce off this so a stroke made
   *  while a save is already in flight doesn't go unscheduled (#884 review
   *  finding 1: `dirty` staying `true` across a second edit fires no
   *  `update:dirty` event at all). */
  editRevision: Ref<number>;
  currentPackId: Ref<string>;
  /** The map's ambient light; the preview lays the DM's veil for it over the drawing. */
  darkness: Ref<DarknessLevel>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  selectablePacks: ComputedRef<ReadonlyArray<{ pack_id: string; pack_version: number }>>;
  loadedRuntimes: Ref<Map<string, TilePackRuntime>>;
  /** Dressing props by id (epic #1062); swapped for a new Map as art loads. */
  dressing: Ref<DressingCatalog>;
  /** The Place tool's state MapWorkbench owns so its drawer and slip can show it: what is
   *  armed (an object, a prop, or null for nothing), and the placed prop that is selected
   *  (epic #1062). */
  placeItem: Ref<PlaceItem | null>;
  selectedDressingId: Ref<string | null>;
  cellGlyphs: ComputedRef<Record<CellKey, PackCategory>>;
  activeTool: Ref<Tool>;
  /** Enough of the palette for hotkey resolution — MapWorkbench owns the full `TOOLS` array. */
  tools: ReadonlyArray<{ id: Tool; shortcut?: string; disabled?: boolean }>;
  viewMode: () => boolean;
  /** Degrees an object or prop is put down at, shared by both (Q/E turn it). */
  placeRotation: Ref<number>;
  /** What the wall tool paints (or, for "decal", sets on an existing wall) and the decal variant it sets. */
  activeWallKind: Ref<WallKind>;
  activeWallDecal: Ref<number>;
  wallVisible?: Ref<boolean>;
  /** What the Light tool puts down next: colour, reach and flicker, edited in the slip. */
  lightDraft: Ref<TileLight>;
  activeTemplateShape: Ref<TemplateShape>;
  /** Round brush radius in cells (fractional); `[` / `]` change it, the tool options show it. */
  brushRadius: Ref<number>;
  brushRegionMode?: Ref<BrushRegionMode>;
  brushWallMode?: Ref<GroundWallMode>;
  brushCategory?: Ref<GroundRegion["category"]>;
  /** Rectangle: whether the perimeter is also wrapped in walls (the tool's "Walls" option). */
  rectWalls: Ref<boolean>;
  selectedCell: Ref<[number, number] | null>;
  toolOptionsRef: Ref<{ annotationInputEl: AppInputHandle | null } | null>;
  /** Deterministic-variant seed string — "new" for an unsaved map, else the map id. */
  mapKey: ComputedRef<string>;
  /** The site reference layer (#884 S6), positioned by the caller against
   *  this frame's own `tilePx`/`viewportOffset` — see MapWorkbench's
   *  `buildReferenceImage`. Null when there's no site (the standalone route). */
  getReferenceImage: (tilePx: number, viewportOffset: { x: number; y: number }) => MapRenderReferenceImage | null;
  /** Extra reactive values that should trigger a re-render when they change
   *  (the reference-layer toggle + its loaded image) — kept as an opaque
   *  list so this module doesn't need to know what they mean. */
  extraRenderDeps: unknown[];
  /** The Plan layer (#884 S7b) — absent entirely when there's no `site`, the
   *  same "the whole feature doesn't exist without a site" rule the
   *  reference layer already follows. When present, `activeLayer` decides
   *  whether a pointer gesture on this canvas means the Drawing (every tool
   *  above) or the Plan (`planTools`, built from this composable's own
   *  `plan`) — see `handleActiveLayerPointerDown` below for the split. */
  plan?: ReturnType<typeof usePlanPalette>;
  activeLayer?: Ref<EditorLayer>;
  /** The map has the Base image / Drawing / Zoning tabs, so 1, 2 and 3 switch them. */
  hasLayerTabs?: boolean;
  /** Opacity of the square grid, or null while it is switched off. */
  gridAlpha: Ref<number | null>;
  /** G: show or hide the grid. */
  toggleGrid: () => void;
  /** Whether Space and the zoom keys are this canvas's to take. The editor listens on the
   *  window, and the workbench also sits inside whole pages (the Atlas) whose other
   *  controls need Space and the browser's own zoom, so the host answers true only while
   *  the pointer is over the map or focus is inside it. Omitted: always. */
  keysActive?: () => boolean;
  /** X: trade the active and second tile sets. */
  swapTileSets?: () => void;
  /**
   * The ground half of the map while motion plays (#1125 frames 16-17): a canvas under this one that holds the
   * background and the ground, so the live water can lie between it and what stands. Null or absent: one canvas.
   */
  groundCanvasEl?: Ref<HTMLCanvasElement | null>;
  /** Motion is playing over the map, so both canvases leave out what the live layer draws itself. */
  motionPlaying?: () => boolean;
}

// Edge-hover threshold: how close the cursor must get to a cell edge for it
// to "snap" to wall placement. 0.25 = within the outer 25% of the cell.
const EDGE_HOVER_THRESHOLD = 0.25;

/** The editor's background colour at partial strength: laid over the layers below the active tab to dim them. */
const LAYERS_BELOW_SCRIM = "rgba(20, 18, 16, 0.4)";

export function useMapCanvasEditor(opts: MapCanvasEditorOptions) {
  const {
    canvasEl, layers, metadata, dirty, editRevision, currentPackId, darkness, packRuntime, selectablePacks, loadedRuntimes,
    dressing, placeItem, selectedDressingId, cellGlyphs, activeTool, tools, viewMode, placeRotation, activeWallKind, activeWallDecal, lightDraft, activeTemplateShape,
    brushRadius, rectWalls, selectedCell, toolOptionsRef, mapKey, getReferenceImage, extraRenderDeps,
    plan, activeLayer, hasLayerTabs, gridAlpha, toggleGrid, keysActive, swapTileSets, groundCanvasEl, motionPlaying,
  } = opts;
  const wallVisible = opts.wallVisible ?? ref(true);
  const brushRegionMode = opts.brushRegionMode ?? ref<BrushRegionMode>("new");
  const brushWallMode = opts.brushWallMode ?? ref<GroundWallMode>("none");
  const brushCategory = opts.brushCategory ?? ref<GroundRegion["category"]>("floor");

  /** Every edit funnels through here instead of writing `dirty.value = true`
   *  directly — see `editRevision`'s docblock above for why the bump matters
   *  beyond the flag itself. */
  function markDirty(): void {
    dirty.value = true;
    editRevision.value++;
  }

  // Viewport state
  const zoom = ref(1);
  const viewportOffset = ref({ x: 0, y: 0 }); // world-pixels at top-left of viewport
  /** The canvas's CSS size and the device pixel ratio it was last drawn at: the motion layers share its box. */
  const canvasBox = ref({ w: 0, h: 0, dpr: 1 });
  const hoverCell = ref<[number, number] | null>(null);
  const hoveredEdge = ref<CellEdge | null>(null);

  // Pointer state
  const isPanning = ref(false);
  const isPainting = ref(false);
  let lastPointer: { x: number; y: number } | null = null;
  // Mutable per-stroke state (edge dedup + direction lock) — see StrokeState
  // in src/cartographer/paintOps.ts for what each field replaces and why.
  let strokeState = paintOps.createStrokeState();

  // Select: a drag on empty ground draws a marquee (useSelectTool); RMB, middle and Space pan before it is consulted.
  const SELECT_DRAG_SLOP_PX = 4;
  // The wall controller files its own undo step per commit; a gesture that also moves props and lights holds it back
  // and files one step for all of them (useSelectTool).
  let heldUndo: string | null = null;

  // Alt inverts a painting tool into its erase mirror, tracked at the
  // window level (not per-pointer-event) so the status pill can show
  // " · erase" the instant the key goes down or up, even with the pointer
  // sitting still. The actual paint/erase decision on a given stroke still
  // reads the POINTER event's own `altKey` (set on onKeyDown/onKeyUp below,
  // wired through the same window listeners `onKeyDown` already uses for
  // shortcuts — see the Lifecycle section) rather than this ref, since a
  // pointer event's modifier flags are always current and this ref updates
  // one tick behind a key that changed mid-stroke.
  const altHeld = ref(false);

  // Undo/redo
  const cmdStack = new CommandStack(100);
  const canUndo = ref(false);
  const canRedo = ref(false);

  // Drag state for rect / line tools
  let dragStartCell: [number, number] | null = null;
  const previewCells = ref(new Set<CellKey>());

  // Snapshot of layers captured at stroke start — used to build the undo command.
  let strokeSnapshot: string | null = null; // JSON string for cheap comparison on mouseup

  // Round brush: the last disc centre of the running stroke (fractional cells)
  // and the floor variant the stroke paints with, fixed at its first cell so
  // one stroke is one look.
  let brushLast: [number, number] | null = null;
  let brushVariant = 0;
  // The stroke is applied from the layers as they stood at pointer-down with ALL its discs on every move: the room's
  // run is re-fitted each time, so stacking segment on segment would let its nodes drift. Alt is read once, at press.
  let brushBase: DungeonMapLayers | null = null;
  let brushDiscs: Disc[] = [];
  let brushErase = false;
  let brushMode: BrushRegionMode = "new";
  let brushTarget: string | null = null;
  let brushWalls: GroundWallMode = "none";
  let brushMaterial: { pack_id: string; pack_version: number; variant: number } | null = null;
  let brushName = "";
  let brushGroundCategory: GroundRegion["category"] = "floor";
  let brushFootprint: Path2D | null = null;
  let brushPause: ReturnType<typeof setTimeout> | undefined;
  const brushResult = shallowRef<DungeonMapLayers | null>(null);
  /** Pointer in fractional cells, for the brush's cursor preview. */
  const hoverPoint = ref<[number, number] | null>(null);

  function snapshotStr(): string {
    return JSON.stringify({ layers: layers.value, metadata: metadata.value });
  }

  // Shift+click joins a stroke to where the last one ended (#1096).
  const straight = useStraightStrokes({ activeTool, mapKey });

  function pushCommand(beforeStr: string, afterStr: string): void {
    cmdStack.apply({
      apply() {
        const s = JSON.parse(afterStr) as { layers: DungeonMapLayers; metadata: Record<CellKey, CellMetadata> };
        layers.value = s.layers; metadata.value = s.metadata; markDirty();
      },
      revert() {
        const s = JSON.parse(beforeStr) as { layers: DungeonMapLayers; metadata: Record<CellKey, CellMetadata> };
        layers.value = s.layers; metadata.value = s.metadata; markDirty();
      },
    });
    canUndo.value = cmdStack.canUndo();
    canRedo.value = cmdStack.canRedo();
  }

  // The armed prop as the Dressing gestures see it; putting it down empties the whole item.
  const armedProp = computed<string | null>({
    get: () => (placeItem.value?.kind === "prop" ? placeItem.value.propId : null),
    set: (id) => { placeItem.value = id ? { kind: "prop", propId: id } : null; },
  });
  /** Right button, or Alt with the left: Place takes away instead of putting down. */
  function placeErases(ev: PointerEvent): boolean {
    return ev.button === 2 || (ev.altKey && ev.button === 0);
  }
  /** An object is armed: a click stamps it. Otherwise a click belongs to the props. */
  function armedObject(): Extract<PlaceItem, { kind: "object" }> | null {
    return placeItem.value?.kind === "object" ? placeItem.value : null;
  }

  // The Dressing gestures (epic #1062); this module only routes to them.
  const dressingTool = useDressingTool({
    layers, catalog: dressing, activeTool, brushId: armedProp, brushRotation: placeRotation,
    selectedId: selectedDressingId,
    isActive: () => !viewMode() && !isPlanLayerActive(),
    snapshotStr, pushCommand, markDirty,
  });

  // The Angled wall and Light tools (#1125 story 5); this module only routes to them.
  const angledTool = useAngledWallTool({
    layers, wallKind: activeWallKind,
    visible: () => wallVisible.value,
    pack: () => ({ packId: currentPackId.value, packVersion: activePackVersion() }),
    snapshotStr, pushCommand, markDirty,
  });
  const lightTool = useLightTool({ layers, draft: lightDraft, snapshotStr, pushCommand, markDirty });

  // Wall nodes (#1125 frame 17): Select picks a wall's whole run, and its nodes and bones are then dragged, split and
  // removed by this controller. Each gesture is one undo step, floor included.
  const groundEdit = useGroundRegionEdit({
    layers,
    commit: (next) => {
      const before = snapshotStr();
      layers.value = next;
      markDirty();
      if (heldUndo === null) pushCommand(before, snapshotStr());
    },
    pack: () => ({ packId: currentPackId.value, packVersion: activePackVersion(), variant: 0 }),
    hitTolerance: () => Math.max(0.3, 10 / (BASE_TILE_SIZE * zoom.value)),
  });
  const wallNodes = groundEdit.controller;
  const selectTool = useSelectTool({
    layers, catalog: dressing, dressingTool, lightTool, groundEdit, selectedDressingId,
    clearCell: () => { selectedCell.value = null; },
    describeObject: (cell) => {
      const manifest = loadedRuntimes.value.get(cell.pack_id)?.manifest;
      const label = manifest?.labels?.[cell.category]?.[cell.variant] ?? categoryLabel(cell.category).replace(/^object /, "");
      return manifest ? `${label}, from the ${manifest.name} set` : label;
    },
    snapshotStr, pushCommand, markDirty,
    holdUndo: (before) => { heldUndo = before; },
    slop: () => SELECT_DRAG_SLOP_PX / tilePixelSize(),
  });
  const selectedGroundRegion = groundEdit.selected;
  const selectedWallVisible = computed(() => wallNodes.selection.value.runs.every((r) => r.segments.every((s) => s.wall.visible !== false)));
  function setSelectedWallVisible(visible: boolean): void {
    if (selectedGroundRegion.value) return;
    const before = snapshotStr();
    const walls = { ...layers.value.walls };
    for (const run of wallNodes.selection.value.runs) for (const segment of run.segments) {
      const wall = { ...walls[segment.key] };
      if (visible) delete wall.visible; else wall.visible = false;
      walls[segment.key] = wall;
    }
    layers.value = { ...layers.value, walls };
    markDirty(); pushCommand(before, snapshotStr());
  }
  /** A gesture is under way (a drag, a held stroke), so the motion snapshot rebuilds on an interval, not per edit. */
  const gestureBusy = ref(false);
  const syncBusy = (): void => {
    gestureBusy.value = isPainting.value || dressingTool.isHolding() || lightTool.isHolding() || wallNodes.dragging.value || selectTool.isHolding();
  };
  /** The layers as drawn: the wall drag's preview stands in for the stored walls until it is released. */
  const shownLayers = computed<DungeonMapLayers>(() =>
    brushResult.value ?? groundEdit.shownLayers.value,
  );
  // Undo and redo can take away what is selected; leaving a tool puts its unfinished work down.
  watch(layers, () => { angledTool.dropStaleSelection(); lightTool.dropStaleSelection(); }, { deep: true });
  watch(activeTool, (tool, previous) => {
    if (previous === "brush" && tool !== "brush") clearBrush();
    if (previous === "angledWall" && tool !== "angledWall") angledTool.abandon();
    if (tool !== "angledWall") angledTool.selectedId.value = null;
    if (tool !== "light" && tool !== "select") lightTool.selectedId.value = null;
    if (tool !== "select") { selectTool.clear(); wallNodes.clearSelection(); }
  });

  /** The picked walls for the slip: "Wall · 4 segments · 1 door". Null when no wall is picked or the pick spans kinds. */
  const selectedWallRun = computed(() => {
    if (selectedGroundRegion.value) return null;
    // More than one kind picked (or more than one prop): the slip only counts them.
    if (selectTool.isMixed.value) return { bones: 0, nodes: 0, doors: 0, items: selectTool.pieceCount.value, object: selectTool.lonelyObject.value ?? undefined };
    const { bones, nodeCount, doors } = wallNodes.selection.value;
    return nodeCount > 0 ? { bones, nodes: nodeCount, doors } : null;
  });

  /** Fractional cell coordinates under a pointer event, for hit-testing props. */
  function fractionalCellAt(ev: MouseEvent): [number, number] {
    const world = pointerToWorld(getLocalPointer(ev));
    const tilePx = tilePixelSize();
    return [world.x / tilePx, world.y / tilePx];
  }

  // ── Plan layer (#884 S7b) ────────────────────────────────────────────────
  // Absent entirely without a `site` — `planTools` stays null and every
  // `activeLayer`-gated branch below is dead code, same as `referencePicture`
  // being null already makes the S6 reference layer a no-op on the standalone
  // route. Geometry callbacks wrap this composable's own
  // `viewportToCell`/`pointerToWorld`/`tilePixelSize` (defined further down —
  // safe forward references, these are `function` declarations) so the Plan
  // resolves a pointer event against the exact same tile grid the Drawing
  // already paints onto, never a second coordinate system.
  function planCellAt(clientX: number, clientY: number): CellKey | null {
    const canvas = canvasEl.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const [x, y] = viewportToCell(clientX - rect.left, clientY - rect.top);
    return cellKey(x, y);
  }
  function planGridPointAt(clientX: number, clientY: number): GridPoint | null {
    const canvas = canvasEl.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const world = pointerToWorld({ x: clientX - rect.left, y: clientY - rect.top });
    const tilePx = tilePixelSize();
    if (tilePx <= 0) return null;
    return [world.x / tilePx, world.y / tilePx];
  }
  function planWorldPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasEl.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return pointerToWorld({ x: clientX - rect.left, y: clientY - rect.top });
  }
  const planTools = plan
    ? usePlanCanvasTools({
        plan,
        layers,
        cellAt: planCellAt,
        gridPointAt: planGridPointAt,
        worldPointAt: planWorldPointAt,
        tilePixelSize,
      })
    : null;

  function isPlanLayerActive(): boolean {
    return !!planTools && activeLayer?.value === "plan";
  }

  function undoEdit(): void {
    if (isPlanLayerActive()) { void plan!.undo.undo(); return; }
    cmdStack.undo();
    canUndo.value = cmdStack.canUndo();
    canRedo.value = cmdStack.canRedo();
  }

  function redoEdit(): void {
    if (isPlanLayerActive()) { void plan!.undo.redo(); return; }
    cmdStack.redo();
    canUndo.value = cmdStack.canUndo();
    canRedo.value = cmdStack.canRedo();
  }

  // ── Deterministic variant picking ──────────────────────────────────────
  // hash32/pickVariant live in src/cartographer/tileVariants.ts; see its
  // colocated test for why these seed strings must never change.

  function floorVariantCount(): number {
    return packRuntime.value ? packRuntime.value.variantCount("floor") : 0;
  }

  function pickFloorVariant(x: number, y: number): number {
    return pickVariant(mapKey.value, "floor", x, y, floorVariantCount());
  }

  function pickWallVariant(x: number, y: number, side: "N" | "W", kind: PaintedWallKind = "wall"): number {
    if (!packRuntime.value) return 0;
    // The plain wall keeps its original seed label ("wallSegmentH/V"): it is
    // locked by tests, and changing it re-randomises every saved map.
    const category = wallKindCategory(kind, side);
    return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
  }

  function pickTerrainVariant(x: number, y: number): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, "terrain", x, y, packRuntime.value.variantCount("terrainWater"));
  }

  function pickSolidVariant(x: number, y: number): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, "solid", x, y, packRuntime.value.variantCount("solidBlock"));
  }

  function pickDoorVariant(x: number, y: number, category: PackCategory): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
  }

  function pickObjectVariant(cat: StampCategory, x: number, y: number): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, cat, x, y, packRuntime.value.variantCount(cat));
  }

  function activePackVersion(): number {
    return packRuntime.value?.manifest.pack_version
      ?? selectablePacks.value.find((pack) => pack.pack_id === currentPackId.value)?.pack_version
      ?? 1;
  }

  // Mutation context handed to paintOps functions — `layers` is the same
  // reactive object as layers.value, so writes through it stay reactive.
  function paintContext(): PaintContext {
    return { layers: layers.value, packId: currentPackId.value, packVersion: activePackVersion(), wallVisible: wallVisible.value };
  }

  // Rectangle/line cell enumeration moved to `src/lib/map/gestures/` (epic
  // #884 S7a, the paint-systems merge) — `cellsInRect`/`cellsInLine` are
  // imported above, unchanged, now the shared home for any layer that wants
  // the same shapes.

  // World pixel coords (canvas-pixel space) given an event on the canvas.
  function pointerToWorld(local: { x: number; y: number }): { x: number; y: number } {
    const { dpr } = devicePixelDims();
    return {
      x: viewportOffset.value.x + local.x * dpr,
      y: viewportOffset.value.y + local.y * dpr,
    };
  }

  function tilePixelSize(): number {
    return BASE_TILE_SIZE * zoom.value * (window.devicePixelRatio || 1);
  }

  /** Inclusive bounds of every cell that holds floor; null for an empty map. */
  function paintedBounds(): CellBounds | null {
    return groundCellBounds(layers.value);
  }

  // Wheel, zoom keys and the Space hand.
  const navigation = useCanvasNavigation({
    canvasEl, zoom, viewportOffset, getBounds: paintedBounds, devicePixelDims, active: keysActive,
  });

  // Centre the viewport on the painted area (or on the origin if the map is empty).
  function centerMap(): void {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const tilePx = tilePixelSize();
    const bounds = paintedBounds();

    // No painted cells → just center on the origin tile.
    const cx = bounds ? (bounds.minX + bounds.maxX + 1) / 2 : 0.5;
    const cy = bounds ? (bounds.minY + bounds.maxY + 1) / 2 : 0.5;
    viewportOffset.value = { x: cx * tilePx - canvas.width / 2, y: cy * tilePx - canvas.height / 2 };
  }

  // ── Solid block tool ────────────────────────────────────────────────────

  function paintSolidAt(x: number, y: number): void {
    if (!packRuntime.value) return;
    const variant = pickSolidVariant(x, y);
    if (paintOps.paintSolidAt(paintContext(), x, y, variant)) markDirty();
  }

  function eraseSolidAt(x: number, y: number): void {
    if (paintOps.eraseSolidAt(paintContext(), x, y)) markDirty();
  }

  // ── Place tool: objects ───────────────────────────────────────────────────

  function paintObjectAt(x: number, y: number): void {
    const armed = armedObject();
    if (!armed) return;
    const count = packRuntime.value?.variantCount(armed.category) ?? 0;
    // A chosen variant the active set does not have (the set was switched) mixes by position instead.
    const variant = typeof armed.variant === "number" && armed.variant < count
      ? armed.variant
      : pickObjectVariant(armed.category, x, y);
    const changed = paintOps.paintObjectAt(
      paintContext(), x, y, armed.category, variant, placeRotation.value,
    );
    if (changed) markDirty();
  }

  function eraseObjectAt(x: number, y: number): void {
    if (paintOps.eraseObjectAt(paintContext(), x, y)) markDirty();
  }

  // ── Wall placement (edge-based, NW ownership) ──────────────────────────

  // The wall tool's primary action: Wall, Grate and Sluice paint their edge;
  // Decal sets the active decal on a wall that is already there.
  function paintWallKindAtCellEdge(edge: CellEdge): void {
    const kind = activeWallKind.value;
    if (kind === "decal") {
      if (paintOps.setDecalAtEdge(paintContext(), edge, activeWallDecal.value)) markDirty();
      return;
    }
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const variant = pickWallVariant(canon.x, canon.y, canon.side, kind);
    strokeState.active = isPainting.value;
    if (paintOps.paintWallAtCellEdge(paintContext(), edge, strokeState, variant, kind)) markDirty();
  }

  // The wall tool's Alt action: the Decal kind peels a decal off, the others erase the edge.
  function eraseWallKindAtCellEdge(edge: CellEdge): void {
    if (activeWallKind.value === "decal") {
      if (paintOps.setDecalAtEdge(paintContext(), edge, undefined)) markDirty();
      return;
    }
    eraseWallAtCellEdge(edge);
  }

  // Shift+click with the wall tool: a straight run from the last wall point,
  // painted through the same per-kind path a plain click uses. The caller owns
  // the undo step, so a click and a drag that follows it are one. The stroke
  // tracker is replaced afterwards so neither its direction lock nor its dedup
  // set carries a run's edges into the drag.
  function paintWallRun(edges: CellEdge[], erase: boolean): void {
    for (const edge of edges) {
      if (erase) eraseWallKindAtCellEdge(edge); else paintWallKindAtCellEdge(edge);
    }
    strokeState = paintOps.createStrokeState();
  }

  // A wall stroke's edge under the pointer; remembered so Shift can keep the
  // stroke on its line and the next Shift+click can run on from its end.
  function wallStrokeAt(edge: CellEdge, erase: boolean): void {
    straight.noteWallEdge(edge);
    if (erase) eraseWallKindAtCellEdge(edge); else paintWallKindAtCellEdge(edge);
  }

  // Writes a wall edge directly, skipping stroke tracking. Used by wrap-walls
  // and the rectangle perimeter — operations that aren't "strokes".
  function setWallEdgeIfEmpty(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const variant = pickWallVariant(canon.x, canon.y, canon.side);
    if (paintOps.setWallEdgeIfEmpty(paintContext(), edge, variant)) markDirty();
  }

  // ── Door tool (edge-based) ──────────────────────────────────────────────

  function paintDoorAtEdge(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const cat: PackCategory = canon.side === "N" ? "doorwayH" : "doorwayV";
    const newDoorVariant = pickDoorVariant(canon.x, canon.y, cat);
    if (paintOps.paintDoorAtEdge(paintContext(), edge, strokeState, newDoorVariant)) markDirty();
  }

  // Right-click on door edge: revert to plain wall (preserves the edge, removes door).
  function removeDoorAtEdge(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const wallVariant = pickWallVariant(canon.x, canon.y, canon.side);
    if (paintOps.removeDoorAtEdge(paintContext(), edge, wallVariant)) markDirty();
  }

  function eraseWallAtCellEdge(edge: CellEdge): void {
    strokeState.active = isPainting.value;
    if (paintOps.eraseWallAtCellEdge(paintContext(), edge, strokeState)) markDirty();
  }

  // ── Floor tool ──────────────────────────────────────────────────────────

  function paintCell(x: number, y: number): void {
    if (!packRuntime.value) return;
    const variant = pickFloorVariant(x, y);
    if (paintOps.paintCell(paintContext(), x, y, variant)) markDirty();
  }

  function eraseCell(x: number, y: number): void {
    if (paintOps.eraseCell(paintContext(), x, y)) markDirty();
  }

  // ── Terrain tool ────────────────────────────────────────────────────────

  function paintTerrainAt(x: number, y: number): void {
    if (!packRuntime.value) return;
    const changed = paintOps.paintTerrainAt(
      paintContext(), x, y, pickTerrainVariant(x, y), pickFloorVariant(x, y),
    );
    if (changed) markDirty();
  }

  function eraseTerrainAt(x: number, y: number): void {
    if (paintOps.eraseTerrainAt(paintContext(), x, y)) markDirty();
  }

  // ── One-shot actions ────────────────────────────────────────────────────

  // Fill bucket: flood-fill from (cx, cy) up to the walls and the brushed outline,
  // planting floor (existing floor is re-skinned, keeping its shape). Bounded by a 2 000-cell safety cap.
  function applyFill(cx: number, cy: number): void {
    if (!packRuntime.value) return;
    paintGroundBatch(new Set(paintOps.fillRegion(layers.value, cx, cy, 2000)));
  }

  // Wrap walls: find the connected floor region and place walls on every boundary
  // edge facing void that doesn't already have a wall/door.
  function applyWrapWalls(cx: number, cy: number): void {
    if (!layers.value.floor[cellKey(cx, cy)]?.floor) return;
    const region = floodFill(cx, cy, (x, y) => !!layers.value.floor[cellKey(x, y)]?.floor);
    for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
  }

  // Rectangle fill: paint all cells in the bounding rect; `withWalls` (the
  // tool's Walls option) also wraps its perimeter — a layer with no walls would
  // simply leave it unused.
  function applyRect(ax: number, ay: number, bx: number, by: number, withWalls: boolean): void {
    if (!packRuntime.value) return;
    const stroke = rectangleGesture(ax, ay, bx, by, withWalls);
    paintGroundBatch(new Set(stroke.cells), stroke.withWalls ? "visible" : "none");
  }

  // Line: Bresenham floor line between two cells.
  function applyLine(ax: number, ay: number, bx: number, by: number): void {
    if (!packRuntime.value) return;
    paintGroundBatch(new Set(cellsInLine(ax, ay, bx, by)));
  }

  // Room template: fill the chosen shape centered on (ax, ay) and wrap walls.
  function applyTemplate(ax: number, ay: number, bx: number, by: number): void {
    if (!packRuntime.value) return;
    const r = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const keys = cellsForTemplate(ax, ay, r, activeTemplateShape.value);
    paintGroundBatch(new Set(keys), "visible");
  }

  function paintGroundBatch(cells: ReadonlySet<CellKey>, walls: GroundWallMode = "none"): void {
    const first = cells.values().next().value;
    if (!first) return;
    const [x, y] = parseCellKey(first);
    layers.value = paintGroundCells(layers.value, cells, {
      pack_id: currentPackId.value, pack_version: activePackVersion(), variant: pickFloorVariant(x, y),
    }, "floor", walls, {
      name: `${packRuntime.value?.manifest.name ?? currentPackId.value} ground`,
      variants: Object.fromEntries([...cells].map((key) => { const [cx, cy] = parseCellKey(key); return [key, pickFloorVariant(cx, cy)]; })),
    });
    markDirty();
  }

  // Cell painters (Tiles, Water, Rock): paint or erase each cell in turn.
  function paintCellsWith(tool: CellPainter, cells: ReadonlyArray<readonly [number, number]>, erase: boolean): void {
    for (const [x, y] of cells) {
      if (tool === "floor") { if (erase) eraseCell(x, y); else paintCell(x, y); }
      else if (tool === "terrain") { if (erase) eraseTerrainAt(x, y); else paintTerrainAt(x, y); }
      else if (erase) eraseSolidAt(x, y);
      else paintSolidAt(x, y);
    }
  }

  // Round brush: discs at most radius / 3 apart along the pointer path, so a
  // fast drag leaves one smooth stroke instead of a string of dots. Positions
  // are fractional cells. The stroke makes walls (brushWalls.ts): it grows the
  // room it starts in, or makes a new one on empty ground; Alt carves.
  function brushTo(x: number, y: number): void {
    if (!packRuntime.value || !brushBase) return;
    const r = brushRadius.value;
    const from = brushLast;
    const step = r / 3;
    const dist = from ? Math.hypot(x - from[0], y - from[1]) : 0;
    const n = from ? Math.max(1, Math.ceil(dist / step)) : 1;
    for (let i = 1; i <= n; i++) {
      const t = from ? i / n : 1;
      const disc = { x: from ? from[0] + (x - from[0]) * t : x, y: from ? from[1] + (y - from[1]) * t : y, r };
      brushDiscs.push(disc);
      brushFootprint!.moveTo(disc.x + r, disc.y);
      brushFootprint!.arc(disc.x, disc.y, r, 0, Math.PI * 2);
    }
    brushLast = [x, y];
    brushResult.value = null;
    clearTimeout(brushPause);
    brushPause = setTimeout(() => {
      brushResult.value = computeBrush();
      scheduleRender();
    }, 150);
    scheduleRender();
  }

  function computeBrush(): DungeonMapLayers {
    const pack = brushMaterial!;
    return applyBrushStroke(brushBase!, { discs: brushDiscs }, {
      erase: brushErase, pack, wall: { ...pack, variant: 0 }, newKey: () => crypto.randomUUID(),
      mode: brushMode, targetId: brushTarget, walls: brushWalls, category: brushGroundCategory, name: brushName,
    });
  }

  function clearBrush(): void {
    clearTimeout(brushPause);
    brushBase = null;
    brushDiscs = [];
    brushFootprint = null;
    brushResult.value = null;
    scheduleRender();
  }

  function commitBrush(): void {
    const next = brushResult.value ?? computeBrush();
    if (next !== brushBase) {
      layers.value = next;
      if (brushMode === "new" && !brushErase) {
        groundEdit.selectedId.value = Object.entries(next.ground).find(([id]) => brushBase?.ground[id] === undefined)?.[0] ?? groundEdit.selectedId.value;
      }
      markDirty();
    }
  }

  // ── Alt inverts a painting tool ──────────────────────────────────
  // Same idea as the Plan's Door tool (usePlanCanvasTools.ts): holding Alt
  // while a tool would paint erases what it paints instead, as one
  // undoable stroke. Erase mirrors of the shape tools below use the SAME
  // cell enumeration as their paint counterparts (`cellsInRect`/
  // `cellsInLine`/`cellsForTemplate`) so "the cells the shape covers" means
  // one thing everywhere — they deliberately skip the wall-wrap step their
  // paint counterparts do, since there's no wall to wrap when erasing floor.

  function eraseRectCells(ax: number, ay: number, bx: number, by: number): void {
    for (const key of cellsInRect(ax, ay, bx, by)) {
      const [x, y] = parseCellKey(key);
      eraseCell(x, y);
    }
  }

  function eraseLineCells(ax: number, ay: number, bx: number, by: number): void {
    for (const key of cellsInLine(ax, ay, bx, by)) {
      const [x, y] = parseCellKey(key);
      eraseCell(x, y);
    }
  }

  function eraseTemplateCells(ax: number, ay: number, bx: number, by: number): void {
    const r = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (const key of cellsForTemplate(ax, ay, r, activeTemplateShape.value)) {
      const [xs, ys] = (key as string).split(",");
      eraseCell(Number(xs), Number(ys));
    }
  }

  // ── Canvas rendering ────────────────────────────────────────────────────

  function devicePixelDims(): { w: number; h: number; dpr: number } {
    const canvas = canvasEl.value!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width, h: rect.height, dpr };
  }

  function resizeCanvasIfNeeded(): void {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const { w, h, dpr } = devicePixelDims();
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ground = groundCanvasEl?.value;
    if (ground && (ground.width !== targetW || ground.height !== targetH)) {
      ground.width = targetW;
      ground.height = targetH;
    }
    if (canvasBox.value.w !== w || canvasBox.value.h !== h || canvasBox.value.dpr !== dpr) canvasBox.value = { w, h, dpr };
  }

  function viewportToCell(px: number, py: number): [number, number] {
    const { dpr } = devicePixelDims();
    const tileCSS = BASE_TILE_SIZE * zoom.value;
    const worldX = viewportOffset.value.x + px * dpr;
    const worldY = viewportOffset.value.y + py * dpr;
    const x = Math.floor(worldX / (tileCSS * dpr));
    const y = Math.floor(worldY / (tileCSS * dpr));
    return [x, y];
  }

  function visibleCellBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const { w, h, dpr } = devicePixelDims();
    const tileCSS = BASE_TILE_SIZE * zoom.value;
    const minX = Math.floor(viewportOffset.value.x / (tileCSS * dpr));
    const minY = Math.floor(viewportOffset.value.y / (tileCSS * dpr));
    const maxX = Math.ceil((viewportOffset.value.x + w * dpr) / (tileCSS * dpr));
    const maxY = Math.ceil((viewportOffset.value.y + h * dpr) / (tileCSS * dpr));
    return { minX, minY, maxX, maxY };
  }

  function render(): void {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    resizeCanvasIfNeeded();
    const { dpr } = devicePixelDims();
    const tileCSS = BASE_TILE_SIZE * zoom.value;
    const tilePx = tileCSS * dpr;
    const bounds = visibleCellBounds();

    // While motion plays the map is two canvases with the live water between them, as on the battle map: the ground
    // canvas holds the background and the ground, this one what stands, the veil and the editing aids. Both leave out
    // what the live layer draws itself (a swaying prop, a door leaf).
    const ground = motionPlaying?.() ? groundCanvasEl?.value ?? null : null;
    const groundCtx = ground?.getContext("2d") ?? null;

    const scene = (target: CanvasRenderingContext2D, size: HTMLCanvasElement, pass: "ground" | "standing" | undefined): MapRenderScene => ({
      ctx: target,
      canvasWidth: size.width,
      canvasHeight: size.height,
      tilePx,
      // Edits mutate `layers` in place, so its identity alone cannot tell the
      // shadow cache that walls moved; the edit counter can (#1065).
      layersRevision: editRevision.value,
      viewportOffset: viewportOffset.value,
      bounds,
      layers: shownLayers.value,
      metadata: metadata.value,
      glyphs: cellGlyphs.value,
      runtimes: loadedRuntimes.value,
      dressing: dressing.value,
      fallbackRuntime: packRuntime.value,
      currentPackId: currentPackId.value,
      darkness: darkness.value,
      activeTool: activeTool.value,
      viewMode: viewMode(),
      hoveredEdge: hoveredEdge.value,
      hoverCell: hoverCell.value,
      brushPreview: activeTool.value === "brush" && hoverPoint.value && !viewMode()
        ? { x: hoverPoint.value[0], y: hoverPoint.value[1], radius: brushRadius.value, erase: altHeld.value }
        : null,
      selectedCell: selectedCell.value,
      previewCells: previewCells.value,
      referenceImage: getReferenceImage(tilePx, viewportOffset.value),
      gridAlpha: gridAlpha.value,
      ...dressingTool.renderScene(),
      editorMarks: {
        brushStroke: brushFootprint && !brushResult.value ? { path: brushFootprint, erase: brushErase } : null,
        wallRun: activeTool.value === "angledWall" ? { points: angledTool.run.value, hover: angledTool.hover.value } : null,
        selectedWallId: angledTool.selectedId.value,
        wallNodes: activeTool.value === "select" && wallNodes.hasSelection.value ? wallNodeMarks() : null,
        showLights: activeTool.value === "light" || activeTool.value === "select",
        selectedLightId: lightTool.selectedId.value,
        selectedLightIds: activeTool.value === "select" ? [...selectTool.multiLights.value] : [],
        selectedProps: activeTool.value === "select" ? selectTool.propOutlines() : [],
        marquee: activeTool.value === "select" ? selectTool.marquee.value : null,
        lightGhost: activeTool.value === "light" && lightTool.hover.value
          ? { point: lightTool.hover.value, light: lightDraft.value }
          : null,
      },
      omitLive: ground !== null,
      pass,
    });

    if (ground && groundCtx) renderMap(scene(groundCtx, ground, "ground"));
    renderMap(scene(ctx, canvas, ground ? "standing" : undefined));

    // ── Plan overlay (#884 S7b) — drawn over the Drawing, on the same
    // canvas, in the same tile-pixel space `renderMap` just used. Always
    // shown once a site's Plan exists (like the reference Picture's own
    // ghost), not just while the Plan layer is the active one — a DM traces
    // against the Drawing underneath, so both must be visible together.
    if (planTools) {
      // Zoning sits over the Drawing: the layers below it show dimmed, so the traced rooms are what the eye finds.
      if (isPlanLayerActive()) {
        ctx.fillStyle = LAYERS_BELOW_SCRIM;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (groundCtx && ground) {
          groundCtx.fillStyle = LAYERS_BELOW_SCRIM;
          groundCtx.fillRect(0, 0, ground.width, ground.height);
        }
      }
      const viewport: TileViewport = { tilePx, viewportOffset: viewportOffset.value };
      const planScene = planTools.renderScene();
      drawPlanSpaces(ctx, viewport, planScene.regions, planScene.activeRegionId, planScene.cellsOverride);
      drawPlanWays(ctx, viewport, planScene.ways);
      drawPlanZones(ctx, viewport, planScene.regions, planScene.activeRegionId, planScene.cellsOverride);
      if (isPlanLayerActive()) {
        drawPlanTracingOverlay(
          ctx, viewport, planScene.tracingRing, planScene.tracingClosed, planScene.tracingHoverPoint,
          planScene.templateDraft, planScene.templateRingPreview,
        );
        if (planScene.hoveredDoorEdge) drawPlanDoorHover(ctx, viewport, planScene.hoveredDoorEdge);
      }
    }
  }

  /** The picked wall run as the canvas draws it: bones and nodes of the run, the landing point of a drag. */
  function wallNodeMarks(): WallNodeMarks {
    const { runs, nodes } = wallNodes.selection.value;
    const focus = wallNodes.focus.value;
    return {
      bones: runs.map((r) => ({ id: r.id, a: r.a, b: r.b, path: r.path })),
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, smooth: n.smooth })),
      focusBone: focus?.kind === "bone" ? focus.runId : null,
      focusNode: focus?.kind === "node" ? focus.id : null,
      hoverNode: wallNodes.hoverNode.value,
      draggedNode: wallNodes.draggedNode.value,
      snap: wallNodes.snap.value,
    };
  }

  let rafId = 0;
  function scheduleRender(): void {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  const planRenderDeps = planTools
    ? [
        plan!.regions, plan!.ways, plan!.activeRegionId, plan!.planTool, plan!.traceTool,
        planTools.renderDeps.hoveredDoorEdge, planTools.renderDeps.strokeCells, planTools.renderDeps.draftRing,
        planTools.renderDeps.templateDraft, planTools.renderDeps.liveDrag, planTools.renderDeps.penHoverPoint, planTools.renderDeps.eraseTouched,
      ]
    : [];
  watch(
    [
      zoom, viewportOffset, layers, loadedRuntimes, dressing, currentPackId, darkness, hoverCell, hoverPoint, brushRadius, altHeld, hoveredEdge, activeTool,
      previewCells, metadata, selectedCell, cellGlyphs,
      dressingTool.hover, placeItem, placeRotation, selectedDressingId, angledTool.run, angledTool.hover, angledTool.selectedId, lightTool.hover, lightTool.selectedId, lightDraft, gridAlpha,
      shownLayers, wallNodes.selection, wallNodes.focus, wallNodes.hoverNode, wallNodes.snap, selectTool.marquee, selectTool.multiProps, selectTool.multiLights, selectTool.multiObjects, ...extraRenderDeps, ...planRenderDeps,
    ],
    () => scheduleRender(),
    { deep: true },
  );
  if (activeLayer) {
    watch(activeLayer, (next, prev) => {
      scheduleRender();
      // #884 review finding 2: `useRegionPointer`'s window-level pointermove/
      // pointerup listeners outlive a layer switch — nothing used to tear
      // them down here, only on unmount — so a stroke/pen-drag/template-drag
      // started on Plan and released after switching to Drawing would still
      // commit through those stale listeners. Abandon it, the same way
      // Escape already abandons an unsaved pen draft.
      if (prev === "plan" && next !== "plan") planTools?.abandonGesture();
      if (next !== "drawing") wallNodes.clearSelection();
    });
  }
  // Motion starting or stopping swaps one canvas for two (or back): draw again, once the ground canvas is mounted.
  watch(() => [!!motionPlaying?.(), groundCanvasEl?.value], () => scheduleRender(), { flush: "post" });
  // viewMode is a getter over a prop, not a ref — watched separately so the
  // list above can stay a plain array of refs.
  watch(viewMode, () => scheduleRender());

  // ── Pointer interaction ─────────────────────────────────────────────────

  function getLocalPointer(ev: MouseEvent): { x: number; y: number } {
    const rect = canvasEl.value!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function startPan(ev: PointerEvent): void {
    isPanning.value = true;
    canvasEl.value?.setPointerCapture(ev.pointerId);
  }

  function toolPointerDown(ev: PointerEvent): void {
    toolPointerDownNow(ev);
    syncBusy();
  }

  function toolPointerDownNow(ev: PointerEvent): void {
    const local = getLocalPointer(ev);
    lastPointer = local;

    // View mode: pan only — skip all painting logic.
    if (viewMode()) {
      isPanning.value = true;
      return;
    }

    // Middle button, or left with Space held: pans with any tool on either layer.
    if (navigation.isForcedPan(ev)) {
      startPan(ev);
      return;
    }

    // The Picture layer (#1125) has no tools on the canvas: the picture is placed from its palette, so a press
    // can only mean "move the view".
    if (activeLayer?.value === "picture") {
      startPan(ev);
      return;
    }

    // Plan layer (#884 S7b): every gesture routes to `planTools` instead of
    // the Drawing tools below — EXCEPT a right-button pan, which
    // `planTools.onPointerDown` reports by returning false.
    // Panning is handled directly here rather than by falling through into
    // the Drawing-specific branches below: those key off `activeTool` (the
    // Drawing's OWN tool selection, untouched while a DM works the Plan) and
    // must never fire on a Plan-layer gesture just because `activeTool`
    // happens to still be pointed at "wall" or "door" from earlier.
    if (isPlanLayerActive()) {
      if (planTools!.onPointerDown(ev)) return;
      startPan(ev);
      return;
    }

    const [cx, cy] = viewportToCell(local.x, local.y);

    // Dressing: place, pick up, move and remove props.
    if (activeTool.value === "place" && placeErases(ev)) {
      // Right button or Alt: a prop under the pointer goes first (it draws above objects), else the object.
      if (ev.button === 2) ev.preventDefault();
      if (!dressingTool.removeTopAt(fractionalCellAt(ev))) {
        const before = snapshotStr();
        eraseObjectAt(cx, cy);
        const after = snapshotStr();
        if (before !== after) pushCommand(before, after);
      }
      return;
    }

    if (activeTool.value === "place" && !armedObject()
      && dressingTool.onPointerDown({
        cell: [cx, cy], frac: fractionalCellAt(ev), button: ev.button, altKey: ev.altKey,
      })) {
      if (ev.button === 2) ev.preventDefault();
      if (dressingTool.isHolding()) canvasEl.value?.setPointerCapture(ev.pointerId);
      return;
    }

    // Angled wall: each left click adds a point to the run (right button still pans).
    if (activeTool.value === "angledWall" && ev.button === 0) {
      angledTool.click(fractionalCellAt(ev), ev.altKey);
      return;
    }

    // Light: a click puts one down, or picks one up to move it.
    if (activeTool.value === "light" && ev.button === 0) {
      lightTool.onPointerDown(fractionalCellAt(ev), ev.altKey);
      canvasEl.value?.setPointerCapture(ev.pointerId);
      return;
    }

    // Link / annotate: LMB selects cell; RMB falls through to pan.
    if ((activeTool.value === "link" || activeTool.value === "annotate") && ev.button !== 2) {
      selectedCell.value = [cx, cy];
      if (activeTool.value === "annotate") {
        setTimeout(() => toolOptionsRef.value?.annotationInputEl?.focus(), 0);
      }
      return;
    }

    // Door right-click: remove door → plain wall (before the generic pan check).
    if (activeTool.value === "door" && ev.button === 2 && hoveredEdge.value) {
      ev.preventDefault();
      const before = snapshotStr();
      removeDoorAtEdge(hoveredEdge.value);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return;
    }

    // Shift+click with the wall tool: a straight wall from the last wall point.
    if (activeTool.value === "wall" && ev.shiftKey && ev.button === 0) {
      const run = straight.runFromAnchor(fractionalCellAt(ev), true);
      if (run) {
        // The run opens an ordinary wall stroke, so holding the button and dragging
        // carries on along the same line, and the run and the drag are one undo step.
        isPainting.value = true;
        canvasEl.value?.setPointerCapture(ev.pointerId);
        strokeState = paintOps.createStrokeState();
        straight.beginStroke();
        strokeSnapshot = snapshotStr();
        paintWallRun(run, ev.altKey);
        const last = run.at(-1);
        if (last) straight.noteWallEdge(last);
        return;
      }
    }

    // The Pan tool, or an RMB the tools above did not claim, pans.
    if (navigation.isPanStart(ev, activeTool.value)) {
      startPan(ev);
      return;
    }

    // Select, as Illustrator's Direct Selection: click picks one thing, Shift adds, Alt picks a whole wall, and a drag on
    // empty ground draws a marquee. The map pans with Space, the Pan tool, the middle button and the wheel.
    if (activeTool.value === "select") {
      if (ev.button !== 0) return;
      selectTool.press(fractionalCellAt(ev), [cx, cy], { shift: ev.shiftKey, alt: ev.altKey });
      canvasEl.value?.setPointerCapture(ev.pointerId);
      return;
    }

    // One-shot tools: apply immediately without entering stroke mode.
    if (activeTool.value === "fill") {
      const before = snapshotStr();
      applyFill(cx, cy);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return;
    }
    if (activeTool.value === "wrap") {
      const before = snapshotStr();
      applyWrapWalls(cx, cy);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return;
    }

    // Stroke-based tools.
    isPainting.value = true;
    canvasEl.value?.setPointerCapture(ev.pointerId);
    strokeState = paintOps.createStrokeState();
    straight.beginStroke();
    strokeSnapshot = snapshotStr();

    // Rect / line / template tools: record drag start; first cell is the preview seed.
    if (activeTool.value === "rect" || activeTool.value === "line" || activeTool.value === "template") {
      dragStartCell = [cx, cy];
      previewCells.value = new Set([cellKey(cx, cy)]);
      return;
    }

    if (activeTool.value === "brush") {
      brushLast = null;
      brushVariant = pickFloorVariant(cx, cy);
      brushBase = toRaw(layers.value);
      brushFootprint = new Path2D();
      brushDiscs = [];
      brushErase = ev.altKey;
      brushMode = brushRegionMode.value;
      brushTarget = groundEdit.selectedId.value;
      brushWalls = brushWallMode.value;
      brushGroundCategory = brushCategory.value;
      brushName = `${packRuntime.value?.manifest.name ?? currentPackId.value} ${brushGroundCategory === "terrainWater" ? "water" : "ground"}`;
      brushMaterial = { pack_id: currentPackId.value, pack_version: activePackVersion(), variant: brushVariant };
      for (const [px, py] of straight.brushPress(fractionalCellAt(ev), ev.shiftKey)) brushTo(px, py);
      return;
    }

    if (isCellPainter(activeTool.value)) paintCellsWith(activeTool.value, straight.cellPress([cx, cy], ev.shiftKey), ev.altKey);
    else if (activeTool.value === "place" && armedObject()) { if (ev.altKey) eraseObjectAt(cx, cy); else paintObjectAt(cx, cy); }
    else if (activeTool.value === "eraser") {
      if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
      else if (dressingTool.eraseTopAt(fractionalCellAt(ev))) { /* props draw above objects, so they go first */ }
      else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
      else if (layers.value.annotation[cellKey(cx, cy)]) {
        const next = { ...layers.value.annotation }; delete next[cellKey(cx, cy)]; layers.value.annotation = next; markDirty();
      }
      else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
      else if (layers.value.terrain[cellKey(cx, cy)]) eraseTerrainAt(cx, cy);
      else eraseCell(cx, cy);
    } else if (activeTool.value === "wall" && hoveredEdge.value) {
      wallStrokeAt(hoveredEdge.value, ev.altKey);
    } else if (activeTool.value === "door") {
      doorPress(ev, cx, cy);
    }
  }

  /**
   * The Door tool's press. A click on an angled wall (and not on a wall of the grid under it) turns that wall into a
   * door and back; anywhere else it acts on the grid edge under the pointer, as it always did.
   */
  function doorPress(ev: PointerEvent, cx: number, cy: number): void {
    const edge = hoveredEdge.value;
    const angled = angledTool.wallNear(fractionalCellAt(ev));
    const gridWall = edge ? wallAt(layers.value, edge.x, edge.y, edge.side) : undefined;
    if (angled && !gridWall) {
      if (angledTool.toggleDoor(angled, pickDoorVariant(cx, cy, "doorwayH"))) markDirty();
      return;
    }
    if (!edge) return;
    if (ev.altKey) removeDoorAtEdge(edge); else paintDoorAtEdge(edge);
  }

  function toolPointerMove(ev: PointerEvent): void {
    const local = getLocalPointer(ev);
    const [cx, cy] = viewportToCell(local.x, local.y);
    hoverCell.value = [cx, cy];
    hoverPoint.value = activeTool.value === "brush" ? fractionalCellAt(ev) : null;
    dressingTool.setHover([cx, cy]);
    dressingTool.onPointerMove([cx, cy]);
    if (activeTool.value === "angledWall") angledTool.track(fractionalCellAt(ev), ev.altKey);
    if (activeTool.value === "light" || lightTool.isHolding()) lightTool.onPointerMove(fractionalCellAt(ev), ev.altKey);
    if (activeTool.value === "select" && !viewMode() && !isPanning.value && !isPlanLayerActive()) {
      selectTool.move(fractionalCellAt(ev), { shift: ev.shiftKey, alt: ev.altKey });
      if (wallNodes.dragging.value || selectTool.isHolding()) {
        lastPointer = local;
        return;
      }
    }

    // Plan layer (#884 S7b) — its own hover/gesture tracking (door edge-snap,
    // paint/pen/template) instead of the Drawing's edge-hover/tool-dispatch
    // below (both keyed off `activeTool`, the Drawing's own tool selection).
    // The shared pan-drag block further down still runs either way — panning
    // stays universal across both layers.
    const planLayerActive = isPlanLayerActive();
    if (planLayerActive && !isPanning.value) planTools!.onPointerMove(ev);

    // Update edge-hover state for tools that target edges (wall, door, edge-eraser).
    const tool = activeTool.value;
    if (!planLayerActive && (tool === "wall" || tool === "door" || tool === "eraser")) {
      const world = pointerToWorld(local);
      let edge = detectHoveredEdge(world.x, world.y, tilePixelSize(), EDGE_HOVER_THRESHOLD);
      // If a stroke has locked its direction, suppress highlights for the
      // perpendicular axis — visual feedback matches what will actually paint.
      if (edge && isPainting.value && strokeState.direction !== null && paintOps.edgeDirection(edge.side) !== strokeState.direction) {
        edge = null;
      }
      // Shift also pins a wall stroke to the grid line it began on.
      if (edge && tool === "wall" && isPainting.value && straight.wallEdgeOffLine(edge, ev.shiftKey)) edge = null;
      hoveredEdge.value = edge;
    } else {
      hoveredEdge.value = null;
    }

    if (isPanning.value && lastPointer) {
      const dx = local.x - lastPointer.x;
      const dy = local.y - lastPointer.y;
      const { dpr } = devicePixelDims();
      viewportOffset.value = {
        x: viewportOffset.value.x - dx * dpr,
        y: viewportOffset.value.y - dy * dpr,
      };
    } else if (isPainting.value) {
      if ((tool === "rect" || tool === "line") && dragStartCell) {
        const [ex, ey] = constrainShapeEnd(tool, dragStartCell, [cx, cy], ev.shiftKey);
        previewCells.value = new Set(tool === "rect"
          ? cellsInRect(dragStartCell[0], dragStartCell[1], ex, ey)
          : cellsInLine(dragStartCell[0], dragStartCell[1], ex, ey));
      } else if (tool === "template" && dragStartCell) {
        const r = Math.max(Math.abs(cx - dragStartCell[0]), Math.abs(cy - dragStartCell[1]));
        previewCells.value = new Set(cellsForTemplate(dragStartCell[0], dragStartCell[1], r, activeTemplateShape.value));
      } else if (tool === "brush") {
        const [fx, fy] = straight.brushTarget(fractionalCellAt(ev), ev.shiftKey);
        brushTo(fx, fy);
      } else if (isCellPainter(tool)) paintCellsWith(tool, straight.cellDrag([cx, cy], ev.shiftKey), ev.altKey);
      else if (tool === "place" && armedObject()) { if (ev.altKey) eraseObjectAt(cx, cy); else paintObjectAt(cx, cy); }
      else if (tool === "eraser") {
        if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
        else if (dressingTool.eraseTopAt(fractionalCellAt(ev))) { /* props draw above objects, so they go first */ }
        else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
        else if (layers.value.annotation[cellKey(cx, cy)]) {
          const next = { ...layers.value.annotation }; delete next[cellKey(cx, cy)]; layers.value.annotation = next; markDirty();
        }
        else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
        else if (layers.value.terrain[cellKey(cx, cy)]) eraseTerrainAt(cx, cy);
        else eraseCell(cx, cy);
      } else if (tool === "wall" && hoveredEdge.value) {
        wallStrokeAt(hoveredEdge.value, ev.altKey);
      } else if (tool === "door" && hoveredEdge.value) {
        if (ev.altKey) removeDoorAtEdge(hoveredEdge.value); else paintDoorAtEdge(hoveredEdge.value);
      }
    }

    lastPointer = local;
  }

  function toolPointerUp(ev: PointerEvent): void {
    toolPointerUpNow(ev);
    syncBusy();
  }

  function toolPointerUpNow(ev: PointerEvent): void {
    // Also bound to `@pointerleave` (MapWorkbench's template) — clears the
    // Plan's hover state (door edge highlight, pen cursor tracking) either way.
    planTools?.onPointerLeave();
    // Select: a group drag or a marquee ends first, so the wall controller's own release below sees a settled drag.
    let selectClick: "cell" | null = null;
    if (activeTool.value === "select" && selectTool.isHolding()) {
      selectClick = selectTool.release(fractionalCellAt(ev), { shift: ev.shiftKey, alt: ev.altKey });
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (dressingTool.isHolding()) {
      dressingTool.onPointerUp();
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (lightTool.isHolding()) {
      lightTool.onPointerUp();
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (wallNodes.dragging.value) {
      wallNodes.pointerUp();
      selectTool.normalize();
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (isPanning.value) {
      isPanning.value = false;
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (isPainting.value) {
      const tool = activeTool.value;

      // Commit rect / line / template on release. Alt inverts to the erase
      // mirror — checked at release time, matching "holding Alt while
      // dragging" rather than whatever the modifier was when the drag began.
      if ((tool === "rect" || tool === "line" || tool === "template") && dragStartCell) {
        const local = getLocalPointer(ev);
        const [cx, cy] = viewportToCell(local.x, local.y);
        const [ax, ay] = dragStartCell;
        const [ex, ey] = constrainShapeEnd(tool, dragStartCell, [cx, cy], ev.shiftKey);
        const before = strokeSnapshot ?? snapshotStr();
        if (ev.altKey) {
          if (tool === "rect") eraseRectCells(ax, ay, ex, ey);
          else if (tool === "line") eraseLineCells(ax, ay, ex, ey);
          else eraseTemplateCells(ax, ay, cx, cy);
        } else {
          if (tool === "rect") applyRect(ax, ay, ex, ey, rectWalls.value);
          else if (tool === "line") applyLine(ax, ay, ex, ey);
          else applyTemplate(ax, ay, cx, cy);
        }
        const after = snapshotStr();
        if (before !== after) pushCommand(before, after);
        dragStartCell = null;
        previewCells.value = new Set();
      } else if (strokeSnapshot !== null) {
        if (tool === "brush" && brushBase) commitBrush();
        // Stroke-based tools: push one undo command for the whole stroke.
        const after = snapshotStr();
        if (strokeSnapshot !== after) pushCommand(strokeSnapshot, after);
      }

      // Where this stroke ended is where the next Shift+click joins on.
      if (tool === "brush") {
        straight.brushEnded(brushLast);
        clearBrush();
      }
      else if (isCellPainter(tool)) straight.cellEnded();
      else if (tool === "wall") straight.wallEnded(fractionalCellAt(ev));

      strokeSnapshot = null;
      isPainting.value = false;
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (selectClick === "cell") {
      const [cx, cy] = viewportToCell(getLocalPointer(ev).x, getLocalPointer(ev).y);
      selectedCell.value = [cx, cy];
    }
    lastPointer = null;
  }

  // ── Touch: two fingers pan and pinch-zoom ──────────────────────────────
  //
  // A mouse pans with the right button and zooms with the wheel; a phone has
  // neither, so every touch went to the active tool and a DM could only paint.
  // Two fingers now pan (drag) and zoom (pinch), the way every map app works.
  //
  // One finger still paints, but not instantly: its press waits TOUCH_HOLD_MS
  // (or until it moves) before reaching the tool, because the second finger of
  // a pinch lands a few tens of milliseconds after the first, and without the
  // wait that first finger would already have painted a cell. If the second
  // finger comes later still, a Drawing stroke already under way is rolled
  // back to where it started, and a prop just placed or picked up is taken
  // back or put down where it was. Mouse and pen input skip all of this.

  const TOUCH_HOLD_MS = 90;
  const TOUCH_SLOP_PX = 6;
  const touches = new Map<number, { x: number; y: number }>();
  let pendingTouch: { ev: PointerEvent; at: { x: number; y: number }; timer: ReturnType<typeof setTimeout> } | null = null;
  let pinch: { start: CanvasViewport; from: Pinch } | null = null;
  /** The touch whose press reached the tool and has not been released yet. */
  let liveToolTouch: PointerEvent | null = null;

  /**
   * The Plan's tracing (`useRegionPointer`) listens for the release on
   * `window`, not on this canvas. When a touch press reaches it late (after
   * the hold) or has to be cut short (a pinch began), that release has to be
   * delivered to it by hand, or it would wait for the next finger to lift.
   */
  function releaseOnWindow(ev: PointerEvent): void {
    if (!isPlanLayerActive()) return;
    window.dispatchEvent(new PointerEvent("pointerup", {
      clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId,
      pointerType: ev.pointerType, button: 0, buttons: 0, bubbles: true,
    }));
  }

  function releasePendingTouch(): void {
    if (!pendingTouch) return;
    clearTimeout(pendingTouch.timer);
    const { ev } = pendingTouch;
    pendingTouch = null;
    toolPointerDown(ev);
    liveToolTouch = ev;
  }

  function abandonToolGesture(): void {
    clearBrush();
    if (pendingTouch) {
      clearTimeout(pendingTouch.timer);
      pendingTouch = null;
    }
    if (liveToolTouch) {
      releaseOnWindow(liveToolTouch);
      liveToolTouch = null;
    }
    if (isPainting.value) {
      if (strokeSnapshot !== null && strokeSnapshot !== snapshotStr()) {
        const s = JSON.parse(strokeSnapshot) as { layers: DungeonMapLayers; metadata: Record<CellKey, CellMetadata> };
        layers.value = s.layers;
        metadata.value = s.metadata;
      }
      strokeSnapshot = null;
      dragStartCell = null;
      previewCells.value = new Set();
      isPainting.value = false;
    }
    dressingTool.cancelGesture();
    lightTool.cancelGesture();
    selectTool.cancelGesture();
    if (wallNodes.dragging.value) wallNodes.cancel();
    syncBusy();
    isPanning.value = false;
    lastPointer = null;
  }

  function startPinch(): void {
    const [a, b] = [...touches.values()];
    pinch = { start: { zoom: zoom.value, offset: viewportOffset.value }, from: pinchOf(a, b) };
  }

  function onPointerDown(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerDown(ev);
      return;
    }
    touches.set(ev.pointerId, getLocalPointer(ev));
    canvasEl.value?.setPointerCapture(ev.pointerId);
    if (touches.size === 2) {
      abandonToolGesture();
      startPinch();
      return;
    }
    // A third finger, or a finger landing while a pinch is still settling:
    // not a tool press.
    if (touches.size > 1 || pinch) return;
    pendingTouch = {
      ev,
      at: getLocalPointer(ev),
      timer: setTimeout(releasePendingTouch, TOUCH_HOLD_MS),
    };
  }

  function onPointerMove(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerMove(ev);
      return;
    }
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, getLocalPointer(ev));
    if (pinch) {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()];
      const next = pinchViewport(pinch.start, pinch.from, pinchOf(a, b), devicePixelDims().dpr);
      zoom.value = next.zoom;
      viewportOffset.value = next.offset;
      return;
    }
    if (pendingTouch && pendingTouch.ev.pointerId === ev.pointerId) {
      const here = getLocalPointer(ev);
      if (Math.hypot(here.x - pendingTouch.at.x, here.y - pendingTouch.at.y) < TOUCH_SLOP_PX) return;
      releasePendingTouch();
    }
    toolPointerMove(ev);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") {
      toolPointerUp(ev);
      return;
    }
    // `@pointerleave` is bound here too and fires for a lifted finger as well
    // as for one that slid off the canvas; either way the finger is done.
    if (!touches.delete(ev.pointerId)) return;
    if (pinch) {
      // The pinch ends only when every finger is up, so the last finger to
      // lift never paints on its way out.
      if (touches.size === 0) pinch = null;
      return;
    }
    // A quick tap: the press was still waiting when the finger lifted, so it
    // reaches the tool now, and the Plan's own release listener is handed the
    // lift it already missed.
    if (pendingTouch && pendingTouch.ev.pointerId === ev.pointerId) {
      releasePendingTouch();
      releaseOnWindow(ev);
    }
    liveToolTouch = null;
    toolPointerUp(ev);
  }

  /** The pen tool's "double-click an edge inserts a node" gesture (#884
   *  S7b) — the Drawing has no double-click behaviour of its own, so this is
   *  a pure pass-through to the Plan, a no-op everywhere else (including on
   *  the standalone route, where `planTools` is null). */
  function onDoubleClick(ev: MouseEvent): void {
    if (isPlanLayerActive()) planTools!.onDoubleClick(ev);
    else if (activeTool.value === "angledWall") angledTool.finish();
    // Double-click a picked wall: a node there (#1125 frame 17).
    else if (activeTool.value === "select" && !viewMode() && wallNodes.hasSelection.value) {
      wallNodes.doubleClick(fractionalCellAt(ev));
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  function onResize(): void {
    scheduleRender();
  }

  // Alt-invert tracked at the window level, alongside the shortcut
  // listener below rather than as a listener of its own — same window,
  // same lifecycle, one less pair of add/removeEventListener calls.
  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key === "Alt") altHeld.value = true;
    if (ev.key === "Escape") straight.forget();
    const targetIsTextEntry = isTextEntry(ev.target);
    if (navigation.onKeyDown(ev)) return;
    const action = resolveKeyAction(
      {
        key: ev.key,
        code: ev.code,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        targetIsTextEntry,
        repeat: ev.repeat,
      },
      {
        activeTool: activeTool.value,
        tools,
        hasLayerTabs,
        layer: activeLayer?.value,
        zoningTools: planTools && !viewMode() ? PLAN_TOOLS : undefined,
        placeArmed: placeItem.value !== null,
        angledRunOpen: angledTool.run.value.length > 0,
        selectionDeletable:
          wallNodes.hasSelection.value
          || angledTool.selectedId.value !== null
          || lightTool.selectedId.value !== null
          || selectTool.isMixed.value
          || (activeTool.value === "select" && selectedDressingId.value !== null),
        selectedPropInSelect: activeTool.value === "select" && selectedDressingId.value !== null,
        selectionPresent:
          selectedDressingId.value !== null
          || lightTool.selectedId.value !== null
          || wallNodes.hasSelection.value
          || selectTool.multiProps.value.size > 0
          || selectTool.multiLights.value.size > 0
          || selectTool.multiObjects.value.size > 0
          || angledTool.selectedId.value !== null
          || selectedCell.value !== null,
      },
    );
    if (!action) return;

    switch (action.kind) {
      case "undo": undoEdit(); break;
      case "redo": redoEdit(); break;
      case "center": centerMap(); break;
      case "zoom":
        // The browser's own zoom keys keep working anywhere but over the map.
        if (keysActive && !keysActive()) return;
        navigation.zoomTo(action.to);
        break;
      case "rotatePlace": {
        const object = selectTool.lonelyObject.value;
        if (object) selectTool.rotateObjects((((object.rotation + action.delta) % 360) + 360) % 360);
        else dressingTool.turn(action.delta);
        break;
      }
      case "clearSelection":
        // Esc lets go of a drag first, and only then of what is picked.
        if (wallNodes.dragging.value || selectTool.isHolding()) {
          selectTool.cancelGesture();
          if (wallNodes.dragging.value) wallNodes.cancel();
          syncBusy();
        } else selectTool.clear();
        break;
      case "selectZoningTool": {
        const tool = PLAN_TOOLS.find((t) => t.id === action.tool);
        if (tool && plan) plan.planTool.value = tool.id;
        break;
      }
      case "deleteDressing": dressingTool.deleteSelected(); break;
      case "disarmPlace": placeItem.value = null; break;
      case "finishAngledWall": angledTool.finish(); break;
      case "abandonAngledWall": angledTool.abandon(); break;
      case "deleteSelected":
        if (activeTool.value === "select" && selectTool.deleteAll()) break;
        if (activeTool.value === "select" && wallNodes.deleteSelection()) break;
        if (angledTool.deleteSelected()) break;
        if (activeTool.value === "select" && selectedDressingId.value !== null) dressingTool.deleteSelected();
        else lightTool.deleteSelected();
        break;
      case "toggleBrushWalls":
        brushWallMode.value = brushWallMode.value === "none" ? "visible" : "none";
        break;
      case "resizeBrush":
        brushRadius.value = clampBrushRadius(brushRadius.value + action.delta);
        break;
      case "swapTileSets": swapTileSets?.(); break;
      case "selectLayer": if (activeLayer) activeLayer.value = action.layer; break;
      case "toggleGrid": toggleGrid(); break;
      case "selectTool": activeTool.value = action.tool; break;
    }
    ev.preventDefault();
  }

  function onKeyUp(ev: KeyboardEvent): void {
    if (ev.key === "Alt") altHeld.value = false;
    navigation.onKeyUp(ev);
  }

  // Alt-tabbing away, or any other focus loss, ends the physical key-down
  // without a matching keyup ever reaching this window — left alone, the
  // pill would read " · erase" forever after. Same failure shape as a
  // stuck shift key in any other app; blur is the standard fix.
  function onWindowBlur(): void {
    altHeld.value = false;
    navigation.onBlur();
  }

  onMounted(() => {
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    scheduleRender();
  });

  onBeforeUnmount(() => {
    clearTimeout(brushPause);
    if (pendingTouch) clearTimeout(pendingTouch.timer);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    if (rafId) cancelAnimationFrame(rafId);
    planTools?.dispose();
  });

  // Whichever stack the active layer owns — the Drawing's `CommandStack` or
  // the Plan's `usePlanUndoStack` (#884 S7b). The toolbar's Undo/Redo buttons
  // read these two regardless of layer; only what they invoke (`undoEdit`/
  // `redoEdit`, already layer-aware above) and what they reflect changes.
  const exposedCanUndo = computed(() => (isPlanLayerActive() ? plan!.undo.canUndo.value : canUndo.value));
  const exposedCanRedo = computed(() => (isPlanLayerActive() ? plan!.undo.canRedo.value : canRedo.value));

  return {
    zoom,
    viewportOffset,
    hoverCell,
    hoveredEdge,
    /** Whether Alt is currently held — MapWorkbench appends
     *  " · erase" to the canvas pill while this is true and the active tool
     *  has an erase mirror. */
    altHeld,
    /** Space is held, so a left press pans — MapWorkbench shows the hand cursor. */
    spaceHeld: navigation.spaceHeld,
    /** A pan drag is under way (the grabbing cursor). */
    isPanning,
    canUndo: exposedCanUndo,
    canRedo: exposedCanRedo,
    undoEdit,
    redoEdit,
    centerMap,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    /** The pointer left the canvas: ends any gesture, and the Dressing ghost goes with it. */
    onPointerLeave(ev: PointerEvent): void {
      onPointerUp(ev);
      dressingTool.clearHover();
      // The brush's cursor circle follows the pointer; with the pointer gone it goes too.
      hoverPoint.value = null;
    },
    onDoubleClick,
    onWheel: navigation.onWheel,
    /** The picked wall run's counts for the slip (null when none), and what Delete does to it. */
    selectedGroundRegion,
    selectedGroundRegionId: groundEdit.selectedId,
    setGroundWallMode: groundEdit.setWallMode,
    renameGroundRegion: groundEdit.rename,
    selectedWallVisible,
    setSelectedWallVisible,
    deleteGroundRegion: groundEdit.remove,
    selectedWallRun,
    wallRefusal: wallNodes.refusal,
    deleteSelectedWall: () => { if (!selectTool.deleteAll()) wallNodes.deleteSelection(); },
    /** The Select tool, for tests. */
    selectTool,
    /** The canvas's CSS size and pixel ratio, for the motion layers that share its box. */
    canvasBox,
    /** Edits arrive faster than a snapshot should be rebuilt: true while a drag or a held stroke is under way. */
    gestureBusy,
    /** The wall node controller, for tests. */
    wallNodes,
    /** The Light tool's selected light (null when none), and the edits the slip makes to it. */
    selectedLightId: lightTool.selectedId,
    updateSelectedLight: lightTool.updateSelected,
    deleteSelectedLight: lightTool.deleteSelected,
    /** The Angled wall tool's state, for tests and the status line. */
    angledTool,
    /** Turns the selected Dressing prop (one undo step) and the brush with it. */
    rotateSelectedDressing: (degrees: number) => {
      if (selectTool.multiObjects.value.size > 0) selectTool.rotateObjects(degrees);
      else dressingTool.rotateSelected(degrees);
    },
    /** Removes the selected Dressing prop (one undo step). */
    deleteSelectedDressing: dressingTool.deleteSelected,
  };
}
