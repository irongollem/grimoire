// The straight pieces every reader of the walls shares (#1125, curved walls). An angled wall is stored as a segment, but
// where two angled walls meet at a smooth node (see `WallEdge.smoothA`) the wall curves through the node, so the line
// that is drawn, blocks sight, closes a room and clips the floor is a smooth curve, not the chord. This module samples
// every such curve once into short straight pieces; sight, light, room faces, floor clipping, the live snapshot and
// hit-testing all read the pieces, so none of them is left on the chord.
//
// A chain of smooth nodes is a centripetal Catmull-Rom spline through the chain's nodes (it does not overshoot or loop
// on uneven spacing); the chain ends at the first corner, and a closed loop of smooth nodes is a closed curve (a round
// room). Each piece keeps its wall's id plus a sub-index, so a door or any per-wall state still resolves.

import type { WallEdge } from "@/types/dungeonMap.types";
import { isLatticeKey } from "@/cartographer/wallGraph";
import { dist, nodeIdOf, type Pt } from "@/cartographer/wallEdit/geometry";

export type WallMap = Record<string, WallEdge>;

/** One straight piece of a wall's drawn line. */
export interface WallPiece {
  /** `<wall id>` for a wall of one piece, `<wall id>#<sub>` for a sampled curve. Resolve it with `wallIdOfPiece`. */
  id: string;
  wall: string;
  sub: number;
  a: [number, number];
  b: [number, number];
}

/** The drawn line of one angled wall. */
export interface WallLine {
  /** Its pieces from the wall's `a` to its `b`. */
  pieces: WallPiece[];
  /** The same line in the direction of its chain of smooth nodes, so a texture can run on from one wall to the next. */
  path: [number, number][];
  /** Cells of the chain walked before `path` starts. */
  offset: number;
  /** Whether the chain ends at the start / end of `path` (a corner, a dead end, a door): the ribbon is capped there. */
  capStart: boolean;
  capEnd: boolean;
}

export interface WallGeometry {
  /** Every angled wall's line by wall id (lattice walls are their own straight segment and are not listed). */
  lines: ReadonlyMap<string, WallLine>;
  /** Ids of the smooth nodes. */
  smooth: ReadonlySet<string>;
}

const isDoorType = (w: WallEdge): boolean => w.type === "doorClosed" || w.type === "doorOpen";
const SEP = "#";

export const pieceIdOf = (wall: string, sub: number, count: number): string => (count > 1 ? `${wall}${SEP}${sub}` : wall);

/** The wall a piece belongs to (a piece of a one-piece wall is named by the wall itself). */
export const wallIdOfPiece = (id: string): string => id.split(SEP)[0];

interface Ending {
  key: string;
  /** Which end of the wall is at the node. */
  end: "a" | "b";
}

function endings(walls: WallMap): Map<string, Ending[]> {
  const at = new Map<string, Ending[]>();
  for (const [key, wall] of Object.entries(walls)) {
    const from = nodeIdOf(wall.a);
    const to = nodeIdOf(wall.b);
    if (from === to) continue;
    for (const [node, end] of [[from, "a"], [to, "b"]] as const) {
      const list = at.get(node);
      if (list) list.push({ key, end });
      else at.set(node, [{ key, end }]);
    }
  }
  return at;
}

const flagged = (wall: WallEdge, end: "a" | "b"): boolean => (end === "a" ? wall.smoothA : wall.smoothB) === true;

/** Whether the node with these endings is smooth: two angled walls, neither a door, both asking for it there. */
function smoothAt(walls: WallMap, list: readonly Ending[]): boolean {
  return (
    list.length === 2 &&
    list.every((e) => !isLatticeKey(e.key) && !isDoorType(walls[e.key]) && flagged(walls[e.key], e.end)) &&
    list[0].key !== list[1].key
  );
}

/** The ids of the smooth nodes of `walls`. */
export function smoothNodeIds(walls: WallMap): Set<string> {
  const out = new Set<string>();
  for (const [node, list] of endings(walls)) if (smoothAt(walls, list)) out.add(node);
  return out;
}

