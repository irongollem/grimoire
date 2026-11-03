// The wall-node editing controller (epic #1125, canvas frame 17: "Drag a node: every wall meeting there follows").
// Selection follows Illustrator's Direct Selection: a click picks one segment (a run between two nodes), Alt+click the
// whole connected wall, Shift+click adds or removes, and a marquee picks the nodes inside it, and the segments between
// them. What is picked is a set of segments (run ids) and a set of nodes: a segment's ends are always picked, a node can
// be picked alone.
// The canvas editor routes pointer events and keys here; this decides what they mean over `layers.walls`, keeps a live
// preview during a drag, and on release hands the caller the next walls plus the floor that follows the outline, so one
// gesture is one undo step. The geometry lives in `cartographer/wallEdit/`; nothing here draws.
//
// The caller's `commit` must apply the change synchronously (the controller re-reads `layers()` straight after).

import { computed, ref, shallowRef } from "vue";
import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { moveBone, moveNode, moveNodes, removeNode, splitAt, toggleSmooth, type EditOptions, type EditRefusal } from "@/cartographer/wallEdit/edit";
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
  /** The picked segments: runs whose two ends are both picked. */
  runs: Run[];
  /** Every picked node, including the ends of the picked segments. */
  nodes: GraphNode[];
  bones: number;
  nodeCount: number;
  doors: number;
}

/** The picked pieces: segments by run id, and nodes (which include every picked segment's ends). */
interface Pick {
  nodes: ReadonlySet<string>;
  runs: ReadonlySet<string>;
}
const NOTHING: Pick = { nodes: new Set(), runs: new Set() };

/** A run's id is its two end nodes, the smaller (x, then y) first, as `buildGraph` writes it. */
function runIdOf(a: string, b: string): string {
  const [ax, ay] = a.split(",").map(Number);
  const [bx, by] = b.split(",").map(Number);
  return ax < bx || (ax === bx && ay <= by) ? `${a}>${b}` : `${b}>${a}`;
}

function mapPick(p: Pick, through: (id: string) => string): Pick {
  return {
    nodes: new Set([...p.nodes].map(through)),
    runs: new Set([...p.runs].map((id) => {
      const [a, b] = id.split(">");
      return runIdOf(through(a), through(b));
    })),
  };
}

/** `node` taken out: its two segments, if either was picked, are one picked segment. */
function mergedPick(p: Pick, node: string): Pick {
  const ends = [...p.runs].filter((id) => id.split(">").includes(node));
  const runs = new Set([...p.runs].filter((id) => !ends.includes(id)));
  const others = new Set(ends.flatMap((id) => id.split(">")).filter((n) => n !== node));
  if (ends.length > 0 && others.size === 2) runs.add(runIdOf(...(([...others]) as [string, string])));
  const nodes = new Set(p.nodes);
  nodes.delete(node);
  return { nodes, runs };
}

/** A picked segment cut at `node` becomes its two halves, both picked, with the node. */
function splitPick(p: Pick, runId: string, node: string): Pick {
  const [a, b] = runId.split(">");
  const runs = new Set(p.runs);
  if (runs.delete(runId)) {
    runs.add(runIdOf(a, node));
    runs.add(runIdOf(node, b));
  }
  return { nodes: new Set([...p.nodes, node]), runs };
}

const EMPTY_INFO: WallSelectionInfo = { runs: [], nodes: [], bones: 0, nodeCount: 0, doors: 0 };
const NO_MODS: WallNodeMods = { shift: false, alt: false };
const isDoor = (w: WallEdge): boolean => w.type === "doorClosed" || w.type === "doorOpen";
/** Pointer travel (cells) before a press on a bone's middle becomes a drag, so a plain click does not bend it. */
const DRAG_START = 0.05;
const GRID_STEP = 0.5;

/** Applies a free physical-wall edit; material boundaries are projected separately by the region adapter. */
export function applyWallCommit(layers: DungeonMapLayers, change: WallNodeCommit): DungeonMapLayers {
  // A free physical wall is independent of material geometry. The region adapter updates a selected source boundary
  // and projects its cells; moving an unrelated wall must never mutate the authoritative material shapes.
  return { ...layers, walls: change.walls };
}

