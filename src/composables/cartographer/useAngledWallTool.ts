// The Angled wall tool (#1125 story 5, epic decision 5): click to start a run, click to add points, double-click or
// Enter ends it, Escape throws the unfinished run away. Each segment of a finished run becomes a `WallEdge` of the
// active wall kind in `layers.walls`, so the whole run is one undo step. The same module picks an angled wall for the
// Select tool (a click within 0.3 cells) and toggles one between wall and door for the Door tool.
//
// Like useDressingTool, the editor owns the canvas, the viewport and the undo stack and hands this the snapshot /
// pushCommand pair; what a gesture means lives here and the editor only routes pointer events to it.

import { ref, type Ref } from "vue";
import type { PaintedWallKind } from "@/cartographer/paintOps";
import * as paintOps from "@/cartographer/paintOps";
import { snapPoint, nearestAngledWall, type CellPoint } from "@/cartographer/wallPick";
import type { WallKind } from "@/cartographer/wallKinds";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

export interface AngledWallToolOptions {
  layers: Ref<DungeonMapLayers>;
  /** What the run is drawn as; "decal" dresses a lattice wall, so an angled wall drawn under it is a plain wall. */
  wallKind: Ref<WallKind>;
  /** The pack and version a new wall is recorded against. */
  pack: () => { packId: string; packVersion: number };
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
}

export function useAngledWallTool(opts: AngledWallToolOptions) {
  const { layers, wallKind, pack, snapshotStr, pushCommand, markDirty } = opts;

  /** The points of the run in progress; fewer than two draws nothing yet. */
  const run = ref<CellPoint[]>([]);
  /** The snapped point under the pointer, where the next click would land. */
  const hover = ref<CellPoint | null>(null);
  /** The angled wall picked with Select (or just drawn), for Delete and the highlight. */
  const selectedId = ref<string | null>(null);

  function paintedKind(): PaintedWallKind {
    return wallKind.value === "decal" ? "wall" : wallKind.value;
  }

  function track(frac: CellPoint, free: boolean): void {
    hover.value = snapPoint(frac, free);
  }

  /** A click: the first starts a run, the rest add a point. A click on the point just placed is ignored, which is what
   *  makes the second click of a double-click harmless. */
  function click(frac: CellPoint, free: boolean): void {
    const point = snapPoint(frac, free);
    hover.value = point;
    const last = run.value.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) return;
    run.value = [...run.value, point];
    selectedId.value = null;
  }

  /** Ends the run: one wall per segment, one undo step. A run of a single point is just thrown away. */
  function finish(): boolean {
    const points = run.value;
    run.value = [];
    if (points.length < 2) return false;
    const before = snapshotStr();
    const { packId, packVersion } = pack();
    let lastId: string | null = null;
    for (let i = 0; i < points.length - 1; i++) {
      const id = crypto.randomUUID();
      layers.value.walls[id] = {
        pack_id: packId,
        pack_version: packVersion,
        type: paintedKind(),
        variant: 0,
        a: [points[i][0], points[i][1]],
        b: [points[i + 1][0], points[i + 1][1]],
      };
      lastId = id;
    }
    selectedId.value = lastId;
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  function abandon(): void {
    run.value = [];
  }

  function pickAt(frac: CellPoint): string | null {
    const id = nearestAngledWall(layers.value.walls, frac);
    selectedId.value = id;
    return id;
  }

  function deleteSelected(): boolean {
    const id = selectedId.value;
    if (!id) return false;
    const before = snapshotStr();
    if (!paintOps.removeWallById({ layers: layers.value, ...pack() }, id)) return false;
    selectedId.value = null;
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  /** The Door tool on an angled wall: whether `frac` is on one (so the grid edge under the pointer is not the target). */
  function wallNear(frac: CellPoint): string | null {
    return nearestAngledWall(layers.value.walls, frac);
  }

  /** Toggles the angled wall at `id` between wall and door. The caller's stroke snapshot makes it one undo step. */
  function toggleDoor(id: string, doorVariant: number): boolean {
    return paintOps.toggleAngledDoor({ layers: layers.value, ...pack() }, id, doorVariant);
  }

  /** Walls vanish from under the selection on undo or redo: never keep a handle on something that is gone. */
  function dropStaleSelection(): void {
    if (selectedId.value && !layers.value.walls[selectedId.value]) selectedId.value = null;
  }

  return { run, hover, selectedId, track, click, finish, abandon, pickAt, deleteSelected, wallNear, toggleDoor, dropStaleSelection };
}
