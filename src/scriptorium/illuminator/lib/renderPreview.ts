/*
 * A quick, small render of a recipe for the page (#1176 story 9b).
 *
 * After a panel edit the full bake takes seconds (a Worker, an upload), but the
 * page should change within a moment. This draws the same recipe over the
 * original at a fraction of the size, through the same pipeline as the bake
 * (applySteps), and hands back a PNG the page can show until the bake lands.
 * It is never stored.
 */
import { applySteps } from "./applySteps";
import { croppedSize, drawBase } from "./crop";
import { loadDomImage, type LoadImage } from "./loadImage";
import { baseImageUrl, type IlluminateSettings } from "./treatment";

/** Long edge of a page preview: sharp enough at the page's display size, cheap enough to redo as a slider moves. */
export const PAGE_PREVIEW_EDGE = 720;

export async function renderPreviewBlob(
  originalUrl: string,
  settings: IlluminateSettings,
  loadImage: LoadImage = loadDomImage,
): Promise<Blob> {
  const image = await loadDomImage(baseImageUrl(originalUrl, settings));
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const kept = croppedSize(natural, settings);
  const scale = Math.min(1, PAGE_PREVIEW_EDGE / Math.max(kept.width, kept.height));
  const w = Math.max(1, Math.round(kept.width * scale));
  const h = Math.max(1, Math.round(kept.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  drawBase(ctx, image, natural, settings, w, h);
  await applySteps(ctx, w, h, settings, loadImage, { sourceWidth: kept.width });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The preview could not be drawn."))), "image/png");
  });
}
