// Map lights (step one of map lighting): the pure part. A thing that gives light
// lays a soft additive glow of its colour on what is around it. The drawing
// lives in drawMap.ts; this is the arithmetic and the colour string, kept apart
// so it is tested without a canvas.
//
// No vue and no DOM globals at module scope.

import { DEFAULT_LIGHT_INTENSITY, FEET_PER_CELL, type TileLight } from "@/cartographer/packSchema";

/** The alpha the glow keeps at the edge of the bright light, as a fraction of its intensity; it then fades through the dim ring. */
export const BRIGHT_EDGE_KEEP = 0.6;
/** A light with no bright radius starts its fade from this fraction of its intensity (glowing moss, a lit crystal). */
export const DIM_ONLY_KEEP = 0.5;

/** `#rrggbb` and an alpha become `rgba(r,g,b,a)`. The colour is validated at the source (the database check, the pack publisher). */
export function lightRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Number(alpha.toFixed(3))})`;
}

/** How far a light reaches in cells: its bright radius and its dim ring together. */
export function lightReachCells(light: TileLight): number {
  return (light.bright + light.dim) / FEET_PER_CELL;
}

/**
 * The colour stops of a light's radial gradient, over its whole reach: the bright light holds from the centre (a
 * gentle drop to `BRIGHT_EDGE_KEEP` at its edge), then the dim ring fades to nothing at the reach. A dim-only light
 * starts at `DIM_ONLY_KEEP` and fades the whole way.
 */
export function lightStops(light: TileLight): [number, string][] {
  const intensity = light.intensity === undefined ? DEFAULT_LIGHT_INTENSITY : light.intensity;
  const edge = light.bright / (light.bright + light.dim);
  if (light.bright === 0) return [[0, lightRgba(light.color, intensity * DIM_ONLY_KEEP)], [1, lightRgba(light.color, 0)]];
  if (light.dim === 0) return [[0, lightRgba(light.color, intensity)], [1, lightRgba(light.color, intensity * BRIGHT_EDGE_KEEP)]];
  return [
    [0, lightRgba(light.color, intensity)],
    [edge, lightRgba(light.color, intensity * BRIGHT_EDGE_KEEP)],
    [1, lightRgba(light.color, 0)],
  ];
}
