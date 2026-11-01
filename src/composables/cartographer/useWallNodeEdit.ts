// The wall-node editing controller (epic #1125, canvas frame 17: "Drag a node: every wall meeting there follows").
// The canvas editor routes pointer events and keys here; this decides what they mean over `layers.walls`, keeps a live
// preview during a drag, and on release hands the caller the next walls plus the floor that follows the outline, so one
// gesture is one undo step. The geometry lives in `cartographer/wallEdit/`; nothing here draws.
//
// The caller's `commit` must apply the change synchronously (the controller re-reads `layers()` straight after).

import { computed, ref, shallowRef } from "vue";
import type { CellKey, DungeonMapLayers, PackRef, WallEdge } from "@/types/dungeonMap.types";
import { moveBone, moveNode, removeNode, deleteBone, splitAt, toggleSmooth, type EditOptions, type EditRefusal } from "@/cartographer/wallEdit/edit";
import { buildGraph, nearestOnPath, nodePos, runAt, type GraphNode, type Run, type WallGraph, type WallMap } from "@/cartographer/wallEdit/graph";
import { wallsAsPieces } from "@/cartographer/wallGeometry";
import { detectRooms, floorChange } from "@/cartographer/wallEdit/rooms";
import { snapNode, type SnapTarget } from "@/cartographer/wallEdit/snap";
import { clean, nodeIdOf, type Pt } from "@/cartographer/wallEdit/geometry";

export interface WallNodeMods {
  /** Shift: slide a bone, or hold a dragged node to 45 degrees. */
  shift: boolean;
  /** Alt: skip the grid (nodes and walls still pull). */
  alt: boolean;
}

export interface WallNodePack {
  packId: string;
  packVersion: number;
  variant: number;
}

/** One gesture's result: the walls, and the floor squares that follow the outline. */
export interface WallNodeCommit {
  walls: Record<string, WallEdge>;
  /** Squares whose middle is now inside a room and were not. */
  addFloor: CellKey[];
  /** Squares no room covers any more. */
  removeFloor: CellKey[];
  pack: WallNodePack;
}

export interface WallNodeEditOptions {
  layers: () => DungeonMapLayers;
  commit: (change: WallNodeCommit) => void;
  /** The pack new floor is laid in. */
  pack: () => WallNodePack;
  /** How close a pointer must be to a node or bone to hit it, in cells. */
  hitTolerance: () => number;
  /** Keys for new angled segments (tests inject a counter). */
  newKey?: () => string;
}

export type WallFocus = { kind: "node"; id: string } | { kind: "bone"; runId: string } | null;

export interface WallSelectionInfo {
  runs: Run[];
  nodes: GraphNode[];
  bones: number;
  nodeCount: number;
  doors: number;
}

const EMPTY_INFO: WallSelectionInfo = { runs: [], nodes: [], bones: 0, nodeCount: 0, doors: 0 };
const isDoor = (w: WallEdge): boolean => w.type === "doorClosed" || w.type === "doorOpen";
/** Pointer travel (cells) before a press on a bone's middle becomes a drag, so a plain click does not bend it. */
const DRAG_START = 0.05;
const GRID_STEP = 0.5;

/** The floor changes of a commit applied to the layers; the caller's undo step stores the result. */
export function applyWallCommit(layers: DungeonMapLayers, change: WallNodeCommit): DungeonMapLayers {
  const floor = { ...layers.floor };
  const ref: PackRef = { pack_id: change.pack.packId, pack_version: change.pack.packVersion, variant: change.pack.variant };
  for (const key of change.addFloor) {
    // Floor already laid there (a different pack, a hand-painted square) stays as it is.
    if (!floor[key]?.floor) floor[key] = { ...floor[key], floor: ref };
  }
  for (const key of change.removeFloor) {
    delete floor[key];
  }
  return { ...layers, floor, walls: change.walls };
}

type Drag =
  | { kind: "node"; id: string; origin: Pt; base: WallMap; keep: Set<string> }
  | { kind: "bone"; runId: string; start: Pt; normal: Pt; base: WallMap; keep: Set<string> }
  // A press on a bone's middle; the split happens on the first real move.
  | { kind: "middle"; runId: string; start: Pt; base: WallMap };

