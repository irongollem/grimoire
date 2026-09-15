// The Cartographer's canvas engine: viewport, pointer/paint dispatch,
// undo/redo, deterministic variant picking, and the render loop.
//
// Pulled out of MapWorkbench.vue (epic #884 S6) to keep that component under
// its line cap (CLAUDE.md "Component Granularity") — same reason
// useCartographerStructureTools was pulled out of the pre-extraction
// CartographerEditorView.vue for #868. MapWorkbench still owns tool
// *selection* state (`activeTool`, the `TOOLS` palette, per-tool inspector
// fields like `stampRotation`/`caveRadius`) and hands them in here as refs;
// this composable owns what happens on the canvas once a tool is active.
//
// Every mutation function here writes through the same `layers`/`metadata`
// refs the caller owns — nothing here is a copy, so watching those refs
// elsewhere (structure derivation, dirty tracking) keeps working unchanged.

import { computed, customRef, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import type { Tool } from "@/cartographer/tools";
import { zoomAtPoint } from "@/cartographer/viewport";
import { resolveKeyAction } from "@/cartographer/keymap";
import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers, type CellMetadata } from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE, type PackCategory, type ObjectCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { renderMap, type MapRenderReferenceImage } from "@/cartographer/renderMap";
import { pickVariant } from "@/cartographer/tileVariants";
import * as paintOps from "@/cartographer/paintOps";
import type { PaintContext } from "@/cartographer/paintOps";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { floodFill, boundaryEdges } from "@/cartographer/floodFill";
import { CommandStack } from "@/cartographer/commandStack";
import { cellsForTemplate } from "@/lib/map/gestures/template";
import { caveBrushCells } from "@/lib/map/gestures/caveBrush";
import { cellsInRect, rectangleGesture } from "@/lib/map/gestures/rectangle";
import { cellsInLine } from "@/lib/map/gestures/line";
import { useCartographerStructureTools } from "@/composables/cartographer/useCartographerStructureTools";
import type { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";
import { usePlanCanvasTools } from "@/composables/cartographer/usePlanCanvasTools";
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
  packRuntime: ComputedRef<TilePackRuntime | null>;
  selectablePacks: ComputedRef<ReadonlyArray<{ pack_id: string; pack_version: number }>>;
  loadedRuntimes: Ref<Map<string, TilePackRuntime>>;
  cellGlyphs: ComputedRef<Record<CellKey, PackCategory>>;
  activeTool: Ref<Tool>;
  /** Enough of the palette for hotkey resolution — MapWorkbench owns the full `TOOLS` array. */
  tools: ReadonlyArray<{ id: Tool; shortcut?: string; disabled?: boolean }>;
  viewMode: () => boolean;
  activeObjectCategory: Ref<ObjectCategory>;
  stampRotation: Ref<number>;
  activeTemplateShape: Ref<TemplateShape>;
  caveRadius: Ref<number>;
  selectedCell: Ref<[number, number] | null>;
  inspectorPanelRef: Ref<{ annotationInputEl: AppInputHandle | null } | null>;
  /** The derived-structure composable (spaces/ways/zones/links) — this
   *  module builds the Structure tools' pointer dispatch around it itself,
   *  since that dispatch needs the same `snapshotStr`/`pushCommand` pair
   *  every other one-shot tool here uses for its undo command. */
  structure: ReturnType<typeof useCartographerStructure>;
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
  activeLayer?: Ref<"drawing" | "plan">;
}

// Edge-hover threshold: how close the cursor must get to a cell edge for it
// to "snap" to wall placement. 0.25 = within the outer 25% of the cell.
const EDGE_HOVER_THRESHOLD = 0.25;

