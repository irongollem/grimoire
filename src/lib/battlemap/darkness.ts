// The darkness veil (epic #1073): what a map's ambient light level looks like on screen. Pure, so the Cartographer's
// editor preview and the battle map paint exactly the same thing.
//
// The DM's veil is translucent on purpose. The DM must still see the whole map to run it, and the veil shows what
// the players cannot see. Lights carve it by the rules (`illumination.ts`): the veil's alpha follows the light level
// at each point, and `paintLitVeil` is the one function that paints it. Story 5 gives each viewer a strength of
// their own (a player's veil is opaque where their token sees nothing) through the same function.

import type { MakeCanvas } from "@/cartographer/drawMap";
import type { DarknessLevel } from "@/types/dungeonMap.types";

/** Alpha of the DM's veil per level. Daylight has none. */
export const DM_VEIL: Record<DarknessLevel, number> = {
  daylight: 0,
  dim: 0.3,
  dark: 0.6,
};

/** A deep blue-black rather than pure black, so shadow reads as night and not as a hole in the picture. */
export const VEIL_RGB: readonly [number, number, number] = [8, 10, 24];

/** The veil's strength at a light level (0 dark .. 1 bright). Ambient dim gives `DM_VEIL.dim`, darkness `DM_VEIL.dark`. */
export function veilAlpha(level: number): number {
  return DM_VEIL.dark * (1 - level);
}

export interface VeilRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type VeilTarget = Pick<CanvasRenderingContext2D, "save" | "restore" | "drawImage" | "imageSmoothingEnabled">;

/**
 * Paint the veil over `rect` from a grid of light levels (`illuminationGrid`, `gridW` by `gridH` samples). The grid
 * becomes one small image and is drawn scaled with smoothing on, so the soft edges of each light stay soft at any
 * zoom. Returns false when nothing was drawn: an empty rect or grid, no way to make a canvas, or a grid that is
 * bright everywhere.
 */
export function paintLitVeil(
  ctx: VeilTarget,
  rect: VeilRect,
  grid: Float32Array,
  gridW: number,
  gridH: number,
  makeCanvas: MakeCanvas | undefined,
): boolean {
  if (!makeCanvas || rect.w <= 0 || rect.h <= 0 || gridW <= 0 || gridH <= 0) return false;
  const made = makeCanvas(gridW, gridH);
  if (!made) return false;
  const image = made.ctx.createImageData(gridW, gridH);
  const [r, g, b] = VEIL_RGB;
  let any = false;
  for (let i = 0; i < gridW * gridH; i++) {
    const a = Math.round(veilAlpha(grid[i]) * 255);
    if (a > 0) any = true;
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  if (!any) return false;
  made.ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(made.canvas, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  return true;
}

/** A canvas factory over the DOM canvas, for components (the editor uses `offscreenMakeCanvas`). */
export function domMakeCanvas(): MakeCanvas {
  return (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  };
}
