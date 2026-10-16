// The darkness veil (epic #1073): what a map's ambient light level looks like on screen. Pure, so the Cartographer's
// editor preview and the battle map paint exactly the same thing.
//
// The DM's veil is translucent on purpose. The DM must still see the whole map to run it, and the veil shows what
// the players cannot see. Story 4 carves lights out of the veil (paint, then punch holes where light reaches) and
// story 5 gives each viewer a strength of their own (a player's veil is opaque where their token sees nothing), so
// both extend `paintVeil` through its arguments rather than replace it.

import type { DarknessLevel } from "@/types/dungeonMap.types";

/** Alpha of the DM's veil per level. Daylight has none. */
export const DM_VEIL: Record<DarknessLevel, number> = {
  daylight: 0,
  dim: 0.3,
  dark: 0.6,
};

/** A deep blue-black rather than pure black, so shadow reads as night and not as a hole in the picture. */
export const VEIL_RGB: readonly [number, number, number] = [8, 10, 24];

/** The veil's fill colour at the DM's strength, or null when the level casts none (daylight). */
export function veilFill(level: DarknessLevel, alpha: number = DM_VEIL[level]): string | null {
  if (alpha <= 0) return null;
  const [r, g, b] = VEIL_RGB;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface VeilRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Paint the veil over `rect`. Returns false when the level casts none and nothing was drawn. */
export function paintVeil(
  ctx: Pick<CanvasRenderingContext2D, "save" | "restore" | "fillRect" | "fillStyle">,
  rect: VeilRect,
  level: DarknessLevel,
  alpha: number = DM_VEIL[level],
): boolean {
  const fill = veilFill(level, alpha);
  if (fill === null || rect.w <= 0 || rect.h <= 0) return false;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return true;
}
