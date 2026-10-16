// Map lights (step one of map lighting): the pure part. A thing that gives light
// lays a soft additive glow of its colour on what is around it. The drawing
// lives in drawMap.ts; this is the arithmetic and the colour string, kept apart
// so it is tested without a canvas.
//
// No vue and no DOM globals at module scope.

import { DEFAULT_LIGHT_INTENSITY, FEET_PER_CELL, type TileLight } from "@/cartographer/packSchema";

/**
 * How the glow falls off. The rules' radii decide what can be seen, but a glow painted at full strength across a
 * torch's 20 feet of bright light washes a whole room in its colour (Black Rock, 16 Oct 2026). So the colour is
 * strongest at the flame and falls away fast: `near` of the intensity a quarter of the way to the bright edge,
 * `edge` of it at the bright edge, then fading to nothing through the dim ring. Making the
 * unlit dark is the darkness layer's job (#1073), not the glow's.
 */
export const LIGHT_FALLOFF = { near: 0.55, edge: 0.22 } as const;
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
 * The colour stops of a light's radial gradient, over its whole reach (see `LIGHT_FALLOFF`). A dim-only light starts
 * at `DIM_ONLY_KEEP` and fades the whole way; a light with no dim ring ends at its bright edge.
 */
export function lightStops(light: TileLight): [number, string][] {
  const intensity = light.intensity === undefined ? DEFAULT_LIGHT_INTENSITY : light.intensity;
  const at = (alpha: number): string => lightRgba(light.color, alpha);
  if (light.bright === 0) return [[0, at(intensity * DIM_ONLY_KEEP)], [0.3, at(intensity * DIM_ONLY_KEEP * 0.4)], [1, at(0)]];
  const edge = light.bright / (light.bright + light.dim);
  const near = edge / 4;
  if (light.dim === 0) return [[0, at(intensity)], [near, at(intensity * LIGHT_FALLOFF.near)], [1, at(intensity * LIGHT_FALLOFF.edge)]];
  return [[0, at(intensity)], [near, at(intensity * LIGHT_FALLOFF.near)], [edge, at(intensity * LIGHT_FALLOFF.edge)], [1, at(0)]];
}
