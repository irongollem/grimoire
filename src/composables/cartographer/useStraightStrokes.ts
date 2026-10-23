// Shift draws straight (#1096): what Shift+click and Shift+drag mean for the
// Cartographer's painting tools, the way Photoshop and Figma read them.
//
// Three families of tool remember where their last stroke ended, so a later
// Shift+click can join to it:
//   - the round Brush, in fractional cells;
//   - the cell painters (Tiles, Water, Rock), in whole cells;
//   - the Wall, in grid vertices.
// Holding Shift while dragging snaps the stroke to 45 degree steps (cells and
// brush) or keeps it on the line it started on (wall). The 45 degree ray is
// chosen once, as soon as the pointer has left the stroke's start, and then
// kept until Shift is let go: re-picking it on every move would paint a wedge
// whenever the pointer crossed a 22.5 degree boundary.
//
// This module only decides *where* to paint. The editor keeps doing the
// painting, so every kind, variant and undo rule stays in one place.
//
// The remembered end is forgotten when the tool changes, when a different map
// is opened, and on Escape. Undo, redo and a save's refetch of the same map
// keep it, as Photoshop keeps the brush's last point across an undo.

import { watch, type Ref } from "vue";
import type { Tool } from "@/cartographer/tools";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { nearestVertex, runAnchor, wallRun, type Vertex } from "@/cartographer/wallRun";
import { snapCellToAngle, snapToAngle, squareCorner } from "@/lib/map/gestures/constrain";
import { cellsInLine } from "@/lib/map/gestures/line";
import { parseCellKey } from "@/types/dungeonMap.types";

type Point = readonly [number, number];
type Cell = [number, number];

/** The cell painters that share one remembered cell. */
export type CellPainter = Extract<Tool, "floor" | "terrain" | "solid">;

export function isCellPainter(tool: Tool): tool is CellPainter {
  return tool === "floor" || tool === "terrain" || tool === "solid";
}

/**
 * Where a rectangle or line drag ends once Shift is applied: a square for the
 * Rectangle, 45 degree steps for the Line. Every other shape is left alone.
 */
export function constrainShapeEnd(tool: Tool, start: readonly [number, number], end: Cell, shift: boolean): Cell {
  if (!shift) return end;
  if (tool === "rect") return squareCorner(start[0], start[1], end[0], end[1]);
  if (tool === "line") return snapCellToAngle(start[0], start[1], end[0], end[1]);
  return end;
}

// How far the pointer must be from the stroke's start before the ray is
// chosen: nearer than this the angle is noise.
const RAY_LOCK_DISTANCE = 0.5;

function cellLine(from: Point, to: Point): Cell[] {
  return cellsInLine(from[0], from[1], to[0], to[1]).map(parseCellKey);
}