export function useWallNodeEdit(opts: WallNodeEditOptions) {
  /** A node on the selection that is a straight point in the stored walls; carried so a rebuild does not lose it. */
  const kept = shallowRef<ReadonlySet<string>>(new Set());
  /** A node of the selected wall run; the run is the connected walls from it. */
  const anchor = ref<string | null>(null);
  const focus = ref<WallFocus>(null);
  const preview = shallowRef<WallMap | null>(null);
  const snap = shallowRef<SnapTarget | null>(null);
  const refusal = ref<EditRefusal | null>(null);
  const hoverNode = ref<string | null>(null);
  const draggedNode = ref<string | null>(null);
  const isDragging = ref(false);
  let drag: Drag | null = null;
  let anchorBeforeDrag: string | null = null;

  const editOpts = (keep: ReadonlySet<string>): EditOptions => ({ keepNodes: keep, newKey: opts.newKey });
  const currentWalls = (): WallMap => opts.layers().walls;
  const graphOf = (walls: WallMap, keep: ReadonlySet<string> = kept.value): WallGraph => buildGraph(walls, { breakAt: keep });

  /** What the canvas shows: the preview while dragging, the stored walls otherwise. */
  const shownWalls = computed(() => preview.value ?? currentWalls());
  const shownGraph = computed(() => graphOf(shownWalls.value, withDragged(kept.value)));

  function withDragged(keep: ReadonlySet<string>): ReadonlySet<string> {
    return draggedNode.value ? new Set([...keep, draggedNode.value]) : keep;
  }

  const selection = computed<WallSelectionInfo>(() => {
    const g = shownGraph.value;
    const start = anchor.value;
    if (!start || !g.nodes.has(start)) return EMPTY_INFO;
    const seen = new Set([start]);
    const queue = [start];
    const runs: Run[] = [];
    const runSeen = new Set<string>();
    while (queue.length) {
      const id = queue.pop()!;
      for (const run of g.runs) {
        if ((run.a !== id && run.b !== id) || runSeen.has(run.id)) continue;
        runSeen.add(run.id);
        runs.push(run);
        for (const end of [run.a, run.b]) {
          if (seen.has(end)) continue;
          seen.add(end);
          queue.push(end);
        }
      }
    }
    const nodes = [...seen].map((id) => g.nodes.get(id)!);
    const doors = runs.reduce((n, r) => n + r.segments.filter((s) => isDoor(s.wall)).length, 0);
    return { runs, nodes, bones: runs.length, nodeCount: nodes.length, doors };
  });

  const hasSelection = computed(() => selection.value.bones > 0);

  function clearSelection(): void {
    anchor.value = null;
    focus.value = null;
    kept.value = new Set();
    hoverNode.value = null;
  }

  /** Picks the wall run under `point` (all the walls joined to the bone hit), or clears. Returns whether one was hit. */
  function select(point: Pt): boolean {
    const g = graphOf(currentWalls(), new Set());
    const hit = runAt(g, point, opts.hitTolerance());
    kept.value = new Set();
    if (!hit) {
      clearSelection();
      return false;
    }
    anchor.value = hit.run.a;
    focus.value = { kind: "bone", runId: hit.run.id };
    return true;
  }

  function nodeAt(graph: WallGraph, point: Pt): string | undefined {
    const tol = opts.hitTolerance();
    let best: string | undefined;
    let bestD = Infinity;
    for (const n of selection.value.nodes) {
      if (!graph.nodes.has(n.id)) continue;
      const d = Math.hypot(point[0] - n.x, point[1] - n.y);
      if (d <= tol && d < bestD) {
        best = n.id;
        bestD = d;
      }
    }
    return best;
  }

  function boneAt(graph: WallGraph, point: Pt): Run | undefined {
    const hit = runAt(graph, point, opts.hitTolerance());
    return hit && selection.value.runs.some((r) => r.id === hit.run.id) ? hit.run : undefined;
  }

  function pointerMoveIdle(point: Pt): void {
    hoverNode.value = hasSelection.value ? (nodeAt(shownGraph.value, point) ?? null) : null;
  }

  function pointerDown(point: Pt, mods: WallNodeMods): void {
    if (drag) return;
    if (!hasSelection.value) {
      select(point);
      return;
    }
    isDragging.value = true;
    const base = currentWalls();
    const g = graphOf(base);
    const nodeId = nodeAt(g, point);
    if (nodeId) {
      focus.value = { kind: "node", id: nodeId };
      anchorBeforeDrag = anchor.value;
      draggedNode.value = nodeId;
      drag = { kind: "node", id: nodeId, origin: nodePos(g, nodeId), base, keep: new Set(kept.value) };
      return;
    }
    const run = boneAt(g, point);
    if (!run) {
      isDragging.value = false;
      select(point);
      return;
    }
    focus.value = { kind: "bone", runId: run.id };
    anchorBeforeDrag = anchor.value;
    if (mods.shift) {
      const a = nodePos(g, run.a);
      const b = nodePos(g, run.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      drag = {
        kind: "bone",
        runId: run.id,
        start: point,
        normal: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len],
        base,
        keep: new Set(kept.value),
      };
    } else drag = { kind: "middle", runId: run.id, start: point, base };
  }

  /** Holds `p` to the nearest 45 degree ray from `origin`. */
  function toRay(origin: Pt, p: Pt): [number, number] {
    const dx = p[0] - origin[0];
    const dy = p[1] - origin[1];
    const step = Math.PI / 4;
    const ang = Math.round(Math.atan2(dy, dx) / step) * step;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    return [origin[0] + along * Math.cos(ang), origin[1] + along * Math.sin(ang)];
  }

  function dragNode(d: Extract<Drag, { kind: "node" }>, point: Pt, mods: WallNodeMods): void {
    const g = graphOf(d.base, d.keep);
    const raw = mods.shift ? toRay(d.origin, point) : point;
    // A held angle would be undone by rounding to the grid, so Shift behaves like Alt for the grid only.
    const target = snapNode(raw, g, { dragged: d.id, free: mods.alt || mods.shift, tolerance: opts.hitTolerance(), step: GRID_STEP });
    snap.value = target;
    const res = moveNode(d.base, d.id, target.point, editOpts(d.keep));
    if (!res.ok) {
      refusal.value = res.reason; // the last good preview stays
      return;
    }
    refusal.value = null;
    preview.value = res.walls;
    const id = nodeIdOf(target.point);
    draggedNode.value = id;
    anchor.value = id;
  }

  function dragBone(d: Extract<Drag, { kind: "bone" }>, point: Pt, mods: WallNodeMods): void {
    const g = graphOf(d.base, d.keep);
    const run = g.runs.find((r) => r.id === d.runId);
    if (!run) return;
    let off = (point[0] - d.start[0]) * d.normal[0] + (point[1] - d.start[1]) * d.normal[1];
    if (!mods.alt) off = Math.round(off / GRID_STEP) * GRID_STEP;
    const delta: [number, number] = [clean(d.normal[0] * off), clean(d.normal[1] * off)];
    const res = moveBone(d.base, d.runId, delta, editOpts(d.keep));
    if (!res.ok) {
      refusal.value = res.reason;
      return;
    }
    refusal.value = null;
    preview.value = res.walls;
    const a = nodePos(g, run.a);
    anchor.value = nodeIdOf([a[0] + delta[0], a[1] + delta[1]]);
  }

  function pointerMove(point: Pt, mods: WallNodeMods): void {
    if (!drag) {
      pointerMoveIdle(point);
      return;
    }
    if (drag.kind === "middle") {
      if (Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]) < DRAG_START) return;
      // "Drag a bone's middle: the same, then bends": a node appears under the press and is dragged.
      const keepNow = new Set(kept.value);
      const res = splitAt(drag.base, drag.runId, drag.start, editOpts(keepNow));
      if (!res.ok || !res.node) {
        endDrag();
        return;
      }
      keepNow.add(res.node);
      drag = { kind: "node", id: res.node, origin: [Number(res.node.split(",")[0]), Number(res.node.split(",")[1])], base: res.walls, keep: keepNow };
      draggedNode.value = res.node;
      focus.value = { kind: "node", id: res.node };
      anchor.value = res.node;
      preview.value = res.walls;
    }
    if (drag.kind === "node") dragNode(drag, point, mods);
    else dragBone(drag, point, mods);
  }

  function emit(base: WallMap, next: WallMap): void {
    // Rooms are found on the drawn lines, so a curved wall takes the floor with it.
    const change = floorChange(detectRooms(buildGraph(wallsAsPieces(base))), detectRooms(buildGraph(wallsAsPieces(next))));
    opts.commit({ walls: next, addFloor: change.add, removeFloor: change.remove, pack: opts.pack() });
  }

  function endDrag(): void {
    drag = null;
    isDragging.value = false;
    preview.value = null;
    snap.value = null;
    refusal.value = null;
    draggedNode.value = null;
  }

  /** Leaves the kept set holding only nodes that still exist; `extra` are nodes to carry. */
  function settle(extra: Iterable<string> = []): void {
    const g = buildGraph(currentWalls());
    const next = new Set<string>();
    for (const id of [...kept.value, ...extra]) {
      const n = g.nodes.get(id);
      if (n && n.segs.length === 2) next.add(id); // only a straight degree-2 point needs carrying
    }
    kept.value = next;
  }

  function pointerUp(): void {
    const d = drag;
    if (!d) return;
    const shown = preview.value;
    const endAnchor = anchor.value;
    endDrag();
    if (d.kind === "middle" || !shown || shown === d.base) {
      anchor.value = anchorBeforeDrag;
      return;
    }
    const carried = d.kind === "node" ? [...d.keep].filter((id) => id !== d.id) : [...d.keep];
    kept.value = new Set(carried);
    emit(d.base, shown);
    anchor.value = endAnchor;
    // The dragged node is now at its new id; carry it if it ended up straight.
    settle(d.kind === "node" && endAnchor ? [endAnchor] : []);
    if (d.kind === "node" && endAnchor) focus.value = { kind: "node", id: endAnchor };
  }

  function cancel(): boolean {
    if (drag) {
      anchor.value = anchorBeforeDrag;
      endDrag();
      return true;
    }
    if (hasSelection.value) {
      clearSelection();
      return true;
    }
    return false;
  }

  /** Double-click on a node switches it between a smooth curve and a corner; one undo step. */
  function toggleNode(base: WallMap, nodeId: string): boolean {
    const res = toggleSmooth(base, nodeId);
    if (!res.ok) {
      refusal.value = res.reason;
      return false;
    }
    refusal.value = null;
    // A corner on a straight stretch leaves no trace in the walls, so it is carried to stay a node on screen.
    kept.value = new Set([...kept.value, nodeId]);
    focus.value = { kind: "node", id: nodeId };
    emit(base, res.walls);
    return true;
  }

  /** Double-click: on a node, switch it between curve and corner; on a wall away from the nodes, add a node there. */
  function doubleClick(point: Pt): boolean {
    if (!hasSelection.value && !select(point)) return false;
    const base = currentWalls();
    const g = graphOf(base);
    const nodeId = nodeAt(g, point);
    if (nodeId) return toggleNode(base, nodeId);
    const run = boneAt(g, point);
    if (!run) return false;
    const at = run.path ? nearestOnPath(point, run.path).foot : onStraightRun(g, run, point);
    const res = splitAt(base, run.id, at, editOpts(kept.value));
    if (!res.ok || !res.node) return false;
    kept.value = new Set([...kept.value, res.node]);
    focus.value = { kind: "node", id: res.node };
    // A node on a wall that is already one changes no walls; nothing to record.
    if (Object.keys(res.walls).some((k) => res.walls[k] !== base[k]) || Object.keys(base).length !== Object.keys(res.walls).length) {
      opts.commit({ walls: res.walls, addFloor: [], removeFloor: [], pack: opts.pack() });
    }
    return true;
  }

  /** Where a new node goes on a straight run: the half cell along it nearest the click, else the click's foot. */
  function onStraightRun(g: WallGraph, run: Run, point: Pt): [number, number] {
    const a = nodePos(g, run.a);
    const b = nodePos(g, run.b);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2));
    const foot: [number, number] = [a[0] + dx * t, a[1] + dy * t];
    // Prefer a half-cell along the wall when the click is near one.
    const along = Math.hypot(dx, dy);
    const snapped = Math.round((t * along) / GRID_STEP) * GRID_STEP;
    const onHalf = snapped / along;
    const cand: [number, number] = [a[0] + dx * onHalf, a[1] + dy * onHalf];
    return Math.hypot(cand[0] - foot[0], cand[1] - foot[1]) <= opts.hitTolerance() ? cand : foot;
  }

  /** Del: on a node its two bones become one wall; on a bone that wall goes. Returns whether anything changed. */
  function deleteSelection(): boolean {
    const f = focus.value;
    if (!f || drag) return false;
    const base = currentWalls();
    const g = graphOf(base);
    if (f.kind === "node") {
      const res = removeNode(base, f.id, editOpts(kept.value));
      if (!res.ok) {
        refusal.value = res.reason;
        return false;
      }
      const joined = g.runs.filter((r) => r.a === f.id || r.b === f.id).map((r) => (r.a === f.id ? r.b : r.a));
      const next = new Set(kept.value);
      next.delete(f.id);
      kept.value = next;
      emit(base, res.walls);
      anchor.value = joined[0] ?? null;
      focus.value = null;
      settle();
      return true;
    }
    const run = g.runs.find((r) => r.id === f.runId);
    const res = deleteBone(base, f.runId, editOpts(kept.value));
    if (!run || !res.ok) return false;
    emit(base, res.walls);
    focus.value = null;
    const rest = buildGraph(res.walls);
    anchor.value = [run.a, run.b].find((id) => rest.nodes.has(id)) ?? null;
    if (!anchor.value) clearSelection();
    settle();
    return true;
  }

  return {
    select,
    pointerDown,
    pointerMove,
    pointerUp,
    doubleClick,
    deleteSelection,
    cancel,
    clearSelection,
    /** The selected wall run: its bones, nodes and the counts for the slip. */
    selection,
    focus,
    /** Walls with the drag applied, null when not dragging. */
    preview,
    /** The walls the canvas draws: the preview while dragging. */
    shownWalls,
    snap,
    /** Why the last move was refused; the preview keeps its last good shape. */
    refusal,
    hoverNode,
    draggedNode,
    dragging: isDragging,
  };
}
