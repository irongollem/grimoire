// The cave-brush gesture (epic #884 S7a, decision 6): an organic blob drawn
// with value noise. Cartographer-only before this story; moved here from
// `geometry.ts` (the noise half — see `template.ts` for the room-template
// shapes that lived alongside it). No Atlas equivalent existed to merge
// against.

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";

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
