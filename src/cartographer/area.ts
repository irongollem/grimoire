// Brushed areas (epic #1073, story 8): pure geometry over `layers.area`.
//
// A brushed area is a coverage mask per cell (8 x 8 sub-cells, see `AreaCell`).
// A fine mask rather than polygons because erasing is then clearing bits (no
// polygon boolean library), while the outline traced from it is still smoothed
// into a curve. A cell covered at least half also carries ordinary `floor`, so
// everything that reads `layers.floor` (regions, fog, rules, publish) is unchanged.

import type { AreaCell, CellKey, DungeonMapLayers, FloorCell, PackRef } from "@/types/dungeonMap.types";
import { cellKey, parseCellKey } from "@/types/dungeonMap.types";

export const AREA_RES = 8;
export const FLOOR_COVERAGE = 0.5;

const SUBS = AREA_RES * AREA_RES;
const FULL = "full";

export function decodeMask(mask: string): Uint8Array {
  const bits = new Uint8Array(SUBS);
  if (mask === FULL) {
    bits.fill(1);
    return bits;
  }
  if (!/^[0-9a-f]{16}$/.test(mask)) throw new Error(`Invalid area mask: ${mask}`);
  const hi = Number.parseInt(mask.slice(0, 8), 16);
  const lo = Number.parseInt(mask.slice(8), 16);
  for (let i = 0; i < 32; i++) {
    bits[i] = (lo >>> i) & 1;
    bits[32 + i] = (hi >>> i) & 1;
  }
  return bits;
}

/** `"full"`, 16 hex chars, or null when nothing is covered. */
export function encodeMask(bits: Uint8Array): string | null {
  let lo = 0;
  let hi = 0;
  let count = 0;
  for (let i = 0; i < 32; i++) {
    if (bits[i]) {
      lo |= 1 << i;
      count++;
    }
    if (bits[32 + i]) {
      hi |= 1 << i;
      count++;
    }
  }
  if (count === 0) return null;
  if (count === SUBS) return FULL;
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
}

export function coverage(mask: string): number {
  if (mask === FULL) return 1;
  const bits = decodeMask(mask);
  let n = 0;
  for (let i = 0; i < SUBS; i++) n += bits[i];
  return n / SUBS;
}

export interface Disc {
  x: number;
  y: number;
  r: number;
}

function hasFloor(layers: DungeonMapLayers, key: CellKey): boolean {
  return layers.floor[key]?.floor !== undefined;
}

/**
 * Paints or erases a round disc (cell units, fractional). Returns new `area`
 * and `floor` records; untouched cells keep their identity. Returns the input
 * unchanged when the disc changed nothing, so callers can skip a save.
 */
export function applyDisc(
  layers: DungeonMapLayers,
  disc: Disc,
  ref: PackRef,
  mode: "paint" | "erase",
): DungeonMapLayers {
  return applyDiscs(layers, [disc], ref, mode);
}

/**
 * `applyDisc` for a run of discs (a brush stroke's segment), copying the `area`
 * and `floor` records once for the whole run rather than once per disc.
 */
export function applyDiscs(
  layers: DungeonMapLayers,
  discs: readonly Disc[],
  ref: PackRef,
  mode: "paint" | "erase",
): DungeonMapLayers {
  const area: Record<CellKey, AreaCell> = { ...layers.area };
  const floor: Record<CellKey, FloorCell> = { ...layers.floor };
  let changed = false;
  for (const disc of discs) {
    if (discInto(area, floor, disc, ref, mode)) changed = true;
  }
  return changed ? { ...layers, area, floor } : layers;
}

