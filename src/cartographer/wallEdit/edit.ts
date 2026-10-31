// Edits to the wall node graph (epic #1125, canvas frame 17). Each one takes the Drawing's `layers.walls` and returns the
// new record or a refusal; the caller makes one undo step of it. A run keeps its doors at the same fraction of its length
// when its ends move, a segment off the grid gets a uuid key, and one landing back on the grid gets lattice keys again.

import type { WallEdge } from "@/types/dungeonMap.types";
import { buildGraph, nodePos, type Run, type WallGraph, type WallMap } from "./graph";
import { cleanPt, lerp, meet, nodeIdOf, projectOnSegment, samePt, WELD, type Pt } from "./geometry";

export type EditRefusal =
  | "unknown-node" //     no such node in the walls
  | "unknown-run" //      no such run
  | "collapsed" //        the edit would shrink a wall to a point
  | "overlap" //          the edit would lay a wall on top of another
  | "not-two-bones" //    removeNode: the node is not where exactly two walls meet (a T, a dead end, a crossing)
  | "at-end" //           splitAt: the point is an end of the run
  | "off-run"; //         splitAt: the point is not on the run

export type EditResult = { ok: true; walls: WallMap } | { ok: false; reason: EditRefusal };

export interface EditOptions {
  /** Keys for new angled segments. Defaults to `crypto.randomUUID`. */
  newKey?: () => string;
  /** Nodes the UI shows although they are straight degree-2 points; they stay run ends while moving or removing. */
  keepNodes?: ReadonlySet<string>;
}

const FIELDS = ["type", "pack_id", "pack_version", "variant", "rotation", "decal", "visible"] as const;
const sameFields = (p: WallEdge, q: WallEdge): boolean => FIELDS.every((f) => p[f] === q[f]);
const fieldsOf = (w: WallEdge): Omit<WallEdge, "a" | "b"> => {
  const { a: _a, b: _b, ...rest } = w;
  return rest;
};

/** A stretch of a run with one set of fields, between fractions t0 and t1 of the run's length. */
interface Piece {
  t0: number;
  t1: number;
  wall: WallEdge;
  /** Keys it was stored under, so an angled piece keeps its identity when it only moves. */
  keys: string[];
}

function piecesOf(run: Run): Piece[] {
  const out: Piece[] = [];
  for (const s of run.segments) {
    const last = out[out.length - 1];
    if (last && sameFields(last.wall, s.wall)) {
      last.t1 = s.t1;
      last.keys.push(s.key);
    } else out.push({ t0: s.t0, t1: s.t1, wall: s.wall, keys: [s.key] });
  }
  return out;
}

const isUuid = (key: string): boolean => !key.includes(":");
const onGrid = (p: Pt): boolean => p[0] === Math.round(p[0]) && p[1] === Math.round(p[1]);

/** Lay `pieces` on the line a-b and write them into `into`, as lattice unit segments where they sit on a grid line. */
function lay(into: WallMap, pieces: Piece[], a: Pt, b: Pt, used: Set<string>, newKey: () => string): EditRefusal | undefined {
  for (const piece of pieces) {
    const p0 = cleanPt(lerp(a, b, piece.t0));
    const p1 = cleanPt(lerp(a, b, piece.t1));
    if (samePt(p0, p1)) continue;
    const fields = fieldsOf(piece.wall);
    const axisH = p0[1] === p1[1];
    const axisV = p0[0] === p1[0];
    if (onGrid(p0) && onGrid(p1) && (axisH || axisV)) {
      const lo = axisH ? Math.min(p0[0], p1[0]) : Math.min(p0[1], p1[1]);
      const hi = axisH ? Math.max(p0[0], p1[0]) : Math.max(p0[1], p1[1]);
      for (let i = lo; i < hi; i++) {
        const key = axisH ? `${i},${p0[1]}:N` : `${p0[0]},${i}:W`;
        if (used.has(key)) return "overlap";
        const ua: [number, number] = axisH ? [i, p0[1]] : [p0[0], i];
        const ub: [number, number] = axisH ? [i + 1, p0[1]] : [p0[0], i + 1];
        into[key] = { ...fields, a: ua, b: ub };
        used.add(key);
      }
    } else {
      const reuse = piece.keys.find((k) => isUuid(k) && !used.has(k));
      const key = reuse ?? newKey();
      used.add(key);
      into[key] = { ...fields, a: [...p0], b: [...p1] };
    }
  }
  return undefined;
}

