// The round brush as a wall maker (epic #1125, wall curves): a stroke no longer stores a coverage mask, it moves or
// makes the walls of a room. Raster route, on purpose: the room's outline plus the stroke's discs are rasterised at
// `AREA_RES` per square, flooded so the stroke never crosses a wall that is not the room's own, traced with marching
// squares and fitted back to a few smooth nodes. No polygon boolean library is needed (none is installed), and a
// disc, an erase and a clip against walls are all just bits in one grid. The price is that the room's own run is
// re-fitted from the raster, so apply a stroke to the layers as they stood at pointer-down with ALL its discs, never
// segment by segment on top of the previous result (the fit would drift a little each time).

import { AREA_RES, type Disc } from "./area";
import { findFaces } from "./roomOutline";
import { cachedWallGeometry } from "./wallGeometry";
import { isLatticeKey, wallSegment } from "./wallGraph";
import { clean, dist, lerp, projectOnSegment, samePt } from "./wallEdit/geometry";
import { pointInRing } from "@/lib/locations/polygon";
import { cellKey, type CellKey, type DungeonMapLayers, type PackRef, type WallEdge } from "@/types/dungeonMap.types";

type P = [number, number];

/** How far (cells) the fitted outline may stray from the traced one: above the raster's own noise (about 0.06), so a
 *  straight edge at any angle collapses to two nodes, and a circle of radius 4 keeps about 16. */
export const FIT_TOLERANCE = 0.08;
/** A node where the outline turns by more than this is a corner (a room's square end); below it the node is smooth. */
export const CORNER_TURN_DEG = 60;
/** The raster cuts every convex or concave corner by a 45 degree step of up to this length; it is put back. */
const CUT_MAX = 0.2;
const CUT_NEIGHBOUR_MIN = 0.35;
/** A fitted node this close to a wall that is not the room's own is moved onto it, so the room closes there. */
const SNAP = 0.12;
/** A door this close to the new outline (both ends) is still on it and stays. */
const DOOR_REACH = 0.12;
const MIN_PIECE = 0.05;
const MIN_AREA = 0.05;

export interface WallMaking {
  /** Mints the id of an angled wall (a uuid in the app). */
  newKey: () => string;
  /** The pack, version and variant the walls are drawn with. */
  wall: PackRef;
}

// ── Fitting an outline to few nodes ──────────────────────────────────────

const turn = (a: P, b: P, c: P): number => {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (l === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / l))) * 180) / Math.PI;
};

