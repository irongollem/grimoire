// What each Drawing tool does to the layers: the paint and erase of every cell, edge and shape, with the
// deterministic variant each picks. Split out of useMapCanvasEditor, which only routes pointer events here.
//
// Every function writes through the `layers` ref the editor was handed (never a copy) and files the edit
// with `markDirty`; the caller owns the undo step around a gesture.

import type { ComputedRef, Ref } from "vue";
import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { GroundWallMode } from "@/types/dungeonMap.types";
import type { PackCategory } from "@/cartographer/packSchema";
import type { PlaceItem } from "@/cartographer/tools";
import type { StampCategory } from "@/cartographer/stampCategories";
import { wallKindCategory, type WallKind } from "@/cartographer/wallKinds";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { pickVariant } from "@/cartographer/tileVariants";
import * as paintOps from "@/cartographer/paintOps";
import type { PaintedWallKind, PaintContext } from "@/cartographer/paintOps";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { floodFill, boundaryEdges } from "@/cartographer/floodFill";
import { cellsForTemplate } from "@/lib/map/gestures/template";
import { paintGroundCells } from "@/cartographer/groundRegions";
import { cellsInRect, rectangleGesture } from "@/lib/map/gestures/rectangle";
import { cellsInLine } from "@/lib/map/gestures/line";
import type { CellPainter, useStraightStrokes } from "@/composables/cartographer/useStraightStrokes";
import type { TemplateShape } from "./mapCanvasEditor.types";

export function useEditorPainting(inputs: {
  layers: Ref<DungeonMapLayers>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  selectablePacks: ComputedRef<ReadonlyArray<{ pack_id: string; pack_version: number }>>;
  currentPackId: Ref<string>;
  mapKey: ComputedRef<string>;
  wallVisible: Ref<boolean>;
  isPainting: Ref<boolean>;
  placeItem: Ref<PlaceItem | null>;
  placeRotation: Ref<number>;
  activeWallKind: Ref<WallKind>;
  activeWallDecal: Ref<number>;
  activeTemplateShape: Ref<TemplateShape>;
  straight: ReturnType<typeof useStraightStrokes>;
  markDirty: () => void;
}) {
  const {
    layers, packRuntime, selectablePacks, currentPackId, mapKey, wallVisible, isPainting, placeItem, placeRotation,
    activeWallKind, activeWallDecal, activeTemplateShape, straight, markDirty,
  } = inputs;

  // Mutable per-stroke state (edge dedup + direction lock) — see StrokeState
  // in src/cartographer/paintOps.ts for what each field replaces and why.
  let strokeState = paintOps.createStrokeState();

  /** An object is armed: a click stamps it. Otherwise a click belongs to the props. */
  function armedObject(): Extract<PlaceItem, { kind: "object" }> | null {
    return placeItem.value?.kind === "object" ? placeItem.value : null;
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

  return {
    /** A new stroke begins: its edge dedup and direction lock start clean. */
    resetStroke(): void { strokeState = paintOps.createStrokeState(); },
    strokeState: (): paintOps.StrokeState => strokeState,
    armedObject,
    activePackVersion,
    pickFloorVariant,
    pickDoorVariant,
    paintObjectAt,
    eraseObjectAt,
    eraseCell,
    eraseSolidAt,
    eraseTerrainAt,
    paintWallRun,
    wallStrokeAt,
    paintDoorAtEdge,
    removeDoorAtEdge,
    eraseWallAtCellEdge,
    paintCellsWith,
    applyFill,
    applyWrapWalls,
    applyRect,
    applyLine,
    applyTemplate,
    eraseRectCells,
    eraseLineCells,
    eraseTemplateCells,
  };
}

export type EditorPainting = ReturnType<typeof useEditorPainting>;