/** Writes one disc into `area` and `floor` in place; true when it changed anything. */
function discInto(
  area: Record<CellKey, AreaCell>,
  floor: Record<CellKey, FloorCell>,
  disc: Disc,
  ref: PackRef,
  mode: "paint" | "erase",
): boolean {
  let changed = false;
  const r2 = disc.r * disc.r;

  for (let cy = Math.floor(disc.y - disc.r); cy <= Math.floor(disc.y + disc.r); cy++) {
    for (let cx = Math.floor(disc.x - disc.r); cx <= Math.floor(disc.x + disc.r); cx++) {
      const key = cellKey(cx, cy);
      const discBits = new Uint8Array(SUBS);
      let any = false;
      for (let sy = 0; sy < AREA_RES; sy++) {
        for (let sx = 0; sx < AREA_RES; sx++) {
          const dx = cx + (sx + 0.5) / AREA_RES - disc.x;
          const dy = cy + (sy + 0.5) / AREA_RES - disc.y;
          if (dx * dx + dy * dy <= r2) {
            discBits[sy * AREA_RES + sx] = 1;
            any = true;
          }
        }
      }
      if (!any) continue;

      const entry = area[key];
      let next: AreaCell | null;
      if (mode === "paint") {
        if (!entry && floor[key]?.floor !== undefined) continue; // plain floor is already fully floor
        const bits = entry ? decodeMask(entry.mask) : new Uint8Array(SUBS);
        for (let i = 0; i < SUBS; i++) if (discBits[i]) bits[i] = 1;
        const mask = encodeMask(bits);
        if (mask === null) continue;
        if (entry && entry.mask === mask && samePack(entry, ref)) continue;
        next = { ...ref, mask };
      } else if (entry) {
        const bits = decodeMask(entry.mask);
        for (let i = 0; i < SUBS; i++) if (discBits[i]) bits[i] = 0;
        const mask = encodeMask(bits);
        if (mask === entry.mask) continue;
        next = mask === null ? null : { ...entry, mask };
      } else {
        const plain = floor[key]?.floor;
        if (!plain) continue;
        const bits = new Uint8Array(SUBS);
        for (let i = 0; i < SUBS; i++) bits[i] = discBits[i] ? 0 : 1;
        const mask = encodeMask(bits);
        // A disc that covers the whole plain cell erases it outright.
        next = mask === null ? null : { ...plain, mask };
      }

      changed = true;
      if (next === null) {
        delete area[key];
        removeFloor(floor, key);
      } else {
        area[key] = next;
        if (coverage(next.mask) >= FLOOR_COVERAGE) {
          const { mask: _mask, ...pack } = next;
          floor[key] = { ...floor[key], floor: pack };
        } else {
          removeFloor(floor, key);
        }
      }
    }
  }
  return changed;
}

function samePack(a: PackRef, b: PackRef): boolean {
  return a.pack_id === b.pack_id && a.pack_version === b.pack_version && a.variant === b.variant && a.rotation === b.rotation;
}

/** Drops a cell's floor tile but keeps its walls; the cell object goes when nothing is left. */
function removeFloor(floor: Record<CellKey, FloorCell>, key: CellKey): void {
  const cell = floor[key];
  if (!cell || cell.floor === undefined) return;
  const { floor: _floor, ...rest } = cell;
  if (rest.wallN || rest.wallW) floor[key] = rest;
  else delete floor[key];
}

export interface OutlineLoop {
  /** Closed loop in cell units; the last point connects back to the first. */
  points: [number, number][];
  /** `stroke[i]` is true when the segment points[i] -> points[i+1] carries the wall. */
  stroke: boolean[];
}

export interface AreaOutline {
  loops: OutlineLoop[];
}

/**
 * Traces the boundary of the covered field with marching squares over the
 * sub-cell grid (one sample per sub-cell centre, contour at the midpoints, so a
 * full cell's edge lies exactly on the cell edge), then smooths each loop with
 * two Chaikin passes. The covered side is on the left of travel (y down).
 * Plain floor (floor set, no area entry) counts as covered, so a brush meets a
 * drawn room cleanly; those stretches are not stroked because they are the drawn
 * map's own walls. Plain floor beyond the one-cell margin is not sampled, so a
 * loop that hits the margin edge there runs along it unstroked. Loops with no
 * stroked segment at all (plain floor islands) are dropped.
 */