function dedupe(points: readonly P[], closed: boolean): P[] {
  const out: P[] = [];
  for (const p of points) if (out.length === 0 || !samePt(out[out.length - 1], p)) out.push([p[0], p[1]]);
  if (closed && out.length > 1 && samePt(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** Drops points exactly on a straight run, so a raster edge is one long segment and its corner cuts stand out. */
function dropCollinear(points: readonly P[]): P[] {
  const n = points.length;
  return points.filter((cur, i) => {
    const prev = points[(i + n - 1) % n];
    const nxt = points[(i + 1) % n];
    const cross = (cur[0] - prev[0]) * (nxt[1] - cur[1]) - (cur[1] - prev[1]) * (nxt[0] - cur[0]);
    const dot = (cur[0] - prev[0]) * (nxt[0] - cur[0]) + (cur[1] - prev[1]) * (nxt[1] - cur[1]);
    return !(Math.abs(cross) < 1e-9 && dot > 0);
  });
}

/** Douglas-Peucker over ring[lo..hi]; marks the indices it keeps. */
function mark(ring: readonly P[], lo: number, hi: number, keep: Uint8Array): void {
  let worst = -1;
  let worstD = FIT_TOLERANCE;
  for (let i = lo + 1; i < hi; i++) {
    const d = projectOnSegment(ring[i], ring[lo], ring[hi]).dist;
    if (d > worstD) {
      worst = i;
      worstD = d;
    }
  }
  if (worst < 0) return;
  keep[worst] = 1;
  mark(ring, lo, worst, keep);
  mark(ring, worst, hi, keep);
}

function lineMeet(a: P, b: P, c: P, d: P): P | null {
  const r: P = [b[0] - a[0], b[1] - a[1]];
  const s: P = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 0.2 * Math.hypot(...r) * Math.hypot(...s)) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/** Puts back the corner the raster cut: a short edge between two long ones becomes the point their lines meet at. */
function restoreCorners(start: P[]): P[] {
  let nodes = start;
  for (let again = true; again && nodes.length >= 5; ) {
    again = false;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const p0 = nodes[(i + n - 1) % n];
      const p1 = nodes[i];
      const p2 = nodes[(i + 1) % n];
      const p3 = nodes[(i + 2) % n];
      if (dist(p1, p2) > CUT_MAX || dist(p0, p1) < CUT_NEIGHBOUR_MIN || dist(p2, p3) < CUT_NEIGHBOUR_MIN) continue;
      const x = lineMeet(p0, p1, p2, p3);
      if (!x || dist(x, lerp(p1, p2, 0.5)) > CUT_MAX) continue;
      const rest: P[] = [];
      for (let k = 2; k < n; k++) rest.push(nodes[(i + k) % n]);
      nodes = [...rest, x];
      again = true;
      break;
    }
  }
  return nodes;
}

/** A dense closed outline reduced to the nodes a hand would put: corners kept, curves to about one per square or two. */
export function fitLoop(dense: readonly P[]): P[] {
  // Corners are restored before the fit: the cut is smaller than the tolerance, so the fit alone would eat a corner.
  const pts = restoreCorners(dropCollinear(dedupe(dense, true)));
  const n = pts.length;
  if (n < 4) return n === 3 ? pts : [];
  let far = 1;
  for (let i = 2; i < n; i++) if (dist(pts[i], pts[0]) > dist(pts[far], pts[0])) far = i;
  const ring = [...pts, pts[0]];
  const keep = new Uint8Array(n + 1);
  keep[0] = 1;
  keep[far] = 1;
  mark(ring, 0, far, keep);
  mark(ring, far, n, keep);
  return pts.filter((_, i) => keep[i] === 1);
}

/** A dense open run reduced the same way; both ends stay. */
export function fitRun(dense: readonly P[]): P[] {
  const pts = dedupe(dense, false);
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  mark(pts, 0, pts.length - 1, keep);
  return pts.filter((_, i) => keep[i] === 1);
}

function emit(
  nodes: readonly P[],
  closed: boolean,
  opts: WallMaking,
  keepEdge: readonly boolean[] | undefined,
  pinned: readonly boolean[] | undefined,
): Record<string, WallEdge> {
  const n = nodes.length;
  const edges = closed ? n : n - 1;
  const kept = (i: number): boolean => i >= 0 && i < edges && (keepEdge === undefined || keepEdge[i]);
  const smoothAt = (k: number): boolean => {
    if (pinned?.[k]) return false;
    if (!closed && (k === 0 || k === n - 1)) return false;
    return turn(nodes[(k + n - 1) % n], nodes[k], nodes[(k + 1) % n]) <= CORNER_TURN_DEG;
  };
  const out: Record<string, WallEdge> = {};
  for (let i = 0; i < edges; i++) {
    if (!kept(i)) continue;
    const j = (i + 1) % n;
    const prev = closed ? (i + edges - 1) % edges : i - 1;
    const next = closed ? (i + 1) % edges : i + 1;
    const wall: WallEdge = {
      type: "wall",
      pack_id: opts.wall.pack_id,
      pack_version: opts.wall.pack_version,
      variant: opts.wall.variant,
      a: [clean(nodes[i][0]), clean(nodes[i][1])],
      b: [clean(nodes[j][0]), clean(nodes[j][1])],
    };
    if (kept(prev) && smoothAt(i)) wall.smoothA = true;
    if (kept(next) && smoothAt(j)) wall.smoothB = true;
    out[opts.newKey()] = wall;
  }
  return out;
}

/** The ring a closed outline's walls are drawn along: the curve pieces of each kept edge, the chord of a dropped one. */
function curveRing(nodes: readonly P[], keepEdge: readonly boolean[], emitted: Record<string, WallEdge>): P[] {
  const geometry = cachedWallGeometry(emitted);
  const keys = Object.keys(emitted);
  const ring: P[] = [];
  let k = 0;
  nodes.forEach((p, i) => {
    const pieces = keepEdge[i] ? geometry.lines.get(keys[k++])?.pieces : undefined;
    if (!pieces || pieces.length === 0) ring.push([p[0], p[1]]);
    else for (const piece of pieces) ring.push([piece.a[0], piece.a[1]]);
  });
  return ring;
}

/** A closed outline as angled walls, every node smooth unless it is a corner (a turn over `CORNER_TURN_DEG`). */
export function outlineToWalls(loop: readonly P[], opts: WallMaking): Record<string, WallEdge> {
  const nodes = fitLoop(loop);
  return nodes.length < 3 ? {} : emit(nodes, true, opts, undefined, undefined);
}

/** An open stretch of outline as angled walls; its two ends are corners. */
export function runToWalls(points: readonly P[], opts: WallMaking): Record<string, WallEdge> {
  const nodes = fitRun(points);
  return nodes.length < 2 ? {} : emit(nodes, false, opts, undefined, undefined);
}

// ── Raster ───────────────────────────────────────────────────────────────

interface Grid {
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const sx = (g: Grid, i: number): number => g.ox + (i + 0.5) / AREA_RES;
const sy = (g: Grid, j: number): number => g.oy + (j + 0.5) / AREA_RES;

/** Calls `visit` for every sample whose centre is inside the ring (even-odd, by scanline). */
function fillRing(g: Grid, ring: readonly P[], visit: (idx: number) => void): void {
  const n = ring.length;
  for (let j = 0; j < g.h; j++) {
    const y = sy(g, j);
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % n];
      if (a[1] <= y !== b[1] <= y) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - g.ox) * AREA_RES - 0.5));
      const i1 = Math.min(g.w - 1, Math.ceil((xs[k + 1] - g.ox) * AREA_RES - 0.5) - 1);
      for (let i = i0; i <= i1; i++) visit(j * g.w + i);
    }
  }
}