/** The point at parameter `t` of the centripetal Catmull-Rom segment p1-p2 (Barry-Goldman), t in 0..1. */
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): [number, number] {
  const knot = (p: Pt, q: Pt): number => Math.max(Math.sqrt(dist(p, q)), 1e-6);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (p: Pt, q: Pt, ta: number, tb: number): [number, number] => {
    const w = (t - ta) / (tb - ta);
    return [p[0] * (1 - w) + q[0] * w, p[1] * (1 - w) + q[1] * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Samples per cell of chord: a radius-4 circle in a few nodes reads round at editor zoom. */
const SAMPLES_PER_CELL = 6;
const MIN_SAMPLES = 4;
const MAX_SAMPLES = 32;

/** The curve from nodes[i] to nodes[i+1], endpoints included. `closed` wraps the neighbours round; an open end reflects. */
function sampleSpan(nodes: readonly Pt[], i: number, closed: boolean): [number, number][] {
  const n = nodes.length;
  const at = (k: number): Pt => {
    if (closed) return nodes[((k % n) + n) % n];
    if (k < 0) return [2 * nodes[0][0] - nodes[1][0], 2 * nodes[0][1] - nodes[1][1]];
    if (k >= n) return [2 * nodes[n - 1][0] - nodes[n - 2][0], 2 * nodes[n - 1][1] - nodes[n - 2][1]];
    return nodes[k];
  };
  const p1 = at(i);
  const p2 = at(i + 1);
  const count = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.ceil(dist(p1, p2) * SAMPLES_PER_CELL)));
  const out: [number, number][] = [[p1[0], p1[1]]];
  for (let s = 1; s < count; s++) out.push(catmullRom(at(i - 1), p1, p2, at(i + 2), s / count));
  out.push([p2[0], p2[1]]);
  return out;
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

function piecesOf(key: string, line: readonly Pt[]): WallPiece[] {
  const count = line.length - 1;
  const out: WallPiece[] = [];
  for (let s = 0; s < count; s++) {
    out.push({
      id: pieceIdOf(key, s, count),
      wall: key,
      sub: s,
      a: [round(line[s][0]), round(line[s][1])],
      b: [round(line[s + 1][0]), round(line[s + 1][1])],
    });
  }
  return out;
}

/** The drawn lines of every angled wall of `walls`. */
export function computeWallGeometry(walls: WallMap): WallGeometry {
  const at = endings(walls);
  const smooth = new Set<string>();
  for (const [node, list] of at) if (smoothAt(walls, list)) smooth.add(node);

  const lines = new Map<string, WallLine>();
  const nodeOf = (key: string, end: "a" | "b"): string => nodeIdOf(end === "a" ? walls[key].a : walls[key].b);
  const farEnd = (key: string, node: string): { node: string; end: "a" | "b" } =>
    nodeOf(key, "a") === node ? { node: nodeOf(key, "b"), end: "b" } : { node: nodeOf(key, "a"), end: "a" };
  /** The other wall at a smooth node. */
  const partner = (key: string, node: string): string => at.get(node)!.find((e) => e.key !== key)!.key;

  for (const key of Object.keys(walls)) {
    if (isLatticeKey(key) || lines.has(key)) continue;
    const wall = walls[key];
    if (nodeOf(key, "a") === nodeOf(key, "b")) continue;

    // Walk back from this wall to the start of its chain (or round to itself, for a closed loop).
    let first = key;
    let firstNode = nodeOf(key, "a");
    let closed = false;
    while (smooth.has(firstNode)) {
      const prev = partner(first, firstNode);
      if (prev === key) {
        closed = true;
        break;
      }
      first = prev;
      firstNode = farEnd(prev, firstNode).node;
    }
    if (closed) {
      first = key;
      firstNode = nodeOf(key, "a");
    }

    // Walk forward collecting the chain: nodes in order, and for each wall which of its ends it is entered by.
    const chain: { key: string; entered: "a" | "b" }[] = [];
    const nodes: Pt[] = [];
    let curKey = first;
    let curNode = firstNode;
    for (;;) {
      const w = walls[curKey];
      const entered = nodeOf(curKey, "a") === curNode ? "a" : "b";
      chain.push({ key: curKey, entered });
      nodes.push(entered === "a" ? w.a : w.b);
      const next = farEnd(curKey, curNode);
      curNode = next.node;
      if (!smooth.has(curNode)) {
        nodes.push(next.end === "a" ? w.a : w.b);
        break;
      }
      const following = partner(curKey, curNode);
      if (following === first) break; // closed: back at the start
      curKey = following;
    }
    const isClosed = closed;
    const spans = chain.length;
    // A closed chain's node list wraps: nodes[spans] would repeat nodes[0].
    const control = isClosed ? nodes.slice(0, spans) : nodes;

    let walked = 0;
    chain.forEach(({ key: k, entered }, i) => {
      const curved = smooth.has(nodeIdOf(control[i])) || smooth.has(nodeIdOf(control[(i + 1) % control.length]));
      let path: [number, number][];
      if (control.length < 2) path = [[...walls[k].a], [...walls[k].b]];
      else if (!curved && !isClosed) path = [[control[i][0], control[i][1]], [control[i + 1][0], control[i + 1][1]]];
      else path = sampleSpan(control, i, isClosed);
      let length = 0;
      for (let s = 0; s + 1 < path.length; s++) length += dist(path[s], path[s + 1]);
      // Pieces run from the wall's own `a` to `b`, which is the path reversed when the chain enters it by `b`.
      const forward = entered === "a" ? path : [...path].reverse();
      lines.set(k, {
        pieces: piecesOf(k, forward),
        path: path.map((p): [number, number] => [round(p[0]), round(p[1])]),
        offset: walked,
        capStart: !isClosed && i === 0,
        capEnd: !isClosed && i === spans - 1,
      });
      walked += length;
    });
    if (!lines.has(key)) {
      // Defensive: a wall the walk did not reach is drawn straight.
      lines.set(key, { pieces: piecesOf(key, [wall.a, wall.b]), path: [[...wall.a], [...wall.b]], offset: 0, capStart: true, capEnd: true });
    }
  }
  return { lines, smooth };
}

type Cached = { keys: string[]; values: WallEdge[]; geometry: WallGeometry };
const cache = new WeakMap<object, Cached>();

/**
 * The geometry of `walls`, kept per record. Some tools add a wall to the record in place, so a hit is also checked
 * against the walls it was made from (one reference compare per wall) rather than trusted on the record alone.
 */
export function cachedWallGeometry(walls: WallMap): WallGeometry {
  const keys = Object.keys(walls);
  const hit = cache.get(walls);
  if (hit && hit.keys.length === keys.length && keys.every((k, i) => hit.keys[i] === k && hit.values[i] === walls[k])) return hit.geometry;
  const geometry = computeWallGeometry(walls);
  cache.set(walls, { keys, values: keys.map((k) => walls[k]), geometry });
  return geometry;
}

/** The geometry of a walls record, cached: the entry point other modules import. */
export const wallGeometry = cachedWallGeometry;

/** The straight pieces of an angled wall (its chord, for a wall that is not curved). */
export function piecesOfWall(walls: WallMap, key: string): readonly WallPiece[] {
  return cachedWallGeometry(walls).lines.get(key)?.pieces ?? [];
}

/** The line of an angled wall as points, from its `a` to its `b`. */
export function lineOfWall(walls: WallMap, key: string): [number, number][] {
  const pieces = piecesOfWall(walls, key);
  if (pieces.length === 0) return [];
  return [pieces[0].a, ...pieces.map((p) => p.b)];
}

/**
 * `walls` with every angled wall replaced by its pieces, each a plain wall of the same fields. What a room is found
 * from, so a curved wall closes its room along the curve.
 */
export function wallsAsPieces(walls: WallMap): WallMap {
  const geometry = cachedWallGeometry(walls);
  const out: WallMap = {};
  for (const [key, wall] of Object.entries(walls)) {
    const line = geometry.lines.get(key);
    if (!line || line.pieces.length === 1) {
      out[key] = wall;
      continue;
    }
    const { smoothA: _a, smoothB: _b, ...rest } = wall;
    for (const piece of line.pieces) out[piece.id] = { ...rest, a: piece.a, b: piece.b };
  }
  return out;
}
