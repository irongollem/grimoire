// Raster boolean operations for editable ground vectors. The raster is transient; fitted loops are the source.
import type { CellKey } from "@/types/dungeonMap.types";
import { AREA_RES, type Disc } from "./area";
type P = [number, number];
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
      const c0 = field[j * w + i];
      const c1 = field[j * w + i + 1];
      const c2 = field[(j + 1) * w + i + 1];
      const c3 = field[(j + 1) * w + i];
      const count = c0 + c1 + c2 + c3;
      if (count === 0 || count === 4) continue;
      const c = [c0, c1, c2, c3];
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


/** Union or difference, preserving all closed loops and holes through even-odd coverage. */
export function groundStrokeLoops(loops: readonly (readonly P[])[], discs: readonly Disc[], erase: boolean, cells: ReadonlySet<CellKey> = new Set()): P[][] | null {
  const points = loops.flatMap((l) => l);
  for (const d of discs) points.push([d.x - d.r, d.y - d.r], [d.x + d.r, d.y + d.r]);
  for (const k of cells) { const [x, y] = k.split(",").map(Number); points.push([x, y], [x + 1, y + 1]); }
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const ox = Math.floor(Math.min(...xs)) - 1;
  const oy = Math.floor(Math.min(...ys)) - 1;
  const g: Grid = { ox, oy, w: (Math.ceil(Math.max(...xs)) + 1 - ox) * AREA_RES, h: (Math.ceil(Math.max(...ys)) + 1 - oy) * AREA_RES };
  const field = new Uint8Array(g.w * g.h);
  for (const loop of loops) fillRing(g, loop, (idx) => { field[idx] ^= 1; });
  let changed = false;
  for (const d of discs) {
    const i0 = Math.max(0, Math.floor((d.x - d.r - ox) * AREA_RES));
    const i1 = Math.min(g.w - 1, Math.ceil((d.x + d.r - ox) * AREA_RES));
    const j0 = Math.max(0, Math.floor((d.y - d.r - oy) * AREA_RES));
    const j1 = Math.min(g.h - 1, Math.ceil((d.y + d.r - oy) * AREA_RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if ((sx(g, i) - d.x) ** 2 + (sy(g, j) - d.y) ** 2 <= d.r ** 2) {
        const idx = j * g.w + i; const value = erase ? 0 : 1;
        if (field[idx] !== value) { field[idx] = value; changed = true; }
      }
    }
  }
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    for (let j = (y - oy) * AREA_RES; j < (y + 1 - oy) * AREA_RES; j++) {
      for (let i = (x - ox) * AREA_RES; i < (x + 1 - ox) * AREA_RES; i++) {
        const idx = j * g.w + i; const value = erase ? 0 : 1;
        if (field[idx] !== value) { field[idx] = value; changed = true; }
      }
    }
  }
  return changed ? traceField(g, field) : null;
}
