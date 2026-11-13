/*
 * The picture the paint sits on (#1181): the recipe rendered at the document's size, without its mask step.
 * The mask is the Eraser's work and the compositor cuts it out of this picture itself, live, so baking it in
 * here would erase twice. Everything else the recipe says (crop, grading, edges, wash) is in the picture, so
 * paint lies over the finished look.
 */
import { applySteps } from "../lib/applySteps";
import { croppedSize, drawBase } from "../lib/crop";
import type { LoadImage } from "../lib/loadImage";
import { makeScratchCanvas, scratchContext } from "../lib/scratch";
import type { IlluminateSettings } from "../lib/treatment";

export async function renderPaintPicture(
  image: HTMLImageElement,
  size: { width: number; height: number },
  recipe: IlluminateSettings,
  loader: LoadImage,
): Promise<HTMLCanvasElement> {
  const canvas = makeScratchCanvas(size.width, size.height);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Painting needs a canvas on the page.");
  const ctx = scratchContext(canvas);
  const withoutMask: IlluminateSettings = { ...recipe, steps: recipe.steps.filter((s) => s.type !== "mask") };
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  drawBase(ctx, image, natural, withoutMask, size.width, size.height);
  try {
    await applySteps(ctx, size.width, size.height, withoutMask, loader, { sourceWidth: croppedSize(natural, withoutMask).width });
  } catch {
    // A texture that cannot load leaves the rest of the picture drawn, as in the preview.
  }
  return canvas;
}
