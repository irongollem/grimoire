// The Drawing's walls as a node graph with runs (epic #1125, canvas frame 17). A node is a point where segments meet or
// end; a run (a "bone" in the UI) is the maximal straight chain of segments through degree-2 nodes, so a ten-square
// lattice wall is one run with two nodes. Pure: nothing here reads the DOM or writes the walls.

import type { WallEdge } from "@/types/dungeonMap.types";
import { dist, nodeIdOf, projectOnSegment, WELD, type Pt } from "./geometry";

export type WallMap = Record<string, WallEdge>;

export interface GraphNode {
  /** The cleaned position, `"x,y"`. */
  id: string;
  x: number;
  y: number;
  /** Keys of the segments ending here. */
  segs: string[];
}

export interface GraphSeg {
  key: string;
  wall: WallEdge;
  /** Node ids at `wall.a` and `wall.b`. */
  from: string;
  to: string;
}

export interface RunSegment {
  key: string;
  wall: WallEdge;
  /** Where this segment starts and ends along the run, 0 at `Run.a` and 1 at `Run.b`. */
  t0: number;
  t1: number;
}

export interface Run {
  /** `"<a>><b>"` of its two node ids; stable while the run's ends do not move. */
  id: string;
  /** End nodes, `a` the smaller by (x, y) so `t` has one direction. */
  a: string;
  b: string;
  length: number;
  /** Wall and door segments in order along the run. */
  segments: RunSegment[];
}

export interface WallGraph {
  nodes: Map<string, GraphNode>;
  segs: Map<string, GraphSeg>;
  runs: Run[];
  /** Run id by segment key. */
  runOf: Map<string, string>;
}

export interface GraphOptions {
  /**
   * Nodes that always end a run even where two collinear segments meet. A degree-2 straight point has no trace in the
   * stored walls, so the UI keeps the nodes it has added or is dragging here.
   */
  breakAt?: ReadonlySet<string>;
}

export function buildGraph(walls: WallMap, opts: GraphOptions = {}): WallGraph {
  const nodes = new Map<string, GraphNode>();
  const segs = new Map<string, GraphSeg>();
  const node = (p: Pt): GraphNode => {
    const id = nodeIdOf(p);
    let n = nodes.get(id);
    if (!n) {
      const [x, y] = id.split(",").map(Number);
      n = { id, x, y, segs: [] };
      nodes.set(id, n);
    }
    return n;
  };
  for (const [key, wall] of Object.entries(walls)) {
    const from = node(wall.a);
    const to = node(wall.b);
    if (from.id === to.id) continue;
    segs.set(key, { key, wall, from: from.id, to: to.id });
    from.segs.push(key);
    to.segs.push(key);
  }

  const dir = (s: GraphSeg, fromNode: string): [number, number] => {
    const f = nodes.get(fromNode)!;
    const t = nodes.get(fromNode === s.from ? s.to : s.from)!;
    const len = Math.hypot(t.x - f.x, t.y - f.y);
    return [(t.x - f.x) / len, (t.y - f.y) / len];
  };
  /** The segment continuing straight on through `at` after `via`, if `at` is a plain degree-2 straight point. */
  const continuation = (via: GraphSeg, at: string): GraphSeg | undefined => {
    const n = nodes.get(at)!;
    if (n.segs.length !== 2 || opts.breakAt?.has(at)) return undefined;
    const other = segs.get(n.segs[0] === via.key ? n.segs[1] : n.segs[0])!;
    const d1 = dir(via, at === via.to ? via.from : via.to); // heading into `at`
    const d2 = dir(other, at);
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    return Math.abs(cross) < 1e-6 && d1[0] * d2[0] + d1[1] * d2[1] > 0 ? other : undefined;
  };

  const runs: Run[] = [];
  const runOf = new Map<string, string>();
  for (const seg of segs.values()) {
    if (runOf.has(seg.key)) continue;
    // chain of [segment, node it is entered from], extended both ways.
    const chain: { seg: GraphSeg; entry: string }[] = [{ seg, entry: seg.from }];
    const seen = new Set([seg.key]);
    for (let end = seg.to, last = seg; ; ) {
      const next = continuation(last, end);
      if (!next || seen.has(next.key)) break;
      seen.add(next.key);
      chain.push({ seg: next, entry: end });
      end = next.from === end ? next.to : next.from;
      last = next;
    }
    for (let start = seg.from, first = seg; ; ) {
      const prev = continuation(first, start);
      if (!prev || seen.has(prev.key)) break;
      seen.add(prev.key);
      const entry = prev.from === start ? prev.to : prev.from;
      chain.unshift({ seg: prev, entry });
      start = entry;
      first = prev;
    }
    const exit = (c: { seg: GraphSeg; entry: string }): string => (c.seg.from === c.entry ? c.seg.to : c.seg.from);
    let startId = chain[0].entry;
    let endId = exit(chain[chain.length - 1]);
    const sn = nodes.get(startId)!;
    const en = nodes.get(endId)!;
    const reversed = sn.x > en.x || (sn.x === en.x && sn.y > en.y);
    if (reversed) {
      [startId, endId] = [endId, startId];
      chain.reverse();
    }
    const a = nodes.get(startId)!;
    const b = nodes.get(endId)!;
    const length = dist([a.x, a.y], [b.x, b.y]);
    const segments: RunSegment[] = chain.map((c) => {
      const p0 = nodes.get(c.seg.from)!;
      const p1 = nodes.get(c.seg.to)!;
      const t0 = projectOnSegment([p0.x, p0.y], [a.x, a.y], [b.x, b.y]).t;
      const t1 = projectOnSegment([p1.x, p1.y], [a.x, a.y], [b.x, b.y]).t;
      return { key: c.seg.key, wall: c.seg.wall, t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
    });
    segments.sort((p, q) => p.t0 - q.t0);
    const id = `${startId}>${endId}`;
    runs.push({ id, a: startId, b: endId, length, segments });
    for (const s of segments) runOf.set(s.key, id);
  }
  return { nodes, segs, runs, runOf };
}

export interface RunHit {
  run: Run;
  /** Position along the run, 0..1 from `run.a`. */
  t: number;
  foot: [number, number];
  dist: number;
}

/** The run nearest to `point` within `tol` cells, with where along it the point falls. */
export function runAt(graph: WallGraph, point: Pt, tol: number): RunHit | undefined {
  let best: RunHit | undefined;
  for (const run of graph.runs) {
    const a = graph.nodes.get(run.a)!;
    const b = graph.nodes.get(run.b)!;
    const hit = projectOnSegment(point, [a.x, a.y], [b.x, b.y]);
    if (hit.dist <= tol + WELD && (!best || hit.dist < best.dist)) best = { run, t: hit.t, foot: hit.foot, dist: hit.dist };
  }
  return best;
}

export const nodePos = (graph: WallGraph, id: string): [number, number] => {
  const n = graph.nodes.get(id);
  if (!n) throw new Error(`Unknown wall node ${id}`);
  return [n.x, n.y];
};
