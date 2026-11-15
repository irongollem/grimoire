// The Freehand wall tool (#1197, canvas frame 03): one drag draws one wall. The dragged line is recorded as the
// pointer moves, and on release it is welded to what it touches, fitted to few smooth nodes (the same fit the round
// brush uses) and written as angled walls, all as one undo step.
//
// Like useAngledWallTool, the editor owns the canvas and the undo stack and hands this the snapshot / pushCommand
// pair; the pointer routing lives in useEditorPointer.

import { ref, type Ref } from "vue";
import type { PaintedWallKind } from "@/cartographer/paintOps";
import { runToWalls, outlineToWalls } from "@/cartographer/brushWalls";
import { snapRunPoint, RUN_SNAP_REACH, type CellPoint } from "@/cartographer/wallPick";
import type { WallKind } from "@/cartographer/wallKinds";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

/** A drag point closer than this (cells) to the last recorded one is dropped, so a slow drag does not pile up points. */
export const MIN_POINT_SPACING = 0.05;
/** A stroke shorter than this (cells), end to end and in total length, is a stray click and writes nothing. */
export const MIN_STROKE_LENGTH = 0.5;
/** A stroke must be at least this long (cells) in total for its end on its start to close a ring. */
export const MIN_RING_LENGTH = 2;

export interface FreehandWallToolOptions {
  layers: Ref<DungeonMapLayers>;
  /** What the wall is drawn as; "decal" dresses a lattice wall, so a freehand wall is a plain wall. */
  wallKind: Ref<WallKind>;
  pack: () => { packId: string; packVersion: number };
  /** Creation visibility is independent from blocking: hidden walls still stop sight and movement. */
  visible?: () => boolean;
  /** The wall picked with Select or just drawn, shared with the Angled wall tool so Delete and the highlight read one. */
  selectedId: Ref<string | null>;
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
}

function pathLength(points: readonly CellPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

export function useFreehandWallTool(opts: FreehandWallToolOptions) {
  const { layers, wallKind, pack, selectedId, snapshotStr, pushCommand, markDirty } = opts;

  /** The points of the stroke in progress, for the preview; empty when no stroke is being dragged. */
  const stroke = ref<CellPoint[]>([]);

  function start(frac: CellPoint): void {
    stroke.value = [[frac[0], frac[1]]];
  }

  function move(frac: CellPoint): void {
    const last = stroke.value.at(-1);
    if (!last) return;
    if (Math.hypot(frac[0] - last[0], frac[1] - last[1]) < MIN_POINT_SPACING) return;
    stroke.value = [...stroke.value, [frac[0], frac[1]]];
  }

  function abandon(): void {
    stroke.value = [];
  }

  /** Moves `point` onto a wall end within reach, over the walls as they were before this stroke. */
  function weld(point: CellPoint, walls: DungeonMapLayers["walls"]): CellPoint {
    const snapped = snapRunPoint(point, false, [], walls);
    return snapped.kind === "wall-end" ? snapped.point : point;
  }

  /** Ends the drag: weld, fit, write. Returns whether anything was written. `free` (Alt) skips welding and closing. */
  function release(frac: CellPoint, free: boolean): boolean {
    move(frac);
    const points = stroke.value;
    stroke.value = [];
    if (points.length < 2) return false;
    const total = pathLength(points);
    const first = points[0];
    const last = points[points.length - 1];
    const endToEnd = Math.hypot(last[0] - first[0], last[1] - first[1]);
    if (endToEnd < MIN_STROKE_LENGTH && total < MIN_STROKE_LENGTH) return false;

    const walls = layers.value.walls;
    const closes = !free && total >= MIN_RING_LENGTH && endToEnd <= RUN_SNAP_REACH;
    const path: CellPoint[] = points.map((p) => [p[0], p[1]]);
    if (!free) path[0] = weld(first, walls);
    let made: ReturnType<typeof runToWalls>;
    const { packId, packVersion } = pack();
    const material = { newKey: () => crypto.randomUUID(), wall: { pack_id: packId, pack_version: packVersion, variant: 0 } };
    if (closes) {
      // The last point is the first again; the outline is closed by the fit itself.
      made = outlineToWalls(path.slice(0, -1), material);
    } else {
      if (!free) path[path.length - 1] = weld(last, walls);
      made = runToWalls(path, material);
    }
    const ids = Object.keys(made);
    if (ids.length === 0) return false;

    const before = snapshotStr();
    const type: PaintedWallKind = wallKind.value === "decal" ? "wall" : wallKind.value;
    for (const id of ids) {
      layers.value.walls[id] = { ...made[id], type, ...(opts.visible?.() === false ? { visible: false } : {}) };
    }
    selectedId.value = ids[ids.length - 1];
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  return { stroke, start, move, release, abandon };
}