export function areaOutline(layers: DungeonMapLayers): AreaOutline {
  const areaKeys = Object.keys(layers.area) as CellKey[];
  if (areaKeys.length === 0) return { loops: [] };

  let minCx = Infinity;
  let minCy = Infinity;
  let maxCx = -Infinity;
  let maxCy = -Infinity;
  for (const key of areaKeys) {
    const [x, y] = parseCellKey(key);
    minCx = Math.min(minCx, x);
    minCy = Math.min(minCy, y);
    maxCx = Math.max(maxCx, x);
    maxCy = Math.max(maxCy, y);
  }
  // One cell of margin so every loop closes inside the grid.
  const cx0 = minCx - 1;
  const cy0 = minCy - 1;
  const cw = maxCx - minCx + 3;
  const ch = maxCy - minCy + 3;
  const W = cw * AREA_RES;
  const H = ch * AREA_RES;
  const field = new Uint8Array(W * H);
  const hasArea = new Uint8Array(cw * ch);

  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const key = cellKey(cx0 + i, cy0 + j);
      const entry = layers.area[key];
      let bits: Uint8Array | null = null;
      if (entry) {
        hasArea[j * cw + i] = 1;
        bits = decodeMask(entry.mask);
      } else if (!hasFloor(layers, key)) {
        continue;
      }
      for (let sy = 0; sy < AREA_RES; sy++) {
        for (let sx = 0; sx < AREA_RES; sx++) {
          if (bits === null || bits[sy * AREA_RES + sx]) field[(j * AREA_RES + sy) * W + i * AREA_RES + sx] = 1;
        }
      }
    }
  }
  // The outermost sample ring is forced empty so floor running off the grid still closes.
  for (let i = 0; i < W; i++) {
    field[i] = 0;
    field[(H - 1) * W + i] = 0;
  }
  for (let j = 0; j < H; j++) {
    field[j * W] = 0;
    field[j * W + W - 1] = 0;
  }

  const areaAt = (si: number, sj: number): boolean => hasArea[Math.floor(sj / AREA_RES) * cw + Math.floor(si / AREA_RES)] === 1;

  // Midpoint ids: h(i,j) between samples (i,j)-(i+1,j); v(i,j) between (i,j)-(i,j+1).
  const hId = (i: number, j: number): number => (j * W + i) * 2;
  const vId = (i: number, j: number): number => (j * W + i) * 2 + 1;
  const next = new Int32Array(W * H * 2).fill(-1);
  const strokeOut = new Uint8Array(W * H * 2);

  type Seg = [number, number];
  const CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]; // TL TR BR BL
  const MID: [number, number][] = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]; // T R B L

  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const c = [field[j * W + i], field[j * W + i + 1], field[(j + 1) * W + i + 1], field[(j + 1) * W + i]];
      const n = c[0] + c[1] + c[2] + c[3];
      if (n === 0 || n === 4) continue;
      // T R B L as ids
      const ids = [hId(i, j), vId(i + 1, j), hId(i, j + 1), vId(i, j)];
      // Segments by midpoint index (0 T, 1 R, 2 B, 3 L)
      const segs: Seg[] = [];
      const around = (corner: number): Seg => [(corner + 3) % 4, corner]; // corner TL -> L,T ...
      if (n === 1) segs.push(around(c.indexOf(1)));
      else if (n === 3) segs.push(around(c.indexOf(0)));
      else if (c[0] === c[2]) segs.push(around(c[0] ? 0 : 1), around(c[0] ? 2 : 3)); // diagonal: separate the covered corners
      else if (c[0] === c[1]) segs.push([3, 1]); // top pair vs bottom pair
      else segs.push([0, 2]);

      for (const [a, b] of segs) {
        const [ax, ay] = MID[a];
        const [bx, by] = MID[b];
        const dx = bx - ax;
        const dy = by - ay;
        // Left normal in y-down is (dy, -dx); probe a quarter step along it.
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const lx = mx + dy * 0.5;
        const ly = my - dx * 0.5;
        const leftCorners = nearestCorners(CORNERS, lx, ly);
        const leftCovered = c[leftCorners[0]] === 1;
        const [from, to] = leftCovered ? [a, b] : [b, a];
        const sideCorners = [...leftCorners, ...nearestCorners(CORNERS, 2 * mx - lx, 2 * my - ly)];
        let stroke = 0;
        for (const k of sideCorners) {
          if (areaAt(i + CORNERS[k][0], j + CORNERS[k][1])) stroke = 1;
        }
        next[ids[from]] = ids[to];
        strokeOut[ids[from]] = stroke;
      }
    }
  }

  const point = (id: number): [number, number] => {
    const v = id & 1;
    const cell = id >> 1;
    const i = cell % W;
    const j = Math.floor(cell / W);
    const sx = cx0 * AREA_RES;
    const sy = cy0 * AREA_RES;
    return v === 0 ? [(sx + i + 1) / AREA_RES, (sy + j + 0.5) / AREA_RES] : [(sx + i + 0.5) / AREA_RES, (sy + j + 1) / AREA_RES];
  };

  const seen = new Uint8Array(next.length);
  const loops: OutlineLoop[] = [];
  for (let start = 0; start < next.length; start++) {
    if (next[start] < 0 || seen[start]) continue;
    let pts: [number, number][] = [];
    let flags: boolean[] = [];
    let id = start;
    while (!seen[id]) {
      seen[id] = 1;
      pts.push(point(id));
      flags.push(strokeOut[id] === 1);
      id = next[id];
      if (id < 0) break;
    }
    if (id < 0 || pts.length < 3 || !flags.some(Boolean)) continue;
    ({ pts, flags } = dropCollinear(pts, flags));
    for (let pass = 0; pass < 2; pass++) ({ pts, flags } = chaikin(pts, flags));
    loops.push({ points: pts, stroke: flags });
  }
  return { loops };
}