/** What a press that never moved does on release: Shift takes the piece out, a plain click narrows to it. */
type Release =
  | { kind: "remove"; nodes: readonly string[]; run?: string }
  | { kind: "narrow"; nodes: readonly string[]; run?: string; focus: WallFocus }
  // Alt on a picked bone: the whole wall, but only when the press was a click (Alt in a drag skips the grid).
  | { kind: "reselect"; point: Pt; mods: WallNodeMods }
  | null;

type Drag =
  | { kind: "node"; id: string; origin: Pt; base: WallMap; keep: Set<string>; release: Release }
  | { kind: "bone"; runId: string; start: Pt; normal: Pt; base: WallMap; keep: Set<string>; release: Release }
  // The picked nodes move together by the pointer's offset (a multi-selection, or a whole wall dragged by a bone).
  | { kind: "group"; start: Pt; ids: readonly string[]; base: WallMap; keep: Set<string>; release: Release }
  // A press on a bone's middle; the split happens on the first real move.
  | { kind: "middle"; runId: string; start: Pt; base: WallMap; release: Release };

export interface WallRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function useWallNodeEdit(opts: WallNodeEditOptions) {
  /** A node on the selection that is a straight point in the stored walls; carried so a rebuild does not lose it. */
  const kept = shallowRef<ReadonlySet<string>>(new Set());
  const picked = shallowRef<Pick>(NOTHING);
  /** Shift or a marquee built this selection, so dragging a picked node moves all of them (not only that node). */
  const multi = ref(false);
  /** While a drag is under way: each moved node's id before the drag and in the preview. */
  const dragMap = shallowRef<ReadonlyMap<string, string> | null>(null);
  const focus = ref<WallFocus>(null);
  const preview = shallowRef<WallMap | null>(null);
  const snap = shallowRef<SnapTarget | null>(null);
  const refusal = ref<EditRefusal | null>(null);
  const hoverNode = ref<string | null>(null);
  const draggedNode = ref<string | null>(null);
  const isDragging = ref(false);
  let drag: Drag | null = null;
  let pickedBeforeDrag: Pick = NOTHING;

  const editOpts = (keep: ReadonlySet<string>): EditOptions => ({ keepNodes: keep, newKey: opts.newKey });
  const currentWalls = (): WallMap => opts.layers().walls;
  const graphOf = (walls: WallMap, keep: ReadonlySet<string> = kept.value): WallGraph => buildGraph(walls, { breakAt: keep });

  /** What the canvas shows: the preview while dragging, the stored walls otherwise. */
  const shownWalls = computed(() => preview.value ?? currentWalls());
  const shownGraph = computed(() => graphOf(shownWalls.value, withDragged(kept.value)));

  function withDragged(keep: ReadonlySet<string>): ReadonlySet<string> {
    const map = dragMap.value;
    return map ? new Set([...keep, ...map.values()]) : keep;
  }

  /** The picked ids as the canvas sees them: moved along with the preview while a drag runs. */
  const pickedNow = computed<Pick>(() => {
    const map = dragMap.value;
    return map ? mapPick(picked.value, (id) => map.get(id) ?? id) : picked.value;
  });

  const selection = computed<WallSelectionInfo>(() => {
    const g = shownGraph.value;
    const ids = [...pickedNow.value.nodes].filter((id) => g.nodes.has(id));
    if (ids.length === 0) return EMPTY_INFO;
    const runs = g.runs.filter((r) => pickedNow.value.runs.has(r.id));
    const nodes = ids.map((id) => g.nodes.get(id)!);
    const doors = runs.reduce((n, r) => n + r.segments.filter((s) => isDoor(s.wall)).length, 0);
    return { runs, nodes, bones: runs.length, nodeCount: nodes.length, doors };
  });

  const hasSelection = computed(() => selection.value.nodeCount > 0);

  function clearSelection(): void {
    picked.value = NOTHING;
    multi.value = false;
    focus.value = null;
    kept.value = new Set();
    hoverNode.value = null;
  }

