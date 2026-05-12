// Cartographer M6 geometry — room template shapes + cave brush noise.

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";

// ── Room template shapes ─────────────────────────────────────────────────────
// All shapes are centered on (cx, cy) with approximate radius r (in cells).

export function cellsInCircle(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) out.push(cellKey(cx + dx, cy + dy));
    }
  }
  return out;
}

// Grid-aligned octagon: clips a square by cutting the four 45° corners.
// Corner cut = ~30% of radius so all eight sides have roughly equal length.
export function cellsInOctagon(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  const cut = Math.round(r * 0.3);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx <= r && ady <= r && adx + ady <= 2 * r - cut) {
        out.push(cellKey(cx + dx, cy + dy));
      }
    }
  }
  return out;
}

// Pointy-top hex approximation on a square grid: the row width narrows
// by 1 cell for every 2 rows away from the equator.
export function cellsInHex(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  for (let dy = -r; dy <= r; dy++) {
    const halfWidth = r - Math.ceil(Math.abs(dy) / 2);
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      out.push(cellKey(cx + dx, cy + dy));
    }
  }
  return out;
}

export function cellsForTemplate(
  cx: number,
  cy: number,
  r: number,
  shape: "circle" | "octagon" | "hex",
): CellKey[] {
  if (r <= 0) return [cellKey(cx, cy)];
  if (shape === "circle") return cellsInCircle(cx, cy, r);
  if (shape === "octagon") return cellsInOctagon(cx, cy, r);
  return cellsInHex(cx, cy, r);
}

// ── Cave brush — smooth value noise ─────────────────────────────────────────

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Bilinearly-interpolated smooth value noise in [0, 1].
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  function rand(gx: number, gy: number): number {
    return (hash32(`${seed}|${gx}|${gy}`) & 0xffff) / 0xffff;
  }
  const v00 = rand(ix, iy), v10 = rand(ix + 1, iy);
  const v01 = rand(ix, iy + 1), v11 = rand(ix + 1, iy + 1);
  // Smoothstep interpolation weights
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v00 - v10 - v01 + v11) * sx * sy;
}

// Returns cells to paint for one cave-brush tick centered on (cx, cy).
// Uses value noise to decide cell inclusion, producing organic blob shapes.
// The same (cx, cy, seed) always yields the same cells — deterministic per stroke.
export function caveBrushCells(
  cx: number,
  cy: number,
  radius: number,
  seed: number,
): CellKey[] {
  const out: CellKey[] = [];
  const noiseScale = 0.35; // frequency — lower = larger cave blobs
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      if (dist2 > radius * radius) continue;
      const edgeFade = 1 - Math.sqrt(dist2) / radius; // 1 at centre, 0 at edge
      const noise = valueNoise2D((cx + dx) * noiseScale, (cy + dy) * noiseScale, seed);
      // Centre always included (high edgeFade lowers the threshold to ~0.08).
      // Edge cells included ~50% of the time (edgeFade≈0, threshold≈0.48).
      if (noise > 0.48 - edgeFade * 0.4) {
        out.push(cellKey(cx + dx, cy + dy));
      }
    }
  }
  return out;
}