export function useMapCanvasEditor(opts: MapCanvasEditorOptions) {
  const {
    canvasEl, layers, metadata, dirty, editRevision, currentPackId, packRuntime, selectablePacks, loadedRuntimes,
    cellGlyphs, activeTool, tools, viewMode, activeObjectCategory, stampRotation, activeTemplateShape,
    caveRadius, selectedCell, inspectorPanelRef, structure, mapKey, getReferenceImage, extraRenderDeps,
    plan, activeLayer,
  } = opts;

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
  const hoverCell = ref<[number, number] | null>(null);
  const hoveredEdge = ref<CellEdge | null>(null);

  // Pointer state
  const isPanning = ref(false);
  const isPainting = ref(false);
  let lastPointer: { x: number; y: number } | null = null;
  // Mutable per-stroke state (edge dedup + direction lock) — see StrokeState
  // in src/cartographer/paintOps.ts for what each field replaces and why.
  let strokeState = paintOps.createStrokeState();

  // Undo/redo
  const cmdStack = new CommandStack(100);
  const canUndo = ref(false);
  const canRedo = ref(false);

  // Drag state for rect / line tools
  let dragStartCell: [number, number] | null = null;
  const previewCells = ref(new Set<CellKey>());

  // Snapshot of layers captured at stroke start — used to build the undo command.
  let strokeSnapshot: string | null = null; // JSON string for cheap comparison on mouseup

  // Cave brush: seed increments each stroke for variety
  let caveSeed = 0;

  function snapshotStr(): string {
    return JSON.stringify({ layers: layers.value, metadata: metadata.value });
  }

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

  // The Space tool's pointer dispatch — built here, not passed in, so it
  // shares this composable's own `dirty` ref for its rename mutation.
  // Hands the Structure tools (Space rename) a `dirty` ref whose setter also
  // bumps `editRevision` — that file isn't ours to edit directly, but its one
  // `dirty.value = true` write needs the same bump every other edit gets, or
  // a rename made while a save is in flight would go unscheduled exactly
  // like the `dirty.value = true` call sites `markDirty()` replaces above.
  const dirtyWithRevision = customRef<boolean>((track, trigger) => ({
    get() { track(); return dirty.value; },
    set(v) {
      dirty.value = v;
      if (v) editRevision.value++;
      trigger();
    },
  }));
  const structureTools = useCartographerStructureTools(structure, { activeTool, dirty: dirtyWithRevision });

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

  function pickWallVariant(x: number, y: number, side: "N" | "W"): number {
    if (!packRuntime.value) return 0;
    const category = side === "N" ? "wallSegmentH" : "wallSegmentV";
    return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
  }

  function pickSolidVariant(x: number, y: number): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, "solid", x, y, packRuntime.value.variantCount("solidBlock"));
  }

  function pickDoorVariant(x: number, y: number, category: PackCategory): number {
    if (!packRuntime.value) return 0;
    return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
  }

  function pickObjectVariant(cat: ObjectCategory, x: number, y: number): number {
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
    return { layers: layers.value, packId: currentPackId.value, packVersion: activePackVersion() };
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

  // Centre the viewport on the painted area (or on the origin if the map is empty).
  function centerMap(): void {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const tilePx = tilePixelSize();

    // Compute bbox over every cell that contains anything.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const key of Object.keys(layers.value.floor)) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      any = true;
    }

    // No painted cells → just center on the origin tile.
    const cx = any ? (minX + maxX + 1) / 2 : 0.5;
    const cy = any ? (minY + maxY + 1) / 2 : 0.5;

    viewportOffset.value = {
      x: cx * tilePx - canvas.width / 2,
      y: cy * tilePx - canvas.height / 2,
    };
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

  // ── Object stamp tool ───────────────────────────────────────────────────

  function paintObjectAt(x: number, y: number): void {
    const variant = pickObjectVariant(activeObjectCategory.value, x, y);
    const changed = paintOps.paintObjectAt(
      paintContext(), x, y, activeObjectCategory.value, variant, stampRotation.value,
    );
    if (changed) markDirty();
  }

  function eraseObjectAt(x: number, y: number): void {
    if (paintOps.eraseObjectAt(paintContext(), x, y)) markDirty();
  }

  // ── Wall placement (edge-based, NW ownership) ──────────────────────────

  function paintWallAtCellEdge(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const variant = pickWallVariant(canon.x, canon.y, canon.side);
    strokeState.active = isPainting.value;
    if (paintOps.paintWallAtCellEdge(paintContext(), edge, strokeState, variant)) markDirty();
  }

  // Writes a wall edge directly, skipping stroke tracking. Used by wrap-walls,
  // rectangle perimeter, and shift+click — operations that aren't "strokes".
  function setWallEdgeIfEmpty(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const variant = pickWallVariant(canon.x, canon.y, canon.side);
    if (paintOps.setWallEdgeIfEmpty(paintContext(), edge, variant)) markDirty();
  }

  // ── Door tool (edge-based) ──────────────────────────────────────────────

  function paintDoorAtEdge(edge: CellEdge): void {
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    const cat: PackCategory = canon.side === "N" ? "doorClosedH" : "doorClosedV";
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

  // ── One-shot actions ────────────────────────────────────────────────────

  // Fill bucket: flood-fill from (cx, cy) through all non-solidBlock cells,
  // planting floor. Bounded by a 2 000-cell safety cap.
  function applyFill(cx: number, cy: number): void {
    if (!packRuntime.value) return;
    const region = floodFill(cx, cy, (x, y) => !layers.value.solidBlock[cellKey(x, y)], { maxCells: 2000 });
    for (const key of region) {
      const [xs, ys] = key.split(",");
      paintCell(Number(xs), Number(ys));
    }
  }

  // Wrap walls: find the connected floor region and place walls on every boundary
  // edge facing void that doesn't already have a wall/door.
  function applyWrapWalls(cx: number, cy: number): void {
    if (!layers.value.floor[cellKey(cx, cy)]?.floor) return;
    const region = floodFill(cx, cy, (x, y) => !!layers.value.floor[cellKey(x, y)]?.floor);
    for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
  }

  // Rectangle fill: paint all cells in the bounding rect; the shift-variant
  // flag (`rectangleGesture`'s `variant`) means "also wrap walls" on this
  // layer — a layer with no walls would simply leave it unused.
  function applyRect(ax: number, ay: number, bx: number, by: number, withWalls: boolean): void {
    if (!packRuntime.value) return;
    const stroke = rectangleGesture(ax, ay, bx, by, withWalls);
    for (const key of stroke.cells) {
      const [x, y] = parseCellKey(key);
      paintCell(x, y);
    }
    if (stroke.variant) {
      const region = new Set<CellKey>(stroke.cells);
      for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
    }
  }

  // Line: Bresenham floor line between two cells.
  function applyLine(ax: number, ay: number, bx: number, by: number): void {
    if (!packRuntime.value) return;
    for (const key of cellsInLine(ax, ay, bx, by)) {
      const [x, y] = parseCellKey(key);
      paintCell(x, y);
    }
  }

  // Room template: fill the chosen shape centered on (ax, ay) and wrap walls.
  function applyTemplate(ax: number, ay: number, bx: number, by: number): void {
    if (!packRuntime.value) return;
    const r = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const keys = cellsForTemplate(ax, ay, r, activeTemplateShape.value);
    for (const key of keys) {
      const [xs, ys] = (key as string).split(",");
      paintCell(Number(xs), Number(ys));
    }
    const region = new Set(keys);
    for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
  }

  // Cave brush: paint an organic blob at (cx, cy) using value noise.
  function paintCaveAt(cx: number, cy: number): void {
    if (!packRuntime.value) return;
    for (const key of caveBrushCells(cx, cy, caveRadius.value, caveSeed)) {
      const [xs, ys] = (key as string).split(",");
      paintCell(Number(xs), Number(ys));
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

    renderMap({
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      tilePx,
      viewportOffset: viewportOffset.value,
      bounds,
      layers: layers.value,
      metadata: metadata.value,
      glyphs: cellGlyphs.value,
      runtimes: loadedRuntimes.value,
      fallbackRuntime: packRuntime.value,
      currentPackId: currentPackId.value,
      activeTool: activeTool.value,
      viewMode: viewMode(),
      hoveredEdge: hoveredEdge.value,
      hoverCell: hoverCell.value,
      selectedCell: selectedCell.value,
      previewCells: previewCells.value,
      referenceImage: getReferenceImage(tilePx, viewportOffset.value),
      ...structureTools.renderStructureScene(),
    });

    // ── Plan overlay (#884 S7b) — drawn over the Drawing, on the same
    // canvas, in the same tile-pixel space `renderMap` just used. Always
    // shown once a site's Plan exists (like the reference Picture's own
    // ghost), not just while the Plan layer is the active one — a DM traces
    // against the Drawing underneath, so both must be visible together.
    if (planTools) {
      const viewport: TileViewport = { tilePx, viewportOffset: viewportOffset.value };
      const scene = planTools.renderScene();
      drawPlanSpaces(ctx, viewport, scene.regions, scene.activeRegionId, scene.cellsOverride);
      drawPlanWays(ctx, viewport, scene.ways);
      drawPlanZones(ctx, viewport, scene.regions, scene.activeRegionId, scene.cellsOverride);
      if (isPlanLayerActive()) {
        drawPlanTracingOverlay(
          ctx, viewport, scene.tracingRing, scene.tracingClosed, scene.tracingHoverPoint,
          scene.templateDraft, scene.templateRingPreview,
        );
        if (scene.hoveredDoorEdge) drawPlanDoorHover(ctx, viewport, scene.hoveredDoorEdge);
      }
    }
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
        planTools.renderDeps.templateDraft, planTools.renderDeps.liveDrag, planTools.renderDeps.penHoverPoint,
      ]
    : [];
  watch(
    [
      zoom, viewportOffset, layers, loadedRuntimes, currentPackId, hoverCell, hoveredEdge, activeTool,
      previewCells, metadata, selectedCell, cellGlyphs, ...extraRenderDeps, ...planRenderDeps,
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
    });
  }
  // viewMode is a getter over a prop, not a ref — watched separately so the
  // list above can stay a plain array of refs.
  watch(viewMode, () => scheduleRender());

  // ── Pointer interaction ─────────────────────────────────────────────────

  function getLocalPointer(ev: PointerEvent): { x: number; y: number } {
    const rect = canvasEl.value!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function onPointerDown(ev: PointerEvent): void {
    const local = getLocalPointer(ev);
    lastPointer = local;

    // View mode: pan only — skip all painting logic.
    if (viewMode()) {
      isPanning.value = true;
      return;
    }

    // Plan layer (#884 S7b): every gesture routes to `planTools` instead of
    // the Drawing tools below — EXCEPT a genuine pan trigger (RMB/middle/
    // shift), which `planTools.onPointerDown` reports by returning false.
    // Panning is handled directly here rather than by falling through into
    // the Drawing-specific branches below: those key off `activeTool` (the
    // Drawing's OWN tool selection, untouched while a DM works the Plan) and
    // must never fire on a Plan-layer gesture just because `activeTool`
    // happens to still be pointed at "wall" or "door" from earlier.
    if (isPlanLayerActive()) {
      if (planTools!.onPointerDown(ev)) return;
      isPanning.value = true;
      canvasEl.value?.setPointerCapture(ev.pointerId);
      return;
    }

    const [cx, cy] = viewportToCell(local.x, local.y);

    // Stamp right-click: erase object at cell.
    if (activeTool.value === "stamp" && ev.button === 2) {
      ev.preventDefault();
      const before = snapshotStr();
      eraseObjectAt(cx, cy);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return;
    }

    // Structure tools (#868): Space click-to-select, Zone right-click erase.
    if (structureTools.handleStructurePointerDown(cx, cy, ev.button)) {
      if (ev.button === 2) ev.preventDefault();
      return;
    }

    // Link / annotate: LMB selects cell; RMB falls through to pan.
    if ((activeTool.value === "link" || activeTool.value === "annotate") && ev.button !== 2) {
      selectedCell.value = [cx, cy];
      if (activeTool.value === "annotate") {
        setTimeout(() => inspectorPanelRef.value?.annotationInputEl?.focus(), 0);
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

    // Shift+click with the wall brush: wrap all 4 edges of the clicked cell.
    if (activeTool.value === "wall" && ev.shiftKey && ev.button === 0) {
      const before = snapshotStr();
      strokeState = paintOps.createStrokeState();
      for (const side of ["N", "E", "S", "W"] as const)
        paintWallAtCellEdge({ x: cx, y: cy, side });
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return;
    }

    // RMB / middle / shift → pan (shift already consumed above for wall tool).
    const isPanTrigger = ev.button === 1 || ev.button === 2 || ev.shiftKey;
    if (activeTool.value === "pan" || isPanTrigger) {
      isPanning.value = true;
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
    strokeSnapshot = snapshotStr();

    // Rect / line / template tools: record drag start; first cell is the preview seed.
    if (activeTool.value === "rect" || activeTool.value === "line" || activeTool.value === "template") {
      dragStartCell = [cx, cy];
      previewCells.value = new Set([cellKey(cx, cy)]);
      return;
    }

    // Cave brush: new seed per stroke so consecutive passes vary.
    if (activeTool.value === "cave") {
      caveSeed++;
      paintCaveAt(cx, cy);
      return;
    }

    if (activeTool.value === "floor") paintCell(cx, cy);
    else if (activeTool.value === "solid") paintSolidAt(cx, cy);
    else if (activeTool.value === "stamp") paintObjectAt(cx, cy);
    else if (activeTool.value === "eraser") {
      if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
      else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
      else if (layers.value.annotation[cellKey(cx, cy)]) {
        const next = { ...layers.value.annotation }; delete next[cellKey(cx, cy)]; layers.value.annotation = next; markDirty();
      }
      else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
      else eraseCell(cx, cy);
    } else if (activeTool.value === "wall" && hoveredEdge.value) {
      paintWallAtCellEdge(hoveredEdge.value);
    } else if (activeTool.value === "door" && hoveredEdge.value) {
      paintDoorAtEdge(hoveredEdge.value);
    }
  }

  function onPointerMove(ev: PointerEvent): void {
    const local = getLocalPointer(ev);
    const [cx, cy] = viewportToCell(local.x, local.y);
    hoverCell.value = [cx, cy];

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
      if (tool === "rect" && dragStartCell) {
        previewCells.value = new Set(cellsInRect(dragStartCell[0], dragStartCell[1], cx, cy));
      } else if (tool === "line" && dragStartCell) {
        previewCells.value = new Set(cellsInLine(dragStartCell[0], dragStartCell[1], cx, cy));
      } else if (tool === "template" && dragStartCell) {
        const r = Math.max(Math.abs(cx - dragStartCell[0]), Math.abs(cy - dragStartCell[1]));
        previewCells.value = new Set(cellsForTemplate(dragStartCell[0], dragStartCell[1], r, activeTemplateShape.value));
      } else if (tool === "cave") {
        paintCaveAt(cx, cy);
      } else if (tool === "floor") paintCell(cx, cy);
      else if (tool === "solid") paintSolidAt(cx, cy);
      else if (tool === "stamp") paintObjectAt(cx, cy);
      else if (tool === "eraser") {
        if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
        else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
        else if (layers.value.annotation[cellKey(cx, cy)]) {
          const next = { ...layers.value.annotation }; delete next[cellKey(cx, cy)]; layers.value.annotation = next; markDirty();
        }
        else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
        else eraseCell(cx, cy);
      } else if (tool === "wall" && hoveredEdge.value) {
        paintWallAtCellEdge(hoveredEdge.value);
      } else if (tool === "door" && hoveredEdge.value) {
        paintDoorAtEdge(hoveredEdge.value);
      }
    }

    lastPointer = local;
  }

  function onPointerUp(ev: PointerEvent): void {
    // Also bound to `@pointerleave` (MapWorkbench's template) — clears the
    // Plan's hover state (door edge highlight, pen cursor tracking) either way.
    planTools?.onPointerLeave();
    if (isPanning.value) {
      isPanning.value = false;
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    if (isPainting.value) {
      const tool = activeTool.value;

      // Commit rect / line / template on release.
      if ((tool === "rect" || tool === "line" || tool === "template") && dragStartCell) {
        const local = getLocalPointer(ev);
        const [cx, cy] = viewportToCell(local.x, local.y);
        const [ax, ay] = dragStartCell;
        const before = strokeSnapshot ?? snapshotStr();
        if (tool === "rect") applyRect(ax, ay, cx, cy, ev.shiftKey);
        else if (tool === "line") applyLine(ax, ay, cx, cy);
        else applyTemplate(ax, ay, cx, cy);
        const after = snapshotStr();
        if (before !== after) pushCommand(before, after);
        dragStartCell = null;
        previewCells.value = new Set();
      } else if (strokeSnapshot !== null) {
        // Stroke-based tools: push one undo command for the whole stroke.
        const after = snapshotStr();
        if (strokeSnapshot !== after) pushCommand(strokeSnapshot, after);
      }

      strokeSnapshot = null;
      isPainting.value = false;
      canvasEl.value?.releasePointerCapture(ev.pointerId);
    }
    lastPointer = null;
  }

  /** The pen tool's "double-click an edge inserts a node" gesture (#884
   *  S7b) — the Drawing has no double-click behaviour of its own, so this is
   *  a pure pass-through to the Plan, a no-op everywhere else (including on
   *  the standalone route, where `planTools` is null). */
  function onDoubleClick(ev: MouseEvent): void {
    if (isPlanLayerActive()) planTools!.onDoubleClick(ev);
  }

  function onWheel(ev: WheelEvent): void {
    const rect = canvasEl.value!.getBoundingClientRect();
    const { dpr } = devicePixelDims();
    const next = zoomAtPoint(
      { zoom: zoom.value, offset: viewportOffset.value },
      { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      dpr,
      ev.deltaY,
    );
    viewportOffset.value = next.offset;
    zoom.value = next.zoom;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  function onResize(): void {
    scheduleRender();
  }

  function onKeyDown(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement | null;
    const action = resolveKeyAction(
      {
        key: ev.key,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        targetIsTextEntry: !!target
          && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
      },
      { activeTool: activeTool.value, tools },
    );
    if (!action) return;

    switch (action.kind) {
      case "undo": undoEdit(); break;
      case "redo": redoEdit(); break;
      case "center": centerMap(); break;
      case "rotateStamp": stampRotation.value = (stampRotation.value + action.delta) % 360; break;
      case "selectTool": activeTool.value = action.tool; break;
    }
    ev.preventDefault();
  }

  onMounted(() => {
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    scheduleRender();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
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
    canUndo: exposedCanUndo,
    canRedo: exposedCanRedo,
    undoEdit,
    redoEdit,
    centerMap,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onWheel,
    structureTools,
  };
}
