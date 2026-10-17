// How lit a point of a map is (epic #1073 story 4), by the 5e rules, the same in 2014 and 2024: bright light is normal
// sight, dim light lightly obscures, darkness heavily obscures. A light has a bright radius and a further dim ring.
// Light does not add up: two dim rings that overlap are still dim, so the brightest source at a point decides, and a
// map's ambient level is only a floor under every source.
//
// Pure and DOM-free, so the Cartographer's preview and the battle map carve their veil from the same numbers.

import { FEET_PER_CELL } from "@/cartographer/packSchema";
import type { DarknessLevel } from "@/types/dungeonMap.types";

/** The light level a map's ambient setting gives everywhere: 1 bright, 0.5 dim, 0 darkness. */
export const AMBIENT: Record<DarknessLevel, number> = { daylight: 1, dim: 0.5, dark: 0 };

/** A light as the carve sees it: centre in cells, radii in feet. */
export interface LitSource {
  x: number;
  y: number;
  bright: number;
  dim: number;
}

/**
 * Each ring's edge is softened over this many cells, centred on the boundary, so the veil has no hard pixel edge.
 * The rules' radius is where the level is halfway between the two sides.
 */
const SOFT_BAND_CELLS = 1 / 3;
const HALF_BAND = SOFT_BAND_CELLS / 2;

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 1 inside `edge` cells, 0 beyond, with the soft band across the boundary. */
const inside = (edge: number, dist: number): number => 1 - smoothstep(edge - HALF_BAND, edge + HALF_BAND, dist);

/** What one source gives a point `dist` cells from its centre: 1 bright, 0.5 dim, 0 beyond, softened at the edges. */
function contribution(bright: number, dim: number, dist: number): number {
  const brightEdge = bright / FEET_PER_CELL;
  if (dim <= 0) return bright > 0 ? inside(brightEdge, dist) : 0;
  const dimPart = 0.5 * inside((bright + dim) / FEET_PER_CELL, dist);
  return bright > 0 ? dimPart + 0.5 * inside(brightEdge, dist) : dimPart;
}

/** The light level at a point in cells: the brightest of the ambient level and every source. */
export function lightLevelAt(ambient: number, sources: readonly LitSource[], x: number, y: number): number {
  let level = ambient;
  for (const s of sources) {
    level = Math.max(level, contribution(s.bright, s.dim, Math.hypot(x - s.x, y - s.y)));
    if (level >= 1) return 1;
  }
  return level;
}

export interface IlluminationOptions {
  ambient: number;
  sources: readonly LitSource[];
  /** The first cell of the window. */
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** Samples per cell along each axis. */
  samplesPerCell: number;
}

/**
 * Light levels at sample centres, row-major, `cols * samplesPerCell` wide by `rows * samplesPerCell` tall. Each
 * source only visits the samples inside its own reach (plus the soft band), so many lights on a big map stay cheap.
 */
export function illuminationGrid(opts: IlluminationOptions): Float32Array {
  const { ambient, sources, minX, minY, cols, rows, samplesPerCell: spc } = opts;
  const w = cols * spc;
  const h = rows * spc;
  const grid = new Float32Array(w * h).fill(ambient);
  for (const s of sources) {
    const reach = (s.bright + s.dim) / FEET_PER_CELL + HALF_BAND;
    if (reach <= HALF_BAND) continue;
    // Sample i sits at cell minX + (i + 0.5) / spc.
    const i0 = Math.max(0, Math.floor((s.x - reach - minX) * spc - 0.5));
    const i1 = Math.min(w - 1, Math.ceil((s.x + reach - minX) * spc - 0.5));
    const j0 = Math.max(0, Math.floor((s.y - reach - minY) * spc - 0.5));
    const j1 = Math.min(h - 1, Math.ceil((s.y + reach - minY) * spc - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = minY + (j + 0.5) / spc;
      const row = j * w;
      for (let i = i0; i <= i1; i++) {
        const level = contribution(s.bright, s.dim, Math.hypot(minX + (i + 0.5) / spc - s.x, py - s.y));
        if (level > grid[row + i]) grid[row + i] = level;
      }
    }
  }
  return grid;
}