  /** The nodes joined to `from` through any chain of runs. */
  function componentNodes(g: WallGraph, from: readonly string[]): Set<string> {
    const seen = new Set(from);
    const queue = [...from];
    while (queue.length) {
      const id = queue.pop()!;
      for (const run of g.runs) {
        if (run.a !== id && run.b !== id) continue;
        for (const end of [run.a, run.b]) {
          if (seen.has(end)) continue;
          seen.add(end);
          queue.push(end);
        }
      }
    }
    return seen;
  }

  const isPicked = (run: Run): boolean => picked.value.runs.has(run.id);

  /**
   * Illustrator's rules for a click on a segment: plain picks that segment, Alt the whole wall it belongs to, Shift
   * adds it or, when it is already picked, takes it out.
   */
  function pickRun(g: WallGraph, run: Run, mods: WallNodeMods): void {
    const nodes = mods.alt ? componentNodes(g, [run.a, run.b]) : new Set([run.a, run.b]);
    const runs = mods.alt ? new Set(g.runs.filter((r) => nodes.has(r.a)).map((r) => r.id)) : new Set([run.id]);
    focus.value = { kind: "bone", runId: run.id };
    if (!mods.shift) {
      picked.value = { nodes, runs };
      multi.value = false;
      return;
    }
    multi.value = true;
    if (!isPicked(run)) {
      picked.value = { nodes: new Set([...picked.value.nodes, ...nodes]), runs: new Set([...picked.value.runs, ...runs]) };
      return;
    }
    picked.value = withoutRuns(g, picked.value, runs);
    focus.value = null;
  }

  /** The pick without `runs`; their ends stay only where another picked segment uses them. */
  function withoutRuns(g: WallGraph, from: Pick, runs: ReadonlySet<string>): Pick {
    const left = new Set([...from.runs].filter((id) => !runs.has(id)));
    const nodes = new Set(from.nodes);
    for (const r of g.runs) if (runs.has(r.id)) {
      nodes.delete(r.a);
      nodes.delete(r.b);
    }
    for (const r of g.runs) if (left.has(r.id)) {
      nodes.add(r.a);
      nodes.add(r.b);
    }
    return { nodes, runs: left };
  }

  /** Picks the wall under `point`: one segment, with Alt the whole wall, with Shift added to what is picked. */
  function select(point: Pt, mods: WallNodeMods = NO_MODS): boolean {
    const g = graphOf(currentWalls(), mods.shift ? kept.value : new Set());
    const hit = runAt(g, point, opts.hitTolerance());
    if (!hit) {
      if (!mods.shift) clearSelection();
      return false;
    }
    if (!mods.shift) kept.value = new Set();
    pickRun(g, hit.run, mods);
    return true;
  }

  function nodeAt(graph: WallGraph, point: Pt, ids: ReadonlySet<string>): string | undefined {
    const tol = opts.hitTolerance();
    let best: string | undefined;
    let bestD = Infinity;
    for (const id of ids) {
      const n = graph.nodes.get(id);
      if (!n) continue;
      const d = Math.hypot(point[0] - n.x, point[1] - n.y);
      if (d <= tol && d < bestD) {
        best = n.id;
        bestD = d;
      }
    }
    return best;
  }

  function pointerMoveIdle(point: Pt): void {
    hoverNode.value = hasSelection.value ? (nodeAt(shownGraph.value, point, pickedNow.value.nodes) ?? null) : null;
  }

  function startDrag(next: Drag): void {
    pickedBeforeDrag = picked.value;
    isDragging.value = true;
    drag = next;
  }

  function pressNode(g: WallGraph, base: WallMap, id: string, point: Pt, mods: WallNodeMods): void {
    focus.value = { kind: "node", id };
    const group = multi.value && picked.value.nodes.size > 1;
    const release: Release = mods.shift
      ? { kind: "remove", nodes: [id] }
      : group ? { kind: "narrow", nodes: [id], focus: { kind: "node", id } } : null;
    if (group) {
      startDrag({ kind: "group", start: point, ids: [...picked.value.nodes], base, keep: new Set(kept.value), release });
      return;
    }
    draggedNode.value = id;
    dragMap.value = new Map([[id, id]]);
    startDrag({ kind: "node", id, origin: nodePos(g, id), base, keep: new Set(kept.value), release });
  }

