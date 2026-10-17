// How lit a point of a map is (epic #1073 story 4), by the 5e rules, the same in 2014 and 2024: bright light is normal
// sight, dim light lightly obscures, darkness heavily obscures. A light has a bright radius and a further dim ring.
// Light does not add up: two dim rings that overlap are still dim, so the brightest source at a point decides, and a
// map's ambient level is only a floor under every source. A light only reaches what it has a clear line to (story 6,
// `occlusion.ts`): walls, closed doors and solid rock stop it. Callers with nothing that blocks pass `NO_OCCLUDERS`.
//
// Magical darkness (story 10) is a sphere no light lifts: a point inside one has level 0 whatever the lights and the
// ambient level, and a light's line to a point that passes through one is stopped, the same way a wall stops it.
//
// Pure and DOM-free, so the Cartographer's preview and the battle map carve their veil from the same numbers.

import { FEET_PER_CELL } from "@/cartographer/packSchema";
import { clearLine, nudgedOrigins, type Occluders } from "@/lib/battlemap/occlusion";
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

/** A sphere of magical darkness: centre in image cells (fractional), radius in feet. */
export interface DarknessZone {
  x: number;
  y: number;
  radius: number;
}

export const NO_ZONES: readonly DarknessZone[] = [];

/** Whether a point (cells) lies inside any zone. */
export function inZone(zones: readonly DarknessZone[], x: number, y: number): boolean {
  return zones.some((z) => Math.hypot(x - z.x, y - z.y) <= z.radius / FEET_PER_CELL);
}

/** Whether the segment (a to b, cells) touches any zone: its nearest point to a zone's centre is inside that zone. */
export function segmentTouchesZone(
  zones: readonly DarknessZone[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  return zones.some((z) => {
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((z.x - ax) * dx + (z.y - ay) * dy) / len2));
    return Math.hypot(ax + t * dx - z.x, ay + t * dy - z.y) <= z.radius / FEET_PER_CELL;
  });
}

/** The light level at a point in cells: the brightest of the ambient level and every source with a clear line to it. */
export function lightLevelAt(
  ambient: number,
  sources: readonly LitSource[],
  occ: Occluders,
  x: number,
  y: number,
  zones: readonly DarknessZone[] = NO_ZONES,
): number {
  if (inZone(zones, x, y)) return 0;
  let level = ambient;
  for (const s of sources) {
    const c = contribution(s.bright, s.dim, Math.hypot(x - s.x, y - s.y));
    if (c <= level) continue;
    if (segmentTouchesZone(zones, s.x, s.y, x, y)) continue;
    if (!nudgedOrigins(s.x, s.y).some(([ox, oy]) => clearLine(occ, ox, oy, x, y))) continue;
    level = c;
    if (level >= 1) return 1;
  }
  return level;
}

export interface IlluminationOptions {
  ambient: number;
  sources: readonly LitSource[];
  occluders: Occluders;
  /** The first cell of the window. */
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** Samples per cell along each axis. */
  samplesPerCell: number;
  /** Magical darkness; absent means none. */
  zones?: readonly DarknessZone[];
}

/**
 * Light levels at sample centres, row-major, `cols * samplesPerCell` wide by `rows * samplesPerCell` tall. Each
 * source only visits the samples inside its own reach (plus the soft band), so many lights on a big map stay cheap.
 */
export function illuminationGrid(opts: IlluminationOptions): Float32Array {
  const { ambient, sources, occluders: occ, minX, minY, cols, rows, samplesPerCell: spc, zones = NO_ZONES } = opts;
  const w = cols * spc;
  const h = rows * spc;
  const grid = new Float32Array(w * h).fill(ambient);
  for (const s of sources) {
    const origins = nudgedOrigins(s.x, s.y);
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
        const px = minX + (i + 0.5) / spc;
        const level = contribution(s.bright, s.dim, Math.hypot(px - s.x, py - s.y));
        // The line test is the dear part, so it runs only for a sample the source would actually brighten.
        if (
          level > grid[row + i] &&
          !segmentTouchesZone(zones, s.x, s.y, px, py) &&
          origins.some(([ox, oy]) => clearLine(occ, ox, oy, px, py))
        )
          grid[row + i] = level;
      }
    }
  }
  // Magical darkness wins over everything above, ambient included.
  for (const z of zones) {
    const r = z.radius / FEET_PER_CELL;
    const i0 = Math.max(0, Math.floor((z.x - r - minX) * spc - 0.5));
    const i1 = Math.min(w - 1, Math.ceil((z.x + r - minX) * spc - 0.5));
    const j0 = Math.max(0, Math.floor((z.y - r - minY) * spc - 0.5));
    const j1 = Math.min(h - 1, Math.ceil((z.y + r - minY) * spc - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = minY + (j + 0.5) / spc;
      for (let i = i0; i <= i1; i++) {
        if (Math.hypot(minX + (i + 0.5) / spc - z.x, py - z.y) <= r) grid[j * w + i] = 0;
      }
    }
  }
  return grid;
}
