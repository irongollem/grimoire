// Plan pointer dispatch + render scene (epic #884 S7b) — the ROUTING half of
// the Plan layer, mirroring the WHAT/ROUTING split
// `useCartographerStructure.ts`/`useCartographerStructureTools.ts` already
// draw for the Drawing's own Space/Zone tools. `usePlanPalette.ts` is the
// WHAT (data, mutations, undo); this module is only "how a pointer event on
// THIS canvas becomes one of those calls."
//
// Space/Zone tracing (paint/pen/template) is not reinvented here — it
// delegates straight to `useRegionPointer`, the exact gesture state machine
// the Atlas's own `MapRegionsLayer.vue` uses, via the same plain-callback
// contract that module already exposes. Only the geometry callbacks differ:
// the Atlas resolves a pointer event against a static image's calibration;
// this module resolves it against the Cartographer's own pannable/zoomable
// tile canvas, using the same `tilePx`/`viewportOffset` maths
// `useMapCanvasEditor.ts`'s Drawing tools already use — see that module's
// `pointerToWorld`/`viewportToCell`, which the geometry callbacks below wrap.
//
// The Door and Claim tools are NOT trace gestures (no stroke, no ring, no
// drag) and so are not routed through `useRegionPointer` — Door mirrors
// `MapRegionsLayer.vue`'s own separate `onDoorPointerDown`/`onDoorPointerMove`
// pair (edge-snap, place/cycle/alt-delete), reusing the exact edge-detection
// primitives (`detectHoveredEdge`, `canonicaliseEdge`) the Drawing's own
// wall/door tools already share. Claim is a one-shot click with no analogue
// in the Atlas at all: it reads the Drawing's floor layer via `floodFill`
// and writes straight to the Plan.
//
// Panning stays universal: RMB, the middle button, and shift+click are never
// claimed here, so `useMapCanvasEditor.ts`'s existing pan logic keeps running
// underneath the Plan exactly as it does under the Drawing. `onPointerDown`
// returns whether it claimed the event for exactly this reason — the caller
// falls through to its own pan-trigger check when it didn't.

