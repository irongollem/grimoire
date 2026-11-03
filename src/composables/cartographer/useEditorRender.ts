// The editor's render loop: the scene handed to `renderMap` (one canvas, or three while Motion plays), the
// Plan overlay drawn over it, and the watch that schedules a frame when anything it draws changes.
// Split out of useMapCanvasEditor, which wires the tools whose marks the scene carries.

import { watch, type ComputedRef, type Ref } from "vue";
import { renderMap, type MapRenderScene } from "@/cartographer/renderMap";
import type { WallNodeMarks } from "@/cartographer/drawWallNodes";
import type { CellEdge } from "@/cartographer/edges";
import type { CellKey, DungeonMapLayers } from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import {
  drawPlanDoorHover,
  drawPlanSpaces,
  drawPlanTracingOverlay,
  drawPlanWays,
  drawPlanZones,
  type TileViewport,
} from "@/cartographer/planOverlay";
import type { useDressingTool } from "@/composables/cartographer/useDressingTool";
import type { useAngledWallTool } from "@/composables/cartographer/useAngledWallTool";
import type { useLightTool } from "@/composables/cartographer/useLightTool";
import type { usePlanCanvasTools } from "@/composables/cartographer/usePlanCanvasTools";
import type { useGroundRegionEdit } from "./useGroundRegionEdit";
import type { useSelectTool } from "./useSelectTool";
import type { EditorBrush } from "./useEditorBrush";
import type { EditorGeometry } from "./useEditorGeometry";
import type { MapCanvasEditorOptions } from "./mapCanvasEditor.types";

/** The editor's background colour at partial strength: laid over the layers below the active tab to dim them. */
const LAYERS_BELOW_SCRIM = "rgba(20, 18, 16, 0.4)";

export function useEditorRender(inputs: {
  /** The options the editor was given; the render reads the reactive pieces of them it draws. */
  opts: MapCanvasEditorOptions;
  zoom: Ref<number>;
  viewportOffset: Ref<{ x: number; y: number }>;
  canvasBox: Ref<{ w: number; h: number; dpr: number }>;
  hoverCell: Ref<[number, number] | null>;
  hoverPoint: Ref<[number, number] | null>;
  hoveredEdge: Ref<CellEdge | null>;
  altHeld: Ref<boolean>;
  previewCells: Ref<Set<CellKey>>;
  shownLayers: ComputedRef<DungeonMapLayers>;
  geometry: Pick<EditorGeometry, "devicePixelDims" | "visibleCellBounds">;
  brush: EditorBrush;
  dressingTool: ReturnType<typeof useDressingTool>;
  angledTool: ReturnType<typeof useAngledWallTool>;
  lightTool: ReturnType<typeof useLightTool>;
  selectTool: ReturnType<typeof useSelectTool>;
  wallNodes: ReturnType<typeof useGroundRegionEdit>["controller"];
  planTools: ReturnType<typeof usePlanCanvasTools> | null;
  isPlanLayerActive: () => boolean;
}) {
  const {
    opts, zoom, viewportOffset, canvasBox, hoverCell, hoverPoint, hoveredEdge, altHeld, previewCells, shownLayers, geometry, brush,
    dressingTool, angledTool, lightTool, selectTool, wallNodes, planTools, isPlanLayerActive,
  } = inputs;
  const {
    canvasEl, layers, metadata, editRevision, currentPackId, darkness, packRuntime, loadedRuntimes, dressing, placeItem,
    selectedDressingId, cellGlyphs, activeTool, viewMode, placeRotation, lightDraft, brushRadius, selectedCell,
    getReferenceImage, extraRenderDeps, activeLayer, plan, gridAlpha, groundCanvasEl, aidsCanvasEl, motionPlaying,
  } = opts;
  const { devicePixelDims, visibleCellBounds } = geometry;

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
    const aids = aidsCanvasEl?.value;
    if (aids && (aids.width !== targetW || aids.height !== targetH)) {
      aids.width = targetW;
      aids.height = targetH;
    }
    if (canvasBox.value.w !== w || canvasBox.value.h !== h || canvasBox.value.dpr !== dpr) canvasBox.value = { w, h, dpr };
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
    const aids = ground ? aidsCanvasEl?.value ?? null : null;
    const aidsCtx = aids?.getContext("2d") ?? null;

    const scene = (target: CanvasRenderingContext2D, size: HTMLCanvasElement, pass: "ground" | "standing" | "aids" | undefined): MapRenderScene => ({
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
        brushStroke: brush.footprint() && !brush.result.value ? { path: brush.footprint()!, erase: brush.erase() } : null,
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
    // The aids sit above the veil the live layer draws between, so they get a canvas of their own.
    if (aids && aidsCtx) renderMap(scene(aidsCtx, aids, "aids"));
    // The plan overlay is an aid too: with an aids canvas it goes there, above the veil.
    const overlayCtx = aidsCtx && aids ? aidsCtx : ctx;

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
      drawPlanSpaces(overlayCtx, viewport, planScene.regions, planScene.activeRegionId, planScene.cellsOverride);
      drawPlanWays(overlayCtx, viewport, planScene.ways);
      drawPlanZones(overlayCtx, viewport, planScene.regions, planScene.activeRegionId, planScene.cellsOverride);
      if (isPlanLayerActive()) {
        drawPlanTracingOverlay(
          overlayCtx, viewport, planScene.tracingRing, planScene.tracingClosed, planScene.tracingHoverPoint,
          planScene.templateDraft, planScene.templateRingPreview,
        );
        if (planScene.hoveredDoorEdge) drawPlanDoorHover(overlayCtx, viewport, planScene.hoveredDoorEdge);
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
  watch(() => [!!motionPlaying?.(), groundCanvasEl?.value, aidsCanvasEl?.value], () => scheduleRender(), { flush: "post" });
  // viewMode is a getter over a prop, not a ref — watched separately so the
  // list above can stay a plain array of refs.
  watch(viewMode, () => scheduleRender());

  return {
    scheduleRender,
    /** The window resized: the next frame measures the canvas again. */
    onResize: scheduleRender,
    dispose(): void { if (rafId) cancelAnimationFrame(rafId); },
  };
}

export type EditorRender = ReturnType<typeof useEditorRender>;