  function pressBone(g: WallGraph, base: WallMap, run: Run, point: Pt, mods: WallNodeMods, fresh: boolean): void {
    focus.value = { kind: "bone", runId: run.id };
    const lone = selection.value.runs.length === 1;
    const release: Release = mods.alt
      ? { kind: "reselect", point, mods }
      : mods.shift
        ? { kind: "remove", nodes: [run.a, run.b], run: run.id }
        : lone || fresh ? null : { kind: "narrow", nodes: [run.a, run.b], run: run.id, focus: { kind: "bone", runId: run.id } };
    if (!lone) {
      startDrag({ kind: "group", start: point, ids: [...picked.value.nodes], base, keep: new Set(kept.value), release });
      return;
    }
    if (mods.shift) {
      const a = nodePos(g, run.a);
      const b = nodePos(g, run.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      startDrag({
        kind: "bone",
        runId: run.id,
        start: point,
        normal: [-(b[1] - a[1]) / len, (b[0] - a[0]) / len],
        base,
        keep: new Set(kept.value),
        release,
      });
    } else startDrag({ kind: "middle", runId: run.id, start: point, base, release });
  }

  /**
   * A press. Returns whether it landed on a wall piece (a handle of what is picked, or any wall): the caller starts a
   * marquee when it did not. A wall that is not picked yet is picked first, then dragged like one that was. `fresh`
   * says the caller has just picked what is under the pointer, so a click that never moves keeps the pick whole.
   */
  function pointerDown(point: Pt, mods: WallNodeMods, fresh = false): boolean {
    if (drag) return false;
    const base = currentWalls();
    let g = graphOf(base);
    const nodeId = hasSelection.value ? nodeAt(g, point, picked.value.nodes) : undefined;
    if (nodeId) {
      pressNode(g, base, nodeId, point, mods);
      return true;
    }
    let hit = runAt(g, point, opts.hitTolerance());
    if (!hit) return false;
    if (!isPicked(hit.run)) {
      if (!mods.shift) {
        kept.value = new Set();
        g = graphOf(base);
        hit = runAt(g, point, opts.hitTolerance());
        if (!hit) return false;
      }
      pickRun(g, hit.run, mods);
      if (mods.shift) return true;
      pressBone(g, base, hit.run, point, NO_MODS, true);
      return true;
    }
    pressBone(g, base, hit.run, point, mods, fresh);
    return true;
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
    dragMap.value = new Map([[d.id, id]]);
  }

  function dragBone(d: Extract<Drag, { kind: "bone" }>, point: Pt, mods: WallNodeMods): void {
    const g = graphOf(d.base, d.keep);
    const run = g.runs.find((r) => r.id === d.runId);
    if (!run) return;
    let off = (point[0] - d.start[0]) * d.normal[0] + (point[1] - d.start[1]) * d.normal[1];
    if (!mods.alt) off = Math.round(off / GRID_STEP) * GRID_STEP;
    const delta: [number, number] = [clean(d.normal[0] * off), clean(d.normal[1] * off)];
    if (delta[0] === 0 && delta[1] === 0) {
      preview.value = null;
      dragMap.value = null;
      return;
    }
    const res = moveBone(d.base, d.runId, delta, editOpts(d.keep));
    if (!res.ok) {
      refusal.value = res.reason;
      return;
    }
    refusal.value = null;
    preview.value = res.walls;
    const a = nodePos(g, run.a);
    const b = nodePos(g, run.b);
    dragMap.value = new Map([
      [run.a, nodeIdOf([a[0] + delta[0], a[1] + delta[1]])],
      [run.b, nodeIdOf([b[0] + delta[0], b[1] + delta[1]])],
    ]);
  }

  /** Moves every picked node by `delta` (cells) from where the drag began. */
  function groupBy(d: Extract<Drag, { kind: "group" }>, delta: Pt): void {
    if (delta[0] === 0 && delta[1] === 0) {
      preview.value = null;
      dragMap.value = null;
      refusal.value = null;
      return;
    }
    const g = graphOf(d.base, d.keep);
    const moves = new Map<string, Pt>();
    const ids = new Map<string, string>();
    for (const id of d.ids) {
      if (!g.nodes.has(id)) continue;
      const at = nodePos(g, id);
      const to: [number, number] = [clean(at[0] + delta[0]), clean(at[1] + delta[1])];
      moves.set(id, to);
      ids.set(id, nodeIdOf(to));
    }
    const res = moveNodes(d.base, moves, editOpts(d.keep));
    if (!res.ok) {
      refusal.value = res.reason;
      return;
    }
    refusal.value = null;
    preview.value = res.walls;
    dragMap.value = ids;
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
      const splitRun = drag.runId;
      const res = splitAt(drag.base, splitRun, drag.start, editOpts(keepNow));
      if (!res.ok || !res.node) {
        endDrag();
        return;
      }
      keepNow.add(res.node);
      drag = { kind: "node", id: res.node, origin: [Number(res.node.split(",")[0]), Number(res.node.split(",")[1])], base: res.walls, keep: keepNow, release: null };
      draggedNode.value = res.node;
      focus.value = { kind: "node", id: res.node };
      picked.value = splitPick(picked.value, splitRun, res.node);
      dragMap.value = new Map([[res.node, res.node]]);
      preview.value = res.walls;
    }
    if (drag.kind === "node") dragNode(drag, point, mods);
    else if (drag.kind === "bone") dragBone(drag, point, mods);
    else {
      if (Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]) < DRAG_START) return;
      let dx = point[0] - drag.start[0];
      let dy = point[1] - drag.start[1];
      if (!mods.alt) {
        dx = Math.round(dx / GRID_STEP) * GRID_STEP;
        dy = Math.round(dy / GRID_STEP) * GRID_STEP;
      }
      groupBy(drag, [dx, dy]);
    }
  }

  /**
   * Starts moving every picked node at once without a press on the wall: the editor does this when props and lights
   * are picked with them and one gesture must carry all three.
   */
  function beginGroup(): boolean {
    if (drag || !hasSelection.value) return false;
    startDrag({ kind: "group", start: [0, 0], ids: [...picked.value.nodes], base: currentWalls(), keep: new Set(kept.value), release: null });
    return true;
  }

  /** The group's offset from where it began, already snapped by the caller. */
  function moveGroupBy(delta: Pt): void {
    if (drag?.kind === "group") groupBy(drag, delta);
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
    dragMap.value = null;
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

  /** A press that never moved: Shift takes its piece out of the selection, a plain click on a multi-selection narrows to it. */
  function applyRelease(release: Release): void {
    if (!release) return;
    if (release.kind === "reselect") {
      select(release.point, release.mods);
      return;
    }
    if (release.kind === "remove") {
      const g = graphOf(currentWalls());
      if (release.run !== undefined) picked.value = withoutRuns(g, picked.value, new Set([release.run]));
      else {
        // A node taken out takes the segments that end on it.
        const gone = new Set(release.nodes);
        const runs = new Set([...picked.value.runs].filter((id) => !id.split(">").some((n) => gone.has(n))));
        picked.value = { nodes: new Set([...picked.value.nodes].filter((id) => !gone.has(id))), runs };
      }
      focus.value = null;
      return;
    }
    picked.value = { nodes: new Set(release.nodes), runs: new Set(release.run === undefined ? [] : [release.run]) };
    multi.value = false;
    focus.value = release.focus;
  }

  function pointerUp(): void {
    const d = drag;
    if (!d) return;
    const shown = preview.value;
    const moved = dragMap.value;
    endDrag();
    if (d.kind === "middle" || !shown || shown === d.base) {
      picked.value = pickedBeforeDrag;
      applyRelease(d.release);
      return;
    }
    const through = (id: string): string => moved?.get(id) ?? id;
    const nextPicked = mapPick(picked.value, through);
    // A node that moved keeps being a node, whichever way it ends up lying.
    kept.value = new Set([...d.keep].filter((id) => d.kind !== "node" || id !== d.id).map(through));
    emit(d.base, shown);
    picked.value = nextPicked;
    settle(nextPicked.nodes);
    if (d.kind === "node") focus.value = { kind: "node", id: through(d.id) };
    else focus.value = null;
  }

  function cancel(): boolean {
    if (drag) {
      picked.value = pickedBeforeDrag;
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
    const nodeId = nodeAt(g, point, picked.value.nodes);
    if (nodeId) return toggleNode(base, nodeId);
    const hit = runAt(g, point, opts.hitTolerance());
    const run = hit && isPicked(hit.run) ? hit.run : undefined;
    if (!run) return false;
    const at = run.path ? nearestOnPath(point, run.path).foot : onStraightRun(g, run, point);
    const res = splitAt(base, run.id, at, editOpts(kept.value));
    if (!res.ok || !res.node) return false;
    kept.value = new Set([...kept.value, res.node]);
    picked.value = splitPick(picked.value, run.id, res.node);
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

  /**
   * Del: a node picked on its own is taken out and its two bones become one wall; otherwise every picked segment goes,
   * with its doors, in one step. Returns whether anything changed.
   */
  function deleteSelection(): boolean {
    if (drag || !hasSelection.value) return false;
    const base = currentWalls();
    const f = focus.value;
    if (f?.kind === "node") {
      const res = removeNode(base, f.id, editOpts(kept.value));
      if (!res.ok) {
        refusal.value = res.reason;
        return false;
      }
      const stillKept = new Set(kept.value);
      stillKept.delete(f.id);
      kept.value = stillKept;
      emit(base, res.walls);
      picked.value = mergedPick(picked.value, f.id);
      focus.value = null;
      settle();
      return true;
    }
    const runs = selection.value.runs;
    if (runs.length > 0) {
      const next: WallMap = { ...base };
      for (const run of runs) for (const s of run.segments) delete next[s.key];
      emit(base, next);
      clearSelection();
      return true;
    }
    // Lone nodes (a marquee that caught corners but no whole segment): each is joined through where it can be.
    let walls = base;
    for (const id of picked.value.nodes) {
      const res = removeNode(walls, id, editOpts(kept.value));
      if (res.ok) walls = res.walls;
      else refusal.value = res.reason;
    }
    if (walls === base) return false;
    emit(base, walls);
    clearSelection();
    return true;
  }

  /** Whether `point` is on a picked node or a picked segment: a press there drags the selection rather than picking. */
  function pickedPieceAt(point: Pt): boolean {
    const g = graphOf(currentWalls());
    if (nodeAt(g, point, picked.value.nodes)) return true;
    const hit = runAt(g, point, opts.hitTolerance());
    return hit !== undefined && isPicked(hit.run);
  }

  /** Nodes of the stored walls inside the rectangle (cells), for the marquee. */
  function nodesInRect(rect: WallRect): string[] {
    const [x0, x1] = [Math.min(rect.x0, rect.x1), Math.max(rect.x0, rect.x1)];
    const [y0, y1] = [Math.min(rect.y0, rect.y1), Math.max(rect.y0, rect.y1)];
    // Only nodes that end a run: the straight points along a lattice wall are not handles.
    const g = graphOf(currentWalls());
    const ends = new Set(g.runs.flatMap((r) => [r.a, r.b]));
    return [...ends].map((id) => g.nodes.get(id)!).filter((n) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1).map((n) => n.id);
  }

  /** The marquee's result: the nodes inside and the segments between them, replacing the pick or with `additive` joining it. */
  function pickNodes(ids: readonly string[], additive: boolean): void {
    const inside = new Set(ids);
    const runs = graphOf(currentWalls()).runs.filter((r) => inside.has(r.a) && inside.has(r.b)).map((r) => r.id);
    const nodes = additive ? new Set([...picked.value.nodes, ...ids]) : inside;
    picked.value = { nodes, runs: new Set(additive ? [...picked.value.runs, ...runs] : runs) };
    multi.value = nodes.size > 1;
    focus.value = !additive && nodes.size === 1 ? { kind: "node", id: [...nodes][0] } : null;
    if (!additive) kept.value = new Set();
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
    /** The picked wall pieces: segments (bones), nodes and the counts for the slip. */
    selection,
    hasSelection,
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
    nodesInRect,
    pickNodes,
    pickedPieceAt,
    beginGroup,
    moveGroupBy,
  };
}
