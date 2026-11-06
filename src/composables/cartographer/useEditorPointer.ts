// The pointer router: what a press, a move and a release mean for the active tool and layer. Split out
// of useMapCanvasEditor, which wires the tools and hands them in; touch input reaches this through
// useEditorTouch, which decides when a finger is a tool press and when it is a pinch.

import { ref, type Ref } from "vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { Tool } from "@/cartographer/tools";
import type { EditorLayer } from "@/cartographer/keymap";
import { cellKey, type CellKey, type CellMetadata, type DungeonMapLayers } from "@/types/dungeonMap.types";
import * as paintOps from "@/cartographer/paintOps";
import type { CellEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { cellsForTemplate } from "@/lib/map/gestures/template";
import { cellsInRect } from "@/lib/map/gestures/rectangle";
import { cellsInLine } from "@/lib/map/gestures/line";
import { constrainShapeEnd, isCellPainter, type useStraightStrokes } from "@/composables/cartographer/useStraightStrokes";
import type { useDressingTool } from "@/composables/cartographer/useDressingTool";
import type { useAngledWallTool } from "@/composables/cartographer/useAngledWallTool";
import type { useLightTool } from "@/composables/cartographer/useLightTool";
import type { useCanvasNavigation } from "@/composables/cartographer/useCanvasNavigation";
import type { usePlanCanvasTools } from "@/composables/cartographer/usePlanCanvasTools";
import type { useGroundRegionEdit } from "./useGroundRegionEdit";
import type { useSelectTool } from "./useSelectTool";
import { wallAt } from "@/cartographer/wallGraph";
import type { EditorBrush } from "./useEditorBrush";
import type { EditorGeometry } from "./useEditorGeometry";
import type { EditorPainting } from "./useEditorPainting";
import type { TemplateShape } from "./mapCanvasEditor.types";

// Edge-hover threshold: how close the cursor must get to a cell edge for it
// to "snap" to wall placement. 0.25 = within the outer 25% of the cell.
const EDGE_HOVER_THRESHOLD = 0.25;

export function useEditorPointer(inputs: {
  canvasEl: Ref<HTMLCanvasElement | null>;
  layers: Ref<DungeonMapLayers>;
  metadata: Ref<Record<CellKey, CellMetadata>>;
  activeTool: Ref<Tool>;
  selectedCell: Ref<[number, number] | null>;
  toolOptionsRef: Ref<{ annotationInputEl: AppInputHandle | null } | null>;
  rectWalls: Ref<boolean>;
  activeTemplateShape: Ref<TemplateShape>;
  activeLayer?: Ref<EditorLayer>;
  viewportOffset: Ref<{ x: number; y: number }>;
  isPanning: Ref<boolean>;
  isPainting: Ref<boolean>;
  previewCells: Ref<Set<CellKey>>;
  hoverCell: Ref<[number, number] | null>;
  hoverPoint: Ref<[number, number] | null>;
  hoveredEdge: Ref<CellEdge | null>;
  geometry: EditorGeometry;
  navigation: ReturnType<typeof useCanvasNavigation>;
  straight: ReturnType<typeof useStraightStrokes>;
  painting: EditorPainting;
  brush: EditorBrush;
  dressingTool: ReturnType<typeof useDressingTool>;
  angledTool: ReturnType<typeof useAngledWallTool>;
  lightTool: ReturnType<typeof useLightTool>;
  selectTool: ReturnType<typeof useSelectTool>;
  wallNodes: ReturnType<typeof useGroundRegionEdit>["controller"];
  planTools: ReturnType<typeof usePlanCanvasTools> | null;
  isPlanLayerActive: () => boolean;
  snapshotStr: () => string;
  pushCommand: (beforeStr: string, afterStr: string) => void;
  markDirty: () => void;
  /** A gesture is being abandoned: whatever the touch layer was holding back goes too. */
  dropTouch: () => void;
}) {
  const {
    canvasEl, layers, metadata, activeTool, selectedCell, toolOptionsRef, rectWalls, activeTemplateShape, activeLayer,
    viewportOffset, isPanning, isPainting, previewCells, hoverCell, hoverPoint, hoveredEdge, geometry, navigation, straight,
    painting, brush, dressingTool, angledTool, lightTool, selectTool, wallNodes, planTools, isPlanLayerActive,
    snapshotStr, pushCommand, markDirty, dropTouch,
  } = inputs;
  const { getLocalPointer, viewportToCell, fractionalCellAt, pointerToWorld, tilePixelSize, devicePixelDims } = geometry;
  const {
    armedObject, eraseObjectAt, eraseCell, eraseSolidAt, eraseTerrainAt, eraseWallAtCellEdge, removeDoorAtEdge, paintDoorAtEdge,
    paintObjectAt, paintCellsWith, paintWallRun, wallStrokeAt, applyFill, applyWrapWalls, applyRect, applyLine, applyTemplate,
    eraseRectCells, eraseLineCells, eraseTemplateCells, pickDoorVariant,
  } = painting;

  let lastPointer: { x: number; y: number } | null = null;
  // Drag state for rect / line tools
  let dragStartCell: [number, number] | null = null;
  // Snapshot of layers captured at stroke start — used to build the undo command.
  let strokeSnapshot: string | null = null; // JSON string for cheap comparison on mouseup

  /** A gesture is under way (a drag, a held stroke), so the motion snapshot rebuilds on an interval, not per edit. */
  const gestureBusy = ref(false);
  const syncBusy = (): void => {
    gestureBusy.value = isPainting.value || dressingTool.isHolding() || lightTool.isHolding() || wallNodes.dragging.value || selectTool.isHolding();
  };

  /** Right button, or Alt with the left: Place takes away instead of putting down. */
  function placeErases(ev: PointerEvent): boolean {
    return ev.button === 2 || (ev.altKey && ev.button === 0);
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
        painting.resetStroke();
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
    painting.resetStroke();
    straight.beginStroke();
    strokeSnapshot = snapshotStr();

    // Rect / line / template tools: record drag start; first cell is the preview seed.
    if (activeTool.value === "rect" || activeTool.value === "line" || activeTool.value === "template") {
      dragStartCell = [cx, cy];
      previewCells.value = new Set([cellKey(cx, cy)]);
      return;
    }

    if (activeTool.value === "brush") {
      brush.begin(cx, cy, ev.altKey);
      for (const [px, py] of straight.brushPress(fractionalCellAt(ev), ev.shiftKey)) brush.to(px, py);
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
    if (activeTool.value === "select" && !isPanning.value && !isPlanLayerActive()) {
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
      if (edge && isPainting.value && painting.strokeState().direction !== null && paintOps.edgeDirection(edge.side) !== painting.strokeState().direction) {
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
        brush.to(fx, fy);
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
        if (tool === "brush" && brush.isActive()) brush.commit();
        // Stroke-based tools: push one undo command for the whole stroke.
        const after = snapshotStr();
        if (strokeSnapshot !== after) pushCommand(strokeSnapshot, after);
      }

      // Where this stroke ended is where the next Shift+click joins on.
      if (tool === "brush") {
        straight.brushEnded(brush.last());
        brush.clear();
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

  /** Rolls back whatever the first finger had started, so a pinch begins from a still map. */
  function abandonToolGesture(): void {
    brush.clear();
    dropTouch();
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

  return { toolPointerDown, toolPointerMove, toolPointerUp, abandonToolGesture, gestureBusy, syncBusy };
}