/** Splits segment `key` at `point` (interior to it) into two angled halves with the same fields. */
function splitSegment(walls: WallMap, key: string, point: Pt, newKey: () => string): [string, string] {
  const w = walls[key];
  const fields = fieldsOf(w);
  const p = cleanPt(point);
  delete walls[key];
  const k1 = isUuid(key) ? key : newKey();
  const k2 = newKey();
  walls[k1] = { ...fields, a: [...w.a], b: [...p] };
  walls[k2] = { ...fields, a: [...p], b: [...w.b] };
  return [k1, k2];
}

/**
 * Makes `walls` planar around the segments in `focus`: wherever one crosses another, or ends inside another, both are
 * split there, so a node exists at every meeting. Refuses when a focus segment would lie along another.
 */
function planarize(walls: WallMap, focus: Set<string>, newKey: () => string): EditRefusal | undefined {
  for (let guard = 0; guard < 10000; guard++) {
    let changed = false;
    outer: for (const f of focus) {
      const fw = walls[f];
      if (!fw) continue;
      for (const o of Object.keys(walls)) {
        if (o === f) continue;
        const ow = walls[o];
        const m = meet(fw.a, fw.b, ow.a, ow.b);
        if (m.kind === "none") continue;
        if (m.kind === "overlap") return "overlap";
        if (m.kind === "cross" || m.kind === "touch-ab") {
          const [h1, h2] = splitSegment(walls, f, m.point, newKey);
          focus.delete(f);
          focus.add(h1);
          focus.add(h2);
        }
        if (m.kind === "cross" || m.kind === "touch-cd") {
          const [h1, h2] = splitSegment(walls, o, m.point, newKey);
          if (focus.has(o)) {
            focus.delete(o);
            focus.add(h1);
            focus.add(h2);
          }
        }
        changed = true;
        break outer;
      }
    }
    if (!changed) return undefined;
  }
  return undefined;
}

const keyMaker = (opts: EditOptions): (() => string) => opts.newKey ?? (() => crypto.randomUUID());

function graphFor(walls: WallMap, extra: Iterable<string>, opts: EditOptions): WallGraph {
  return buildGraph(walls, { breakAt: new Set([...(opts.keepNodes ?? []), ...extra]) });
}

/**
 * Moves nodes to new positions. Every run ending at a moved node stretches, and its doors keep their fraction of the
 * run. The result is split wherever a moved wall now crosses or touches another, so welding onto a wall is just moving
 * the node onto it.
 */
export function moveNodes(walls: WallMap, moves: ReadonlyMap<string, Pt>, opts: EditOptions = {}): EditResult {
  const newKey = keyMaker(opts);
  const graph = graphFor(walls, moves.keys(), opts);
  for (const id of moves.keys()) if (!graph.nodes.has(id)) return { ok: false, reason: "unknown-node" };
  const target = (id: string): [number, number] => {
    const to = moves.get(id);
    return to ? cleanPt(to) : nodePos(graph, id);
  };
  const runs = graph.runs.filter((r) => moves.has(r.a) || moves.has(r.b));
  const next: WallMap = { ...walls };
  const used = new Set(Object.keys(walls));
  for (const run of runs) {
    for (const s of run.segments) {
      delete next[s.key];
      used.delete(s.key);
    }
  }
  const laid: WallMap = {};
  for (const run of runs) {
    const a = target(run.a);
    const b = target(run.b);
    if (samePt(a, b)) return { ok: false, reason: "collapsed" };
    const refused = lay(laid, piecesOf(run), a, b, used, newKey);
    if (refused) return { ok: false, reason: refused };
  }
  Object.assign(next, laid);
  const refusal = planarize(next, new Set(Object.keys(laid)), newKey);
  return refusal ? { ok: false, reason: refusal } : { ok: true, walls: next };
}

export const moveNode = (walls: WallMap, node: string, to: Pt, opts: EditOptions = {}): EditResult =>
  moveNodes(walls, new Map([[node, to]]), opts);

/** Slides a run sideways by `delta`: both its nodes move, and walls meeting it stretch to follow. */
export function moveBone(walls: WallMap, runId: string, delta: Pt, opts: EditOptions = {}): EditResult {
  const run = buildGraph(walls, { breakAt: opts.keepNodes }).runs.find((r) => r.id === runId);
  if (!run) return { ok: false, reason: "unknown-run" };
  const g = buildGraph(walls);
  const shift = (id: string): Pt => {
    const p = nodePos(g, id);
    return [p[0] + delta[0], p[1] + delta[1]];
  };
  return moveNodes(walls, new Map([[run.a, shift(run.a)], [run.b, shift(run.b)]]), opts);
}

