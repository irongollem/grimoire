// Round-brush vector fitting. Ground shapes and physical walls have independent identities and materials.

import { clean, dist, lerp, projectOnSegment, samePt } from "./wallEdit/geometry";
import { type BrushRegionMode, type GroundWallMode, type PackRef, type WallEdge } from "@/types/dungeonMap.types";

type P = [number, number];

/** How far (cells) the fitted outline may stray from the traced one: above the raster's own noise (about 0.06), so a
 *  straight edge at any angle collapses to two nodes, and a circle of radius 4 keeps about 16. */
export const FIT_TOLERANCE = 0.08;
/** A node where the outline turns by more than this is a corner (a room's square end); below it the node is smooth. */
export const CORNER_TURN_DEG = 60;
/** The raster cuts every convex or concave corner by a 45 degree step of up to this length; it is put back. */
const CUT_MAX = 0.2;
const CUT_NEIGHBOUR_MIN = 0.35;

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
function mark(ring: readonly P[], lo: number, hi: number, keep: Uint8Array, tolerance = FIT_TOLERANCE): void {
  let worst = -1;
  let worstD = tolerance;
  for (let i = lo + 1; i < hi; i++) {
    const d = projectOnSegment(ring[i], ring[lo], ring[hi]).dist;
    if (d > worstD) {
      worst = i;
      worstD = d;
    }
  }
  if (worst < 0) return;
  keep[worst] = 1;
  mark(ring, lo, worst, keep, tolerance);
  mark(ring, worst, hi, keep, tolerance);
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
export function fitLoop(dense: readonly P[], tolerance = FIT_TOLERANCE): P[] {
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
  mark(ring, 0, far, keep, tolerance);
  mark(ring, far, n, keep, tolerance);
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

/** A closed outline as angled walls, every node smooth unless it is a corner (a turn over `CORNER_TURN_DEG`). */
export function outlineToWalls(loop: readonly P[], opts: WallMaking, tolerance = FIT_TOLERANCE): Record<string, WallEdge> {
  const nodes = fitLoop(loop, tolerance);
  return nodes.length < 3 ? {} : emit(nodes, true, opts, undefined, undefined);
}

/** An open stretch of outline as angled walls; its two ends are corners. */
export function runToWalls(points: readonly P[], opts: WallMaking): Record<string, WallEdge> {
  const nodes = fitRun(points);
  return nodes.length < 2 ? {} : emit(nodes, false, opts, undefined, undefined);
}

export interface BrushOptions extends WallMaking {
  erase: boolean;
  pack: PackRef;
  mode?: BrushRegionMode;
  targetId?: string | null;
  walls?: GroundWallMode;
  category?: "floor" | "terrainWater";
  name?: string;
}
