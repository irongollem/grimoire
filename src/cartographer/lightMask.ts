// Which part of a light's reach it can actually see (epic #1073 story 6), for the glow baked into the picture. The
// veil and vision already stop at walls (`src/lib/battlemap/occlusion.ts`); this gives the coloured glow the same
// answer so a torch does not tint the room next door. Pure and DOM-free.

import { clearLine, nudgedOrigins, type Occluders } from "@/lib/battlemap/occlusion";

/** Mask samples per cell along each axis, the same density the illumination grid uses. */
export const MASK_SAMPLES_PER_CELL = 4;

export interface LightMask {
  width: number;
  height: number;
  /** One byte per sample, row-major: 255 where the light has a clear line to the sample centre, else 0. */
  alpha: Uint8Array;
}

/**
 * The visibility mask of a light at (lx,ly) with a reach of `radius` cells over the cells [x0,x1) by [y0,y1)
 * (whole cells, in map cells). A sample counts when any of the light's nudged origins has a clear line to its centre
 * (a light on a wall fitting's edge shines from a hair off each face), and only inside the reach: the gradient is
 * nothing beyond it, so those samples are left at 0 and cost no line walk.
 */
export function lightMask(
  occ: Occluders,
  lx: number,
  ly: number,
  radius: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): LightMask {
  const width = (x1 - x0) * MASK_SAMPLES_PER_CELL;
  const height = (y1 - y0) * MASK_SAMPLES_PER_CELL;
  const alpha = new Uint8Array(width * height);
  const origins = nudgedOrigins(lx, ly);
  const reachSq = radius * radius;
  for (let j = 0; j < height; j++) {
    const sy = y0 + (j + 0.5) / MASK_SAMPLES_PER_CELL;
    for (let i = 0; i < width; i++) {
      const sx = x0 + (i + 0.5) / MASK_SAMPLES_PER_CELL;
      if ((sx - lx) ** 2 + (sy - ly) ** 2 > reachSq) continue;
      if (origins.some(([ox, oy]) => clearLine(occ, ox, oy, sx, sy))) alpha[j * width + i] = 255;
    }
  }
  return { width, height, alpha };
}

/** The occluders of one map revision and the mask of each light computed against them. */
export interface LightMaskCache {
  occ: Occluders;
  masks: Map<string, { mask: LightMask; x0: number; y0: number }>;
  /** How many masks were computed (not served from `masks`); lets a test see a cache hit. */
  computed: number;
}