/** Removes the run and every wall and door on it. */
export function deleteBone(walls: WallMap, runId: string, opts: EditOptions = {}): EditResult {
  const run = buildGraph(walls, { breakAt: opts.keepNodes }).runs.find((r) => r.id === runId);
  if (!run) return { ok: false, reason: "unknown-run" };
  const next: WallMap = { ...walls };
  for (const s of run.segments) delete next[s.key];
  return { ok: true, walls: next };
}

/**
 * Adds a node on a run at the point nearest `point` (a bend, once it is moved). Splits the segment there when the point
 * falls inside one. Returns the node's id; the UI adds it to `keepNodes` so it stays a node while it is straight.
 */
export function splitAt(
  walls: WallMap,
  runId: string,
  point: Pt,
  opts: EditOptions = {},
): EditResult & { node?: string } {
  const g = buildGraph(walls, { breakAt: opts.keepNodes });
  const run = g.runs.find((r) => r.id === runId);
  if (!run) return { ok: false, reason: "unknown-run" };
  const hit = projectOnSegment(point, nodePos(g, run.a), nodePos(g, run.b));
  const foot = cleanPt(hit.foot);
  if (samePt(foot, nodePos(g, run.a)) || samePt(foot, nodePos(g, run.b))) return { ok: false, reason: "at-end" };
  const next: WallMap = { ...walls };
  const seg = run.segments.find((s) => {
    const w = walls[s.key];
    return !samePt(foot, w.a) && !samePt(foot, w.b) && projectOnSegment(foot, w.a, w.b).dist < WELD;
  });
  if (seg) splitSegment(next, seg.key, foot, keyMaker(opts));
  return { ok: true, walls: next, node: nodeIdOf(foot) };
}

/**
 * Removes a node where exactly two walls meet and joins them into one straight wall between their far ends. Doors on
 * either keep their fraction of the combined length. Refuses at a T, a crossing or a dead end.
 */
export function removeNode(walls: WallMap, node: string, opts: EditOptions = {}): EditResult {
  const newKey = keyMaker(opts);
  const g = graphFor(walls, [node], opts);
  if (!g.nodes.has(node)) return { ok: false, reason: "unknown-node" };
  const runs = g.runs.filter((r) => r.a === node || r.b === node);
  if (runs.length !== 2) return { ok: false, reason: "not-two-bones" };
  const [r1, r2] = runs;
  const far1 = r1.a === node ? r1.b : r1.a;
  const far2 = r2.a === node ? r2.b : r2.a;
  const a = nodePos(g, far1);
  const b = nodePos(g, far2);
  if (samePt(a, b)) return { ok: false, reason: "collapsed" };
  // Pieces measured along a run from its far end toward the node (0 at the far end).
  const towardNode = (run: Run, far: string): Piece[] =>
    piecesOf(run)
      .map((p) => (far === run.a ? p : { ...p, t0: 1 - p.t1, t1: 1 - p.t0 }))
      .sort((p, q) => p.t0 - q.t0);
  const total = r1.length + r2.length;
  const merged: Piece[] = [
    ...towardNode(r1, far1).map((p) => ({ ...p, t0: (p.t0 * r1.length) / total, t1: (p.t1 * r1.length) / total })),
    // The second run is read from the node out to its far end, so flip it back before scaling.
    ...towardNode(r2, far2)
      .map((p) => ({ ...p, t0: 1 - p.t1, t1: 1 - p.t0 }))
      .reverse()
      .map((p) => ({ ...p, t0: (r1.length + p.t0 * r2.length) / total, t1: (r1.length + p.t1 * r2.length) / total })),
  ];
  const next: WallMap = { ...walls };
  const used = new Set(Object.keys(walls));
  for (const run of runs) {
    for (const s of run.segments) {
      delete next[s.key];
      used.delete(s.key);
    }
  }
  const laid: WallMap = {};
  const refused = lay(laid, merged, a, b, used, newKey);
  if (refused) return { ok: false, reason: refused };
  Object.assign(next, laid);
  const refusal = planarize(next, new Set(Object.keys(laid)), newKey);
  return refusal ? { ok: false, reason: refusal } : { ok: true, walls: next };
}
