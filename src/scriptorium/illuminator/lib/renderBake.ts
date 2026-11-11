/*
 * The bake job itself, with its canvas, loader and encoder injected so a Web
 * Worker, the main thread and a test all run the same code (see bake.ts).
 * Kept apart from bake.ts so the worker bundle does not import the file that
 * starts it.
 */
import { applySteps } from "./applySteps";
import type { LoadImage } from "./loadImage";
import { decodedSize, type DecodedImage } from "./textureOverlay";
import { baseImageUrl, hasSteps, type IlluminateSettings } from "./treatment";
import { scratchContext, type ScratchCanvas } from "./scratch";

/** Long edge a bake is capped at: effects over a 4096 px canvas are fast enough, and larger never prints better at book sizes. */
export const MAX_BAKE_EDGE = 4096;
/** Quality steps tried until the WebP fits the bucket limit. */
export const BAKE_QUALITIES: readonly number[] = [0.9, 0.8, 0.7, 0.55];

export interface BakeDeps {
  loadImage: LoadImage;
  makeCanvas: (w: number, h: number) => ScratchCanvas;
  encode: (canvas: ScratchCanvas, quality: number) => Promise<Blob>;
}

/** The pixel size a bake is rendered at: the original's, capped on its long edge. */
export function bakeSize(natural: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(1, MAX_BAKE_EDGE / Math.max(natural.width, natural.height));
  return { width: Math.max(1, Math.round(natural.width * scale)), height: Math.max(1, Math.round(natural.height * scale)) };
}

export async function renderBake(
  originalUrl: string,
  settings: IlluminateSettings,
  maxBytes: number,
  deps: BakeDeps,
): Promise<Blob> {
  if (!hasSteps(settings)) throw new Error("Nothing to bake: the picture has no edits.");
  // The base is the AI result when the recipe has one; the original is never touched.
  const original: DecodedImage = await deps.loadImage(baseImageUrl(originalUrl, settings));
  const natural = decodedSize(original);
  const { width, height } = bakeSize(natural);

  const canvas = deps.makeCanvas(width, height);
  const ctx = scratchContext(canvas);
  ctx.drawImage(original, 0, 0, width, height);
  await applySteps(ctx, width, height, settings, deps.loadImage, { sourceWidth: natural.width });

  for (const quality of BAKE_QUALITIES) {
    const blob = await deps.encode(canvas, quality);
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error("The treated picture is too large to store, even compressed.");
}