/**
 * Marching squares over the sample grid: contour at the midpoints between samples, so a full-square edge lies exactly
 * on the grid line. Returns every closed loop (outer rings and holes alike), in cell units.
 */
function traceField(g: Grid, field: Uint8Array): P[][] {
  const { w, h } = g;
  const hId = (i: number, j: number): number => (j * w + i) * 2;
  const vId = (i: number, j: number): number => (j * w + i) * 2 + 1;
  const next = new Map<number, number>();
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const c = [field[j * w + i], field[j * w + i + 1], field[(j + 1) * w + i + 1], field[(j + 1) * w + i]];
      const count = c[0] + c[1] + c[2] + c[3];
      if (count === 0 || count === 4) continue;
      const mid = [hId(i, j), vId(i + 1, j), hId(i, j + 1), vId(i, j)]; // T R B L
      const around = (k: number): [number, number] => [mid[(k + 3) % 4], mid[k]]; // covered corner on the left
      const link = ([a, b]: [number, number]): void => void next.set(a, b);
      if (count === 1) link(around(c.indexOf(1)));
      else if (count === 3) {
        const [a, b] = around(c.indexOf(0));
        link([b, a]);
      } else if (c[0] === c[2]) {
        link(around(c[0] ? 0 : 1));
        link(around(c[0] ? 2 : 3));
      } else if (c[0] === c[1]) link(c[0] ? [mid[3], mid[1]] : [mid[1], mid[3]]);
      else link(c[1] ? [mid[0], mid[2]] : [mid[2], mid[0]]);
    }
  }
  const at = (id: number): P => {
    const cell = id >> 1;
    const i = cell % w;
    const j = Math.floor(cell / w);
    return id & 1 ? [g.ox + (i + 0.5) / AREA_RES, g.oy + (j + 1) / AREA_RES] : [g.ox + (i + 1) / AREA_RES, g.oy + (j + 0.5) / AREA_RES];
  };
  const seen = new Set<number>();
  const loops: P[][] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: P[] = [];
    let id: number | undefined = start;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      loop.push(at(id));
      id = next.get(id);
    }
    if (id === start && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

const area = (ring: readonly P[]): number => {
  let twice = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    twice += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(twice) / 2;
};

function crossing(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 !== d2 && d3 !== d4;
}

// ── Walls as the stroke meets them ───────────────────────────────────────

interface Piece {
  key: string;
  a: P;
  b: P;
}

function piecesOf(layers: DungeonMapLayers, key: string): Piece[] {
  const wall = layers.walls[key];
  if (isLatticeKey(key)) {
    const s = wallSegment(key, wall);
    return [{ key, a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]] }];
  }
  const line = cachedWallGeometry(layers.walls).lines.get(key);
  if (!line || line.pieces.length === 0) return [{ key, a: [wall.a[0], wall.a[1]], b: [wall.b[0], wall.b[1]] }];
  return line.pieces.map((p) => ({ key, a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]] }));
}

