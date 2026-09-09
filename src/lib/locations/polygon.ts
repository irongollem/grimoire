// Pen and template geometry — the pure half of S14 (epic #868, frame 12
// "Tracing"). `MapRegionsLayer.vue` (S14b) is the caller; nothing here
// touches the DOM or a canvas.
//
// `cells: CellKey[]` cannot express a diagonal, a canted corner, or a cave
// wall, so a region gains `vertices jsonb` — an ordered *open* ring of grid
// points (the last point is not a repeat of the first), halves allowed. When
// `vertices` is set, `cells` is derived from it and cached: every cell whose
// *centre* falls inside the ring, via the even-odd rule. `vertices` null
// still means a plain painted region — nothing here changes that contract,
// it only adds the maths that fills a ring once one exists.
//
// The three room-template shapes are not reinvented here: `cellsInCircle` /
// `cellsInOctagon` / `cellsInHex` (`src/cartographer/geometry.ts`) already
// ship, unit-tested, for the Cartographer's room tool, and `templateCells`
// is a thin pass-through. `templateRing` is the new half — the polygon
// outline the same template would draw, so a template drop is stored as
// `vertices` and stays editable with the pen afterward. Those functions
// treat the shapes' own `(cx, cy)` as a grid *index*, not a cell centre —
// `templateRing` centres its outline on `(cx + 0.5, cy + 0.5)` so that
// testing a cell's centre against the ring reproduces the same membership
// test the index-based `cellsIn*` functions already use.

import type { GridPoint } from "@/types/locationMapRegion.types";
import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";
import { cellsForTemplate } from "@/cartographer/geometry";
import { canonicalCells } from "@/cartographer/cellSignature";

export type TraceTool = "paint" | "pen" | "template";
export type TemplateShape = "circle" | "octagon" | "hex";

function keyOf(p: GridPoint): string {
  return `${p[0]},${p[1]}`;
}

// A round-to-zero step can hand back `-0`, which fails a `toEqual([0, ...])`
// assertion and reads badly in a stored ring besides — `|| 0` folds it back.
function snap1D(v: number, step: number): number {
  return Math.round(v / step) * step || 0;
}

/** Vertices snap to grid intersections; hold alt for half-cell, which is
 *  what a 45° wall needs (frame 12, "The pen"). */
export function snapPoint(x: number, y: number, mode: "intersection" | "half"): GridPoint {
  const step = mode === "half" ? 0.5 : 1;
  return [snap1D(x, step), snap1D(y, step)];
}

/** A ring is "closed" once it has ≥3 *distinct* points — closing the pen
 *  gesture doesn't append a repeated first point, it just makes this true. */
export function isClosed(ring: readonly GridPoint[]): boolean {
  const distinct = new Set(ring.map(keyOf));
  return distinct.size >= 3;
}

function onSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= lenSq;
}

/** Even-odd rule; a point exactly on an edge (including a vertex) counts as
 *  inside, checked explicitly first since the ray-cast test alone treats
 *  boundary points inconsistently. */
