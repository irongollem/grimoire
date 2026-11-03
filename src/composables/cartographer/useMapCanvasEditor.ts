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

//
// The work is split by what hangs together: `useEditorGeometry` (pixel/cell maths), `useEditorPainting`
// (what each Drawing tool does to the layers), `useEditorBrush` (the round brush's running stroke),
// `useEditorPointer` (the per-tool pointer router), `useEditorTouch` (two-finger pan and pinch) and
// `useEditorRender` (the scene and when to draw it). This module builds the tools, hands them to those,
// and owns the keyboard, undo and the returned surface.

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { resolveKeyAction } from "@/cartographer/keymap";
import { clampBrushRadius } from "@/cartographer/keymap";
import { cellKey, type CellKey, type CellMetadata, type DungeonMapLayers, type BrushRegionMode, type GroundRegion, type GroundWallMode } from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE, categoryLabel } from "@/cartographer/packSchema";
import { CommandStack } from "@/cartographer/commandStack";
import { groundCellBounds } from "@/cartographer/groundRegions";
import type { CellBounds } from "@/cartographer/viewport";
import { useGroundRegionEdit } from "./useGroundRegionEdit";
import { useSelectTool } from "./useSelectTool";
import { useStraightStrokes } from "@/composables/cartographer/useStraightStrokes";
import { useDressingTool } from "@/composables/cartographer/useDressingTool";
import { useAngledWallTool } from "@/composables/cartographer/useAngledWallTool";
import { useLightTool } from "@/composables/cartographer/useLightTool";
import { PLAN_TOOLS } from "@/composables/cartographer/usePlanPalette";
import { usePlanCanvasTools } from "@/composables/cartographer/usePlanCanvasTools";
import { isTextEntry } from "@/lib/canvasControls/keyTargets";
import { useCanvasNavigation } from "@/composables/cartographer/useCanvasNavigation";
import { useEditorGeometry } from "./useEditorGeometry";
import { useEditorPainting } from "./useEditorPainting";
import { useEditorBrush } from "./useEditorBrush";
import { useEditorPointer } from "./useEditorPointer";
import { useEditorTouch } from "./useEditorTouch";
import { useEditorRender } from "./useEditorRender";
import type { CellEdge } from "@/cartographer/edges";
import type { GridPoint } from "@/types/locationMapRegion.types";
import type { MapCanvasEditorOptions } from "./mapCanvasEditor.types";

export type { MapCanvasEditorOptions } from "./mapCanvasEditor.types";

export function useMapCanvasEditor(opts: MapCanvasEditorOptions) {
  const {
    canvasEl, layers, metadata, dirty, editRevision, currentPackId, packRuntime, selectablePacks, loadedRuntimes,
    dressing, placeItem, selectedDressingId, activeTool, tools, viewMode, placeRotation, activeWallKind, activeWallDecal, lightDraft, activeTemplateShape,
    brushRadius, rectWalls, selectedCell, toolOptionsRef, mapKey,
    plan, activeLayer, hasLayerTabs, toggleGrid, keysActive, swapTileSets,
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

  const previewCells = ref(new Set<CellKey>());
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

  const geometry = useEditorGeometry({ canvasEl, zoom, viewportOffset });
  const { devicePixelDims, tilePixelSize, viewportToCell, pointerToWorld, fractionalCellAt } = geometry;

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

  const painting = useEditorPainting({
    layers, packRuntime, selectablePacks, currentPackId, mapKey, wallVisible, isPainting, placeItem, placeRotation,
    activeWallKind, activeWallDecal, activeTemplateShape, straight, markDirty,
  });
  const { activePackVersion } = painting;

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

  const brush = useEditorBrush({
    layers, packRuntime, currentPackId, brushRadius, brushRegionMode, brushWallMode, brushCategory,
    selectedGroundId: groundEdit.selectedId, activePackVersion, pickFloorVariant: painting.pickFloorVariant, markDirty,
    scheduleRender: () => render.scheduleRender(),
  });

  /** The layers as drawn: the brush's fitted result, else the wall drag's preview stands in for the stored walls until it is released. */
  const shownLayers = computed<DungeonMapLayers>(() =>
    brush.result.value ?? groundEdit.shownLayers.value,
  );
  // Undo and redo can take away what is selected; leaving a tool puts its unfinished work down.
  watch(layers, () => { angledTool.dropStaleSelection(); lightTool.dropStaleSelection(); }, { deep: true });
  watch(activeTool, (tool, previous) => {
    if (previous === "brush" && tool !== "brush") brush.clear();
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

  const render = useEditorRender({
    opts, zoom, viewportOffset, canvasBox, hoverCell, hoverPoint, hoveredEdge, altHeld, previewCells, shownLayers, geometry, brush,
    dressingTool, angledTool, lightTool, selectTool, wallNodes, planTools, isPlanLayerActive,
  });

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

  const pointer = useEditorPointer({
    canvasEl, layers, metadata, activeTool, viewMode, selectedCell, toolOptionsRef, rectWalls, activeTemplateShape, activeLayer,
    viewportOffset, isPanning, isPainting, previewCells, hoverCell, hoverPoint, hoveredEdge, geometry, navigation, straight,
    painting, brush, dressingTool, angledTool, lightTool, selectTool, wallNodes, planTools, isPlanLayerActive,
    snapshotStr, pushCommand, markDirty, dropTouch: () => touch.dropPending(),
  });
  const { syncBusy, gestureBusy } = pointer;
  const touch = useEditorTouch({
    canvasEl, zoom, viewportOffset, geometry, isPlanLayerActive,
    toolPointerDown: pointer.toolPointerDown, toolPointerMove: pointer.toolPointerMove, toolPointerUp: pointer.toolPointerUp,
    abandonToolGesture: pointer.abandonToolGesture,
  });
  const { onPointerDown, onPointerMove, onPointerUp } = touch;

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
    window.addEventListener("resize", render.onResize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    render.scheduleRender();
  });

  onBeforeUnmount(() => {
    brush.dispose();
    touch.dispose();
    window.removeEventListener("resize", render.onResize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    render.dispose();
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