export function useStraightStrokes(opts: { activeTool: Ref<Tool>; mapKey: Readonly<Ref<string>> }) {
  const { activeTool, mapKey } = opts;

  // Where the last stroke of each family ended.
  let brushEnd: Point | null = null;
  let cellEnd: Point | null = null;
  let wallEnd: Vertex | null = null;

  // The running stroke.
  let brushStart: Point | null = null;
  let cellStart: Point | null = null;
  let cellPrev: Point | null = null;
  let wallOrigin: CellEdge | null = null;
  let wallLast: CellEdge | null = null;

  // The ray a Shift drag is locked to: a unit vector for the brush, a step
  // direction for the cell painters. Null until chosen, and again once Shift
  // is let go, so pressing it again picks a fresh ray from where the pointer is.
  let brushRay: Point | null = null;
  let cellRay: Cell | null = null;

  function forget(): void {
    brushEnd = null;
    cellEnd = null;
    wallEnd = null;
  }

  // A different tool starts with a clean slate, so a Shift+click never joins to
  // a stroke the artist has moved on from.
  watch(activeTool, forget, { flush: "sync" });

  // A different map: the old end point lies somewhere else on it. Keyed on the
  // map rather than its layers, because an autosave refetch replaces the layers
  // of the same map and must not break a chain of Shift+clicks.
  watch(mapKey, forget, { flush: "sync" });

  /** A new stroke begins: drop what the previous one left behind. */
  function beginStroke(): void {
    brushStart = null;
    cellStart = null;
    cellPrev = null;
    wallOrigin = null;
    wallLast = null;
    brushRay = null;
    cellRay = null;
  }

  // ── Round brush ────────────────────────────────────────────────────────
  /**
   * The points a brush press paints through, in order. A Shift press with a
   * remembered end starts from that end, so clicking a room's corners in turn
   * draws its walls; otherwise it is just the press.
   */
  function brushPress(press: Point, shift: boolean): Point[] {
    if (shift && brushEnd) {
      brushStart = brushEnd;
      return [brushEnd, press];
    }
    brushStart = press;
    return [press];
  }

  /**
   * The pointer while dragging. With Shift it is held on one 45 degree ray from
   * where the stroke began (or, after Shift was let go and pressed again, from
   * where the pointer was then); the ray is chosen once and the pointer is
   * projected onto it, never back past the start.
   */
  function brushTarget(pointer: Point, shift: boolean): Point {
    if (!shift) {
      // Free painting: the next Shift press anchors where the pointer is now.
      brushRay = null;
      brushStart = pointer;
      return pointer;
    }
    if (!brushStart) return pointer;
    const [sx, sy] = brushStart;
    if (!brushRay) {
      if (Math.hypot(pointer[0] - sx, pointer[1] - sy) < RAY_LOCK_DISTANCE) return brushStart;
      const snapped = snapToAngle(brushStart, pointer);
      const length = Math.hypot(snapped[0] - sx, snapped[1] - sy);
      brushRay = [(snapped[0] - sx) / length, (snapped[1] - sy) / length];
    }
    const along = Math.max(0, (pointer[0] - sx) * brushRay[0] + (pointer[1] - sy) * brushRay[1]);
    return [sx + along * brushRay[0], sy + along * brushRay[1]];
  }

  function brushEnded(last: Point | null): void {
    if (last) brushEnd = last;
  }

  // ── Cell painters ──────────────────────────────────────────────────────
  /** The cells a press paints: a straight line from the remembered cell on Shift, else the press cell. */
  function cellPress(press: Cell, shift: boolean): Cell[] {
    cellPrev = press;
    if (shift && cellEnd) {
      cellStart = cellEnd;
      return cellLine(cellEnd, press);
    }
    cellStart = press;
    return [press];
  }

  /**
   * The cells a drag step paints. With Shift the target is held on one 45
   * degree ray from the stroke's start (chosen once, then followed as far as
   * the pointer goes along it) and the whole line to it is painted, so a fast
   * drag leaves no gaps; without it, just the cell under the pointer.
   */
  function cellDrag(cell: Cell, shift: boolean): Cell[] {
    const from = cellPrev ?? cell;
    if (!shift) {
      // Free painting: the next Shift press anchors where the pointer is now.
      cellRay = null;
      cellStart = cell;
      cellPrev = cell;
      return [cell];
    }
    const start = cellStart ?? cell;
    if (!cellRay && (cell[0] !== start[0] || cell[1] !== start[1])) {
      const snapped = snapCellToAngle(start[0], start[1], cell[0], cell[1]);
      cellRay = [Math.sign(snapped[0] - start[0]), Math.sign(snapped[1] - start[1])];
    }
    let target: Cell = [start[0], start[1]];
    if (cellRay) {
      const [rx, ry] = cellRay;
      const steps = Math.max(0, Math.round(((cell[0] - start[0]) * rx + (cell[1] - start[1]) * ry) / (rx * rx + ry * ry)));
      target = [start[0] + steps * rx, start[1] + steps * ry];
    }
    cellPrev = target;
    return cellLine(from, target);
  }

  function cellEnded(): void {
    if (cellPrev) cellEnd = cellPrev;
  }

  // ── Wall ───────────────────────────────────────────────────────────────
  /**
   * The edges of a straight wall from the last wall point to the pointer's
   * nearest grid vertex, or null when there is no Shift or nothing to join.
   */
  function runFromAnchor(pointer: Point, shift: boolean): CellEdge[] | null {
    if (!shift || !wallEnd) return null;
    const run = wallRun(wallEnd, nearestVertex(pointer[0], pointer[1]));
    wallEnd = run.end;
    return run.edges;
  }

  /** An edge the running wall stroke is about to paint or erase. The first one fixes the stroke's line. */
  function noteWallEdge(edge: CellEdge): void {
    wallLast = edge;
    wallOrigin ??= canonicaliseEdge(edge.x, edge.y, edge.side);
  }

  /** With Shift, an edge off the line the stroke began on (another row or column) is out of bounds. */
  function wallEdgeOffLine(edge: CellEdge, shift: boolean): boolean {
    if (!shift || !wallOrigin) return false;
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    if (canon.side !== wallOrigin.side) return true;
    return canon.side === "N" ? canon.y !== wallOrigin.y : canon.x !== wallOrigin.x;
  }

  /** The stroke is over: its last edge's end nearest the release becomes the next run's start. */
  function wallEnded(release: Point): void {
    if (wallLast) wallEnd = runAnchor(wallLast, nearestVertex(release[0], release[1]));
  }

  return {
    forget, beginStroke,
    brushPress, brushTarget, brushEnded,
    cellPress, cellDrag, cellEnded,
    runFromAnchor, noteWallEdge, wallEdgeOffLine, wallEnded,
  };
}