export function pointInRing(px: number, py: number, ring: readonly GridPoint[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % n];
    if (onSegment(px, py, ax, ay, bx, by)) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function ringBounds(
  ring: readonly GridPoint[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (ring.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Every cell whose centre falls inside the ring, canonically ordered.
 *  `[]` for a ring that isn't closed yet — a region with `vertices` still
 *  mid-trace derives no cells rather than a wrong or partial set. */
export function cellsInsideRing(ring: readonly GridPoint[]): CellKey[] {
  if (!isClosed(ring)) return [];
  const bounds = ringBounds(ring);
  if (!bounds) return [];
  const minCellX = Math.floor(bounds.minX);
  const maxCellX = Math.ceil(bounds.maxX);
  const minCellY = Math.floor(bounds.minY);
  const maxCellY = Math.ceil(bounds.maxY);
  const out: CellKey[] = [];
  for (let cy = minCellY; cy < maxCellY; cy++) {
    for (let cx = minCellX; cx < maxCellX; cx++) {
      if (pointInRing(cx + 0.5, cy + 0.5, ring)) out.push(cellKey(cx, cy));
    }
  }
  return canonicalCells(out);
}

/** Drag a node to reshape (frame 12) — insert after `afterIndex`, wrapping
 *  naturally: `-1` prepends, `ring.length - 1` appends. */
export function insertVertex(ring: readonly GridPoint[], afterIndex: number, point: GridPoint): GridPoint[] {
  const out = [...ring];
  out.splice(afterIndex + 1, 0, point);
  return out;
}

export function moveVertex(ring: readonly GridPoint[], index: number, point: GridPoint): GridPoint[] {
  const out = [...ring];
  out[index] = point;
  return out;
}

/** Alt-click deletes a node (frame 12) — refused below 3 points, because a
 *  2-point ring isn't a shrunk polygon, it's an abandoned one. */
export function removeVertex(ring: readonly GridPoint[], index: number): GridPoint[] {
  if (ring.length <= 3) return [...ring];
  const out = [...ring];
  out.splice(index, 1);
  return out;
}

export function nearestVertex(
  ring: readonly GridPoint[],
  x: number,
  y: number,
  withinCells: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDist = Infinity;
  ring.forEach(([vx, vy], i) => {
    const dist = Math.hypot(vx - x, vy - y);
    if (dist <= withinCells && dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/** Double-click an edge inserts a node there (frame 12) — this finds the
 *  edge and the snapped point `insertVertex` should be called with; it
 *  always snaps to a full intersection, regardless of the tool's current
 *  snap mode, since a node dropped mid-edge isn't the alt-held half-cell
 *  gesture. */
export function nearestEdge(
  ring: readonly GridPoint[],
  x: number,
  y: number,
  withinCells: number,
): { index: number; point: GridPoint } | null {
  const n = ring.length;
  if (n < 2) return null;
  let best: { index: number; point: GridPoint; dist: number } | null = null;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % n];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.hypot(px - x, py - y);
    if (dist <= withinCells && (!best || dist < best.dist)) {
      best = { index: i, point: snapPoint(px, py, "intersection"), dist };
    }
  }
  return best ? { index: best.index, point: best.point } : null;
}

/** The room template drops a circle, octagon or hex in one gesture (frame
 *  12) — the same cells the Cartographer's room tool already computes. */
export function templateCells(shape: TemplateShape, center: GridPoint, radius: number): CellKey[] {
  const cx = Math.round(center[0]);
  const cy = Math.round(center[1]);
  const r = Math.round(radius);
  return cellsForTemplate(cx, cy, r, shape);
}

/** The polygon outline a template drop would draw, so it can be stored as
 *  `vertices` and stay editable with the pen afterward — "the same three
 *  shapes the Cartographer already generates" (frame 12), as a ring instead
 *  of a cell set. Vertices are built around the template's own centre,
 *  `(cx + 0.5, cy + 0.5)`, so that a cell-centre-inside-ring test reproduces
 *  the index-based test `cellsForTemplate` already makes. */
export function templateRing(shape: TemplateShape, center: GridPoint, radius: number): GridPoint[] {
  const cx = Math.round(center[0]) + 0.5;
  const cy = Math.round(center[1]) + 0.5;
  const r = Math.round(radius);

  if (shape === "circle") {
    const sides = 16;
    const points: GridPoint[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      points.push(snapPoint(cx + r * Math.cos(angle), cy + r * Math.sin(angle), "half"));
    }
    return simplifyRing(points);
  }

  if (shape === "octagon") {
    // Mirrors cellsInOctagon's own clip exactly: a square with the four
    // 45° corners cut by `cut`, so the two agree up to grid discretization.
    const cut = Math.round(r * 0.3);
    const points: GridPoint[] = [
      [cx - r + cut, cy - r],
      [cx + r - cut, cy - r],
      [cx + r, cy - r + cut],
      [cx + r, cy + r - cut],
      [cx + r - cut, cy + r],
      [cx - r + cut, cy + r],
      [cx - r, cy + r - cut],
      [cx - r, cy - r + cut],
    ];
    return simplifyRing(points.map(([x, y]) => snapPoint(x, y, "half")));
  }

  // Flat-top hex: cellsInHex's widest row is the equator (full ±r) and its
  // top/bottom rows narrow to roughly half that, which this outline mirrors
  // with a flat top/bottom edge rather than a sharp point.
  const points: GridPoint[] = [
    [cx - r / 2, cy - r],
    [cx + r / 2, cy - r],
    [cx + r, cy],
    [cx + r / 2, cy + r],
    [cx - r / 2, cy + r],
    [cx - r, cy],
  ];
  return simplifyRing(points.map(([x, y]) => snapPoint(x, y, "half")));
}

function isCollinear(a: GridPoint, b: GridPoint, c: GridPoint): boolean {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(cross) < 1e-9;
}

function dedupeConsecutive(ring: readonly GridPoint[]): GridPoint[] {
  const out: GridPoint[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  // The ring is an open list — a last point equal to the first is the same
  // duplicate, just across the wraparound seam.
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

/** Drops consecutive duplicates and collinear midpoints — a template's
 *  outline, or a pen ring after a drag, can accumulate either. */
export function simplifyRing(ring: readonly GridPoint[]): GridPoint[] {
  const deduped = dedupeConsecutive(ring);
  const n = deduped.length;
  if (n < 3) return deduped;
  const out: GridPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prev = deduped[(i - 1 + n) % n];
    const curr = deduped[i];
    const next = deduped[(i + 1) % n];
    if (!isCollinear(prev, curr, next)) out.push(curr);
  }
  return out;
}