function nearestCorners(corners: [number, number][], px: number, py: number): number[] {
  const d = corners.map(([x, y]) => (x - px) ** 2 + (y - py) ** 2);
  const min = Math.min(...d);
  const out: number[] = [];
  d.forEach((v, k) => {
    if (v <= min + 1e-9) out.push(k);
  });
  return out;
}

/** Removes points that sit on a straight run between two segments with the same stroke flag. */
function dropCollinear(pts: [number, number][], flags: boolean[]): { pts: [number, number][]; flags: boolean[] } {
  const n = pts.length;
  const outP: [number, number][] = [];
  const outF: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    const cross = (cur[0] - prev[0]) * (nxt[1] - cur[1]) - (cur[1] - prev[1]) * (nxt[0] - cur[0]);
    const dot = (cur[0] - prev[0]) * (nxt[0] - cur[0]) + (cur[1] - prev[1]) * (nxt[1] - cur[1]);
    if (cross === 0 && dot > 0 && flags[(i + n - 1) % n] === flags[i]) continue;
    outP.push(cur);
    outF.push(flags[i]);
  }
  return { pts: outP, flags: outF };
}

function chaikin(pts: [number, number][], flags: boolean[]): { pts: [number, number][]; flags: boolean[] } {
  const n = pts.length;
  const outP: [number, number][] = [];
  const outF: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    outP.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
    outF.push(flags[i]); // along the original segment
    outP.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    // The corner cut towards the next segment is stroked only when both neighbours are.
    outF.push(flags[i] && flags[(i + 1) % n]);
  }
  return { pts: outP, flags: outF };
}

/**
 * Edges (NW-owned keys, like `edges.ts`) between a floor cell and a non-floor
 * cell where either side has an area entry: what light and sight cannot cross.
 */
export function areaBlockingEdges(layers: DungeonMapLayers): string[] {
  const out = new Set<string>();
  const solid = (x: number, y: number): boolean => hasFloor(layers, cellKey(x, y));
  const touched = (x: number, y: number): boolean => layers.area[cellKey(x, y)] !== undefined;
  for (const key of Object.keys(layers.floor) as CellKey[]) {
    if (!hasFloor(layers, key)) continue;
    const [x, y] = parseCellKey(key);
    const sides: [number, number, string][] = [
      [x, y - 1, `${x},${y}:N`],
      [x - 1, y, `${x},${y}:W`],
      [x, y + 1, `${x},${y + 1}:N`],
      [x + 1, y, `${x + 1},${y}:W`],
    ];
    for (const [nx, ny, edge] of sides) {
      if (!solid(nx, ny) && (touched(x, y) || touched(nx, ny))) out.add(edge);
    }
  }
  return [...out].sort();
}
