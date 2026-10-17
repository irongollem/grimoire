// The darkness veil (epic #1073): what a map's ambient light level looks like on screen. Pure, so the Cartographer's
// editor preview and the battle map paint exactly the same thing.
//
// The DM's veil is translucent on purpose. The DM must still see the whole map to run it, and the veil shows what
// the players cannot see. Lights carve it by the rules (`illumination.ts`): the veil's alpha follows the light level
// at each point, and `paintLitVeil` is the one function that paints it. A player's veil (`paintPlayerVeil`) is
// built from what their tokens see instead, and is opaque where nothing is seen.

import type { MakeCanvas } from "@/cartographer/drawFrame";
import { FEET_PER_CELL } from "@/cartographer/packSchema";
import type { DarknessZone } from "@/lib/battlemap/illumination";
import { playerVeilAlpha, type Vision } from "@/lib/battlemap/vision";
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
 * A grid of per-sample values as one small RGBA image in the veil's colour, `alphaOf` giving each sample's alpha
 * (0..1). Null when there is no way to make a canvas or when every sample is clear, so callers draw nothing.
 */
function veilImage(
  grid: Float32Array,
  gridW: number,
  gridH: number,
  alphaOf: (value: number) => number,
  makeCanvas: MakeCanvas | undefined,
): CanvasImageSource | null {
  if (!makeCanvas || gridW <= 0 || gridH <= 0) return null;
  const made = makeCanvas(gridW, gridH);
  if (!made) return null;
  const image = made.ctx.createImageData(gridW, gridH);
  const [r, g, b] = VEIL_RGB;
  let any = false;
  for (let i = 0; i < gridW * gridH; i++) {
    const a = Math.round(alphaOf(grid[i]) * 255);
    if (a > 0) any = true;
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  if (!any) return null;
  made.ctx.putImageData(image, 0, 0);
  return made.canvas;
}

/** Draw a small image over `rect` with smoothing on, so the soft edges stay soft at any zoom. */
function drawSmoothed(ctx: VeilTarget, image: CanvasImageSource, rect: VeilRect): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

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
  if (rect.w <= 0 || rect.h <= 0) return false;
  const image = veilImage(grid, gridW, gridH, veilAlpha, makeCanvas);
  if (!image) return false;
  drawSmoothed(ctx, image, rect);
  return true;
}

/** A picture the player veil may show in grey where darkvision sees: already loaded, with where it is drawn. */
export interface GreyImage {
  image: CanvasImageSource;
  rect: VeilRect;
}

/** The grey layer is built at most this many px on its long side: darkvision is a murky view, not a sharp one. */
const GREY_MAX_PX = 2048;

type GreyTarget = Pick<CanvasRenderingContext2D, "drawImage" | "filter" | "globalCompositeOperation" | "imageSmoothingEnabled" | "save" | "restore">;

/**
 * Where darkvision sees only shades of grey, the map's own pictures drawn in grey, masked by `grey`. Returns the
 * layer as a canvas over `rect`, or null when no sample is grey or there is nothing to draw.
 */
function greyLayer(
  rect: VeilRect,
  grey: Float32Array,
  gridW: number,
  gridH: number,
  makeCanvas: MakeCanvas,
  images: readonly GreyImage[],
): CanvasImageSource | null {
  if (images.length === 0) return null;
  const mask = veilImage(grey, gridW, gridH, (v) => v, makeCanvas);
  if (!mask) return null;
  const scale = Math.min(1, GREY_MAX_PX / Math.max(rect.w, rect.h));
  const outW = Math.max(1, Math.round(rect.w * scale));
  const outH = Math.max(1, Math.round(rect.h * scale));
  const made = makeCanvas(outW, outH);
  if (!made) return null;
  const ctx: GreyTarget = made.ctx;
  ctx.save();
  ctx.filter = "grayscale(1)";
  for (const { image, rect: at } of images) {
    ctx.drawImage(image, (at.x - rect.x) * scale, (at.y - rect.y) * scale, at.w * scale, at.h * scale);
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mask, 0, 0, outW, outH);
  ctx.restore();
  return made.canvas;
}

/**
 * Paint what a player's tokens see (`vision.ts`): first the grey of darkvision, the stack's own pictures drawn in
 * grey where `grey` is set, then the veil over it at `playerVeilAlpha(seen)` (opaque where nothing is seen). Without
 * `greyImages` (not loaded yet) the veil is drawn on its own. Returns false when nothing was drawn.
 */
export function paintPlayerVeil(
  ctx: VeilTarget,
  rect: VeilRect,
  vision: Vision,
  gridW: number,
  gridH: number,
  makeCanvas: MakeCanvas | undefined,
  greyImages: readonly GreyImage[],
): boolean {
  if (!makeCanvas || rect.w <= 0 || rect.h <= 0) return false;
  const grey = greyLayer(rect, vision.grey, gridW, gridH, makeCanvas, greyImages);
  if (grey) drawSmoothed(ctx, grey, rect);
  const veil = veilImage(vision.seen, gridW, gridH, playerVeilAlpha, makeCanvas);
  if (veil) drawSmoothed(ctx, veil, rect);
  return grey !== null || veil !== null;
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

/** The id of the topmost (latest placed) sphere holding the point, or null when it is in none. */
export function zoneIdAt<T extends DarknessZone & { id: string }>(zones: readonly T[], x: number, y: number): string | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (Math.hypot(x - z.x, y - z.y) <= z.radius / FEET_PER_CELL) return z.id;
  }
  return null;
}

type RingTarget = Pick<CanvasRenderingContext2D, "save" | "restore" | "beginPath" | "arc" | "stroke" | "setLineDash"> & {
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
};

/** The DM's view of each sphere of magical darkness: a dashed ring on its edge. `originX/Y` is host px of image cell (0,0). */
export function paintZoneRings(
  ctx: RingTarget,
  zones: readonly DarknessZone[],
  originX: number,
  originY: number,
  cellPx: number,
): void {
  if (zones.length === 0 || cellPx <= 0) return;
  ctx.save();
  ctx.strokeStyle = "rgba(196, 181, 253, 0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  for (const z of zones) {
    ctx.beginPath();
    ctx.arc(originX + z.x * cellPx, originY + z.y * cellPx, (z.radius / FEET_PER_CELL) * cellPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