const isDoorLike = (w: WallEdge): boolean => w.type !== "wall";

export interface BrushStroke {
  /** The stroke's discs in order; the first one says where it started. */
  discs: readonly Disc[];
}

export interface BrushOptions extends WallMaking {
  /** Alt: carve floor out instead of growing. */
  erase: boolean;
  /** The floor the stroke lays (an existing square keeps the floor it has). */
  pack: PackRef;
}

/**
 * Applies one brush stroke. Rules (the maintainer's, 1 Nov 2026): the brush never removes a wall; a stroke that starts
 * in a room grows that room, its own wall moving out to the new edge, and stops at any other room's wall; Alt carves
 * and the wall follows; a stroke on empty ground makes a new room. A room's own wall is a wall on its outline with
 * nothing but void on the other side. Doors and fittings on that run stay where they still lie on the new outline
 * (the new wall is cut around them, and one that is no longer on a straight wall is re-seated onto it) and go with
 * the wall when the outline has moved away from them. The room's whole run is re-fitted, not just the stretch the
 * stroke touched. Returns the same object when the stroke changed nothing.
 */
export function applyBrushStroke(layers: DungeonMapLayers, stroke: BrushStroke, opts: BrushOptions): DungeonMapLayers {
  const { discs } = stroke;
  if (discs.length === 0) return layers;
  const faces = findFaces(layers)
    .map((f) => ({ ...f, size: area(f.outline) }))
    .sort((p, q) => p.size - q.size);
  const origin = discs[0];
  // Growing starts where the stroke starts. Carving acts on the first room the stroke's path enters, so a straight cut
  // that begins in an already carved gap (Shift+Alt from where the last carve ended) still cuts the room it crosses.
  const entering = opts.erase ? discs.find((d) => faces.some((f) => pointInRing(d.x, d.y, f.outline))) : undefined;
  const startAt = entering === undefined ? origin : entering;
  const startFace = faces.findIndex((f) => pointInRing(startAt.x, startAt.y, f.outline));

  // Window: the room and the discs, one square of margin.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const d of discs) {
    take(d.x - d.r, d.y - d.r);
    take(d.x + d.r, d.y + d.r);
  }
  if (startFace >= 0) for (const p of faces[startFace].outline) take(p[0], p[1]);
  const g: Grid = {
    ox: Math.floor(minX) - 1,
    oy: Math.floor(minY) - 1,
    w: (Math.ceil(maxX) + 1 - (Math.floor(minX) - 1)) * AREA_RES,
    h: (Math.ceil(maxY) + 1 - (Math.floor(minY) - 1)) * AREA_RES,
  };
  const total = g.w * g.h;

  // Who owns each sample: the smallest face around it.
  const owner = new Int32Array(total).fill(-1);
  for (let f = faces.length - 1; f >= 0; f--) {
    fillRing(g, faces[f].outline, (idx) => {
      owner[idx] = f;
    });
  }
  const room = new Uint8Array(total);
  if (startFace >= 0) fillRing(g, faces[startFace].outline, (idx) => void (room[idx] = 1));

  // Walls: the room's own run, and everything else (which the stroke may not cross and the new outline joins).
  const faceAt = (x: number, y: number): number => faces.findIndex((f) => pointInRing(x, y, f.outline));
  const ownKeys = new Set<string>();
  const foreign: Piece[] = [];
  for (const key of Object.keys(layers.walls)) {
    const pieces = piecesOf(layers, key);
    let own = false;
    if (startFace >= 0) {
      const p = pieces[Math.floor(pieces.length / 2)];
      const len = dist(p.a, p.b);
      if (len > 0) {
        const m = lerp(p.a, p.b, 0.5);
        const nx = (-(p.b[1] - p.a[1]) / len) * 0.05;
        const ny = ((p.b[0] - p.a[0]) / len) * 0.05;
        const fa = faceAt(m[0] + nx, m[1] + ny);
        const fb = faceAt(m[0] - nx, m[1] - ny);
        own = (fa === startFace && fb === -1) || (fb === startFace && fa === -1);
      }
    }
    if (own) ownKeys.add(key);
    else foreign.push(...pieces);
  }

  // Which steps between neighbouring samples a foreign wall forbids.
  const buckets = new Map<number, Piece[]>();
  for (const p of foreign) {
    const i0 = Math.max(0, Math.floor((Math.min(p.a[0], p.b[0]) - g.ox) * AREA_RES));
    const i1 = Math.min(g.w - 1, Math.floor((Math.max(p.a[0], p.b[0]) - g.ox) * AREA_RES));
    const j0 = Math.max(0, Math.floor((Math.min(p.a[1], p.b[1]) - g.oy) * AREA_RES));
    const j1 = Math.min(g.h - 1, Math.floor((Math.max(p.a[1], p.b[1]) - g.oy) * AREA_RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = buckets.get(j * g.w + i);
        if (list) list.push(p);
        else buckets.set(j * g.w + i, [p]);
      }
    }
  }
  const stepBlocked = (s: number, t: number): boolean => {
    const a: P = [sx(g, s % g.w), sy(g, Math.floor(s / g.w))];
    const b: P = [sx(g, t % g.w), sy(g, Math.floor(t / g.w))];
    for (const idx of [s, t]) for (const p of buckets.get(idx) ?? []) if (crossing(a, b, p.a, p.b)) return true;
    return false;
  };

  const inDisc = new Uint8Array(total);
  for (const d of discs) {
    const i0 = Math.max(0, Math.floor((d.x - d.r - g.ox) * AREA_RES));
    const i1 = Math.min(g.w - 1, Math.ceil((d.x + d.r - g.ox) * AREA_RES));
    const j0 = Math.max(0, Math.floor((d.y - d.r - g.oy) * AREA_RES));
    const j1 = Math.min(g.h - 1, Math.ceil((d.y + d.r - g.oy) * AREA_RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if ((sx(g, i) - d.x) ** 2 + (sy(g, j) - d.y) ** 2 <= d.r * d.r) inDisc[j * g.w + i] = 1;
      }
    }
  }

  const field = Uint8Array.from(room);
  let changed = false;
  if (opts.erase) {
    for (let k = 0; k < total; k++) {
      if (field[k] && inDisc[k] && owner[k] === startFace) {
        field[k] = 0;
        changed = true;
      }
    }
  } else {
    const queue: number[] = [];
    const open = (s: number, t: number): boolean => !field[t] && inDisc[t] === 1 && (owner[t] === -1 || owner[t] === startFace) && !stepBlocked(s, t);
    const grow = (s: number): void => {
      const i = s % g.w;
      const j = Math.floor(s / g.w);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const t = nj * g.w + ni;
        if (!open(s, t)) continue;
        field[t] = 1;
        changed = true;
        queue.push(t);
      }
    };
    if (startFace >= 0) {
      for (let s = 0; s < total; s++) if (room[s]) grow(s);
    } else {
      const s = Math.floor((origin.y - g.oy) * AREA_RES) * g.w + Math.floor((origin.x - g.ox) * AREA_RES);
      if (!inDisc[s] || owner[s] !== -1) return layers;
      field[s] = 1;
      changed = true;
      queue.push(s);
    }
    for (let head = 0; head < queue.length; head++) grow(queue[head]);
  }
  if (!changed) return layers;

  // The new outline: traced, fitted, and joined to the foreign walls it meets.
  const loops = traceField(g, field)
    .map((l) => fitLoop(l))
    .filter((n) => n.length >= 3 && area(n) >= MIN_AREA);
  const walls = { ...layers.walls };
  const next: Record<string, WallEdge> = {};
  const nearestForeign = (p: P): { foot: P; d: number } | undefined => {
    let best: { foot: P; d: number } | undefined;
    for (const f of foreign) {
      const hit = projectOnSegment(p, f.a, f.b);
      if (!best || hit.dist < best.d) best = { foot: hit.foot, d: hit.dist };
    }
    return best;
  };
  const shapes: P[][] = [];
  const curves: P[][] = [];
  for (const raw of loops) {
    const snapped = raw.map((p) => nearestForeign(p));
    const nodes = raw.map((p, k): P => (snapped[k] && snapped[k].d <= SNAP ? snapped[k].foot : p));
    const pinned = snapped.map((s) => s !== undefined && s.d <= SNAP);
    const n = nodes.length;
    const keepEdge = nodes.map((p, i) => {
      const q = nodes[(i + 1) % n];
      if (samePt(p, q)) return false;
      if (!(pinned[i] && pinned[(i + 1) % n])) return true;
      const mid = nearestForeign(lerp(p, q, 0.5));
      return !(mid && mid.d <= 0.15);
    });
    shapes.push(nodes);
    const emitted = emit(nodes, true, opts, keepEdge, pinned);
    Object.assign(next, emitted);
    curves.push(curveRing(nodes, keepEdge, emitted));
  }

  // Remove the room's own run; doors and fittings still on the new outline stay.
  const distToShapes = (p: P): number => {
    let best = Infinity;
    for (const ring of shapes) ring.forEach((q, i) => (best = Math.min(best, projectOnSegment(p, q, ring[(i + 1) % ring.length]).dist)));
    return best;
  };
  const kept: { wall: WallEdge; a: P; b: P }[] = [];
  for (const key of ownKeys) {
    const wall = layers.walls[key];
    if (isDoorLike(wall)) {
      const ps = piecesOf(layers, key);
      const a = ps[0].a;
      const b = ps[ps.length - 1].b;
      if (distToShapes(a) <= DOOR_REACH && distToShapes(b) <= DOOR_REACH) kept.push({ wall, a, b });
    }
    delete walls[key];
  }
  for (const door of kept) {
    for (const [key, w] of Object.entries(next)) {
      const pa = projectOnSegment(door.a, w.a, w.b);
      const pb = projectOnSegment(door.b, w.a, w.b);
      const len = dist(w.a, w.b);
      if (pa.dist > DOOR_REACH || pb.dist > DOOR_REACH || Math.abs(pa.t - pb.t) * len <= MIN_PIECE) continue;
      const lo = Math.min(pa.t, pb.t);
      const hi = Math.max(pa.t, pb.t);
      delete next[key];
      if (lo * len > MIN_PIECE) {
        const first: WallEdge = { ...w, b: lerp(w.a, w.b, lo) };
        delete first.smoothB;
        next[opts.newKey()] = first;
      }
      if ((1 - hi) * len > MIN_PIECE) {
        const piece: WallEdge = { ...w, a: lerp(w.a, w.b, hi) };
        delete piece.smoothA;
        next[opts.newKey()] = piece;
      }
      door.a = pa.foot;
      door.b = pb.foot;
      break;
    }
    // Walls on a grid line are placed by their key, so a door that had to move is written as an angled one.
    walls[opts.newKey()] = { ...door.wall, a: [clean(door.a[0]), clean(door.a[1])], b: [clean(door.b[0]), clean(door.b[1])] };
  }
  Object.assign(walls, next);

  // Floor follows the outline: squares whose middle is inside gain floor, and an erase takes it from the room.
  const floor = { ...layers.floor };
  // The drawn wall is the curve through the nodes, which strays from the polygon of the nodes by up to the fit
  // tolerance; judging a square by the polygon gave floor to squares just outside the wall (a sliver room of their own).
  const inside = (x: number, y: number): boolean => curves.filter((ring) => pointInRing(x + 0.5, y + 0.5, ring)).length % 2 === 1;
  if (opts.erase) {
    for (const k of faces[startFace].cells) {
      const [x, y] = k.split(",").map(Number);
      if (!inside(x, y)) delete floor[k];
    }
  } else {
    const xs = shapes.flat().map((p) => p[0]);
    const ys = shapes.flat().map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
        const k: CellKey = cellKey(x, y);
        if (floor[k]?.floor === undefined && inside(x, y)) floor[k] = { ...floor[k], floor: { ...opts.pack } };
      }
    }
  }
  return { ...layers, walls, floor };
}