import { ref, type Ref } from "vue";
import { useRegionPointer, type UseRegionPointerOptions } from "@/composables/locations/useRegionPointer";
import { useToast } from "@/composables/useToast";
import type { UsePlanPaletteReturn } from "@/composables/cartographer/usePlanPalette";
import { canonicaliseEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { floodFill } from "@/cartographer/floodFill";
import { DOOR_EDGE_SNAP_THRESHOLD, indexSpacesByCell, resolveEdgeEndpoints } from "@/lib/locations/doors";
import { templateRing as buildTemplateRing } from "@/lib/locations/polygon";
import { cellKey, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";
import type { TemplateDragState } from "@/lib/map/gestures/pen";
import type { PlanWayLike } from "@/cartographer/planOverlay";

export interface PlanCanvasToolsOptions {
  plan: UsePlanPaletteReturn;
  /** The Drawing's own floor layer — read-only here, the Claim tool's source. */
  layers: Ref<DungeonMapLayers>;
  /** Client (event) coordinates → the cell under them, in the tile grid both
   *  layers share (see `MapWorkbench.vue`'s `buildReferenceImage` docblock
   *  for why that sharing is safe to rely on). Null off the canvas. */
  cellAt: (clientX: number, clientY: number) => CellKey | null;
  /** Same, but as a continuous, unsnapped grid point — pen/template space. */
  gridPointAt: (clientX: number, clientY: number) => GridPoint | null;
  /** Same, but as world pixels — what `detectHoveredEdge` wants. */
  worldPointAt: (clientX: number, clientY: number) => { x: number; y: number } | null;
  tilePixelSize: () => number;
}

export interface PlanRenderScene {
  regions: readonly LocationMapRegion[];
  ways: readonly PlanWayLike[];
  activeRegionId: string | null;
  cellsOverride: ReadonlyMap<string, readonly CellKey[]> | undefined;
  hoveredDoorEdge: SourceEdgeKey | null;
  tracingRing: readonly GridPoint[] | null;
  tracingClosed: boolean;
  tracingHoverPoint: GridPoint | null;
  templateDraft: TemplateDragState | null;
  templateRingPreview: readonly GridPoint[];
}

export function usePlanCanvasTools(opts: PlanCanvasToolsOptions) {
  const { plan, layers, cellAt, gridPointAt, worldPointAt, tilePixelSize } = opts;
  const { error: toastError } = useToast();

  const planHoveredDoorEdge = ref<SourceEdgeKey | null>(null);

  // ── Space/Zone tracing — delegated to useRegionPointer ─────────────────
  function isTraceTool(): boolean {
    return plan.planTool.value === "space" || plan.planTool.value === "zone";
  }

  const pointerOptions: UseRegionPointerOptions = {
    cellAt,
    isPaintable: () => true, // the Cartographer's canvas has no image bound to stay on
    gridPointAt,
    activeRegion: () => (isTraceTool() ? plan.activeRegion.value : null),
    hasActiveRegionId: () => isTraceTool() && plan.activeRegionId.value !== null,
    tool: () => plan.traceTool.value,
    mode: () => "browse",
    regionAt: (cell) => plan.regions.value.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null,
    hoverRegionAt: (cell) => {
      const zone = plan.regions.value.find((r) => r.region_role === "zone" && r.cells.includes(cell));
      return zone ?? plan.regions.value.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null;
    },
    commitCells: plan.commitCells,
    commitRing: plan.commitRing,
    commitTemplate: plan.commitTemplate,
    confirmConvert: plan.confirmConvert,
    // Clicking an already-traced-but-unbound shape resumes tracing it — the
    // Cartographer has no region list to pick from, so this IS how a DM gets
    // back to a shape they started earlier without abandoning it.
    onSelect: (regionId) => { plan.activeRegionId.value = regionId; },
    // Binding/navigation are panel actions (#884 S7b spec, item 4) — this
    // embedded tool never names or opens a location, so a click on an
    // already-bound space does nothing here rather than routing anywhere.
    onNavigate: () => {},
    onDescend: () => {},
    onMoveParty: () => {},
    isReachable: () => true,
    isNestedSite: () => false,
    onHover: () => {},
  };

  const regionPointer = useRegionPointer(pointerOptions);

  // ── Door tool ────────────────────────────────────────────────────────────

  function edgeAt(clientX: number, clientY: number): SourceEdgeKey | null {
    const world = worldPointAt(clientX, clientY);
    const tilePx = tilePixelSize();
    if (!world || tilePx <= 0) return null;
    const edge = detectHoveredEdge(world.x, world.y, tilePx, DOOR_EDGE_SNAP_THRESHOLD);
    if (!edge) return null;
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    return `${canon.x},${canon.y}:${canon.side}` as SourceEdgeKey;
  }

  function handleDoorClick(edgeKey: SourceEdgeKey, altKey: boolean): void {
    const existing = plan.existingDoorAtEdge(edgeKey);
    if (altKey) {
      if (existing) plan.removeDoor(existing);
      return;
    }
    if (existing) {
      plan.cycleDoorKind(existing);
      return;
    }
    const cellToSpace = indexSpacesByCell(plan.regions.value);
    const resolved = resolveEdgeEndpoints(edgeKey, cellToSpace);
    if (!resolved) {
      toastError("Trace a room on at least one side of this edge before placing a door there.");
      return;
    }
    plan.placeDoorAt(edgeKey, resolved.fromLocationId, resolved.toLocationId);
  }

  // ── Claim tool ───────────────────────────────────────────────────────────

  function claimAt(clientX: number, clientY: number): void {
    const cell = cellAt(clientX, clientY);
    if (!cell) return;
    if (!layers.value.floor[cell]?.floor) {
      toastError("Click a painted floor cell to claim it as a space.");
      return;
    }
    const [xs, ys] = cell.split(",");
    const region = floodFill(Number(xs), Number(ys), (x, y) => !!layers.value.floor[cellKey(x, y)]?.floor);
    void plan.claimFloorRegion([...region]);
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────
  // Pan (RMB / middle / shift) is never claimed — the caller's own pan logic
  // runs when this returns false, exactly the boundary
  // `useMapCanvasEditor.ts`'s Drawing tools already draw around their own
  // pan-trigger check.

  function isPanGesture(ev: PointerEvent): boolean {
    return ev.button === 1 || ev.button === 2 || ev.shiftKey;
  }

  function onPointerDown(ev: PointerEvent): boolean {
    const tool = plan.planTool.value;

    if (tool === "door") {
      // alt+click still deletes even though alt+shift would otherwise read
      // as a pan trigger — alt is the door tool's own modifier, shift is the
      // pan one, and a DM is never holding both for the same gesture.
      if (isPanGesture(ev) && !ev.altKey) return false;
      const edgeKey = edgeAt(ev.clientX, ev.clientY);
      // Still claimed even with nothing to target: the Door tool being active
      // must never leak a click through to the Drawing's own tool dispatch
      // underneath (see `useMapCanvasEditor.ts`'s `activeLayer` branch) —
      // only a genuine pan gesture is allowed to fall through.
      if (!edgeKey) return true;
      ev.preventDefault();
      handleDoorClick(edgeKey, ev.altKey);
      return true;
    }

    if (tool === "claim") {
      if (isPanGesture(ev)) return false;
      claimAt(ev.clientX, ev.clientY);
      return true;
    }

    // space / zone — delegated to useRegionPointer whether or not a region
    // is active yet: with one active, this paints into it; with none, it
    // still registers the window listeners the click-to-select-an-existing-
    // unbound-shape gesture needs on release (`onSelect` below). Starting a
    // FRESH shape is deliberately never automatic — same as the Atlas's own
    // "+ New space" button, the palette's "New" action
    // (`usePlanPalette.ts`'s `startNewSpace`/`startNewZone`) is the only way
    // to get one, so a bare click can unambiguously mean "select" instead.
    if (isPanGesture(ev)) return false;
    regionPointer.onPointerDown(ev);
    return true;
  }

  function onPointerMove(ev: PointerEvent): void {
    const tool = plan.planTool.value;
    if (tool === "door") {
      planHoveredDoorEdge.value = edgeAt(ev.clientX, ev.clientY);
      return;
    }
    planHoveredDoorEdge.value = null;
    if (tool === "claim") return;
    regionPointer.onPointerMove(ev);
  }

  function onPointerLeave(): void {
    planHoveredDoorEdge.value = null;
    regionPointer.onPointerLeave();
  }

  function onDoubleClick(ev: MouseEvent): void {
    if (!isTraceTool()) return;
    regionPointer.onDoubleClick(ev);
  }

  function dispose(): void {
    regionPointer.dispose();
  }

  function renderScene(): PlanRenderScene {
    const overrides = regionPointer.strokeCells.value
      ? new Map([[regionPointer.strokeCells.value.regionId, regionPointer.strokeCells.value.cells]])
      : undefined;

    let tracingRing: readonly GridPoint[] | null = null;
    let tracingClosed = false;
    let tracingHoverPoint: GridPoint | null = null;
    let templateRingPreview: readonly GridPoint[] = [];

    if (isTraceTool() && plan.traceTool.value === "pen" && plan.activeRegion.value) {
      const region = plan.activeRegion.value;
      const persisted = region.vertices !== null;
      const drag = regionPointer.liveDrag.value;
      const dragging = drag && drag.regionId === region.id ? drag.ring : null;
      tracingRing = dragging ?? (persisted ? region.vertices! : regionPointer.draftRing.value);
      tracingClosed = persisted;
      tracingHoverPoint = regionPointer.penHoverPoint.value;
    }

    const templateDraft = regionPointer.templateDraft.value;
    if (isTraceTool() && plan.traceTool.value === "template" && templateDraft && templateDraft.radius > 0) {
      templateRingPreview = buildTemplateRing(templateDraft.shape, templateDraft.center, templateDraft.radius);
    }

    return {
      regions: plan.regions.value,
      ways: plan.ways.value,
      activeRegionId: plan.activeRegionId.value,
      cellsOverride: overrides,
      hoveredDoorEdge: plan.planTool.value === "door" ? planHoveredDoorEdge.value : null,
      tracingRing,
      tracingClosed,
      tracingHoverPoint,
      templateDraft,
      templateRingPreview,
    };
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onDoubleClick,
    dispose,
    renderScene,
    // Exposed only so the caller's render-triggering `watch` array can see
    // them (`useMapCanvasEditor.ts`'s `scheduleRender` deps) — every actual
    // read of these lives inside `renderScene()` above.
    renderDeps: {
      hoveredDoorEdge: planHoveredDoorEdge,
      strokeCells: regionPointer.strokeCells,
      draftRing: regionPointer.draftRing,
      templateDraft: regionPointer.templateDraft,
      liveDrag: regionPointer.liveDrag,
      penHoverPoint: regionPointer.penHoverPoint,
    },
  };
}
