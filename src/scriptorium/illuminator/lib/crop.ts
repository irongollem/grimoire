/*
 * Cutting a recipe's crop out of its base picture (#1176 story 9c).
 *
 * The crop is a recipe step, but it changes the canvas, which applySteps does
 * not own: every renderer (the bake, the page preview, the workbench, print)
 * sizes its canvas with croppedSize(), draws the base with drawBase(), and
 * only then runs the other steps over the cropped picture. One rule here, so
 * they cannot disagree about what size a cropped picture is.
 *
 * Pure but for drawBase's canvas call.
 */
import type { DecodedImage } from "./textureOverlay";
import type { CropStep, IlluminateSettings } from "./treatment";

export type Size = { width: number; height: number };

/** The crop a recipe holds, if it has one. */
export function cropOf(settings: IlluminateSettings | null): CropStep | null {
  const step = settings?.steps.find((s): s is CropStep => s.type === "crop");
  return step ?? null;
}

/** The part of a picture of `natural` size the crop keeps, in its pixels (whole picture when there is none). */
export function cropPixels(natural: Size, crop: CropStep | null): { sx: number; sy: number; sw: number; sh: number } {
  if (!crop) return { sx: 0, sy: 0, sw: natural.width, sh: natural.height };
  const sx = Math.round(crop.x * natural.width);
  const sy = Math.round(crop.y * natural.height);
  // Never a zero-pixel side, and never past the picture's edge.
  const sw = Math.max(1, Math.min(natural.width - sx, Math.round(crop.w * natural.width)));
  const sh = Math.max(1, Math.min(natural.height - sy, Math.round(crop.h * natural.height)));
  return { sx, sy, sw, sh };
}

/** The size the picture is after the crop: what the bake, the page and print all come out at. */
export function croppedSize(natural: Size, settings: IlluminateSettings | null): Size {
  const { sw, sh } = cropPixels(natural, cropOf(settings));
  return { width: sw, height: sh };
}

/** Draw the kept part of `base` over the whole of a `w` by `h` canvas. */
export function drawBase(ctx: CanvasRenderingContext2D, base: DecodedImage, natural: Size, settings: IlluminateSettings | null, w: number, h: number): void {
  const { sx, sy, sw, sh } = cropPixels(natural, cropOf(settings));
  ctx.drawImage(base, sx, sy, sw, sh, 0, 0, w, h);
}
