/*
 * The one pipeline (#1176 story 9). A recipe (IlluminateSettings) is applied to
 * a canvas the same way for the live preview, the full-resolution bake in a
 * Worker and the print redraw: grade, depth of field, texture, vignette, edges,
 * the paper wash, the mask, then the painted layers. The crop is the one step it does not draw: it sets the canvas
 * the others run on (crop.ts). The texture sits under the vignette on purpose, so the
 * vignette darkens it too, and the mask erases last.
 *
 * Steps run in that order whatever order the recipe lists them in
 * (normaliseSettings). An `ai` step is not drawn: it is the picture the steps are
 * drawn over (baseImageUrl).
 */
import { applyColourGrading } from "./colourGrading";
import { applyDofBlur } from "./dofBlur";
import { drawBase, croppedSize } from "./crop";
import { applyEdgeTreatmentToCtx } from "./edgeTreatment";
import { chunkRect, parseChunkKey } from "./paintChunks";
import { applyPaperWash } from "./paperWash";
import { loadDomImage, type LoadImage } from "./loadImage";
import { applyTextureOverlay, decodedSize } from "./textureOverlay";
import { applyTornPaper } from "./tornPaper";
import { normaliseSettings, type IlluminateSettings } from "./treatment";
import { applyVignette } from "./vignette";

export interface ApplyStepsOptions {
  /**
   * Width of the picture's original in pixels. The canvas may be a preview or a
   * print-sized redraw; the texture grain is scaled by canvas width over this,
   * so it keeps its size relative to the picture. Omit when the canvas is full size.
   */
  sourceWidth?: number;
}

export async function applySteps(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  settings: IlluminateSettings,
  loadImage: LoadImage,
  options: ApplyStepsOptions = {},
): Promise<void> {
  const sizeFactor = options.sourceWidth ? w / options.sourceWidth : 1;

  for (const step of normaliseSettings(settings).steps) {
    switch (step.type) {
      case "grade":
        applyColourGrading(ctx, w, h, step.options);
        break;
      case "dof":
        applyDofBlur(ctx, w, h, { ...step.options, enabled: true });
        break;
      case "texture": {
        const texture = await loadImage(step.url);
        applyTextureOverlay(ctx, w, h, { enabled: true, blendMode: step.blendMode, opacity: step.opacity, scale: step.scale }, texture, sizeFactor);
        break;
      }
      case "vignette":
        applyVignette(ctx, w, h, { ...step.options, enabled: true });
        break;
      case "edges":
        if (step.style === "paper") applyTornPaper(ctx, w, h, step, settings.seed);
        else applyEdgeTreatmentToCtx(ctx, w, h, step);
        break;
      case "wash":
        applyPaperWash(ctx, w, h, step);
        break;
      case "mask": {
        // The mask is painted where the picture is erased.
        const mask = await loadImage(step.url);
        const size = decodedSize(mask);
        if (size.width > 0 && size.height > 0) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.drawImage(mask, 0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
        }
        break;
      }
      case "paint": {
        // Chunks of one layer never overlap, so each is drawn straight onto the picture with the layer's blend and
        // opacity: the same pixels as compositing the layer whole, without a document-sized scratch canvas.
        const sx = w / step.width;
        const sy = h / step.height;
        for (const layer of step.layers) {
          if (!layer.visible || layer.opacity <= 0) continue;
          const chunks = await Promise.all(
            Object.entries(layer.chunks).flatMap(([key, url]) => {
              const at = parseChunkKey(key);
              return at ? [loadImage(url).then((image) => ({ at, image }))] : [];
            }),
          );
          ctx.globalCompositeOperation = layer.blend;
          ctx.globalAlpha = layer.opacity;
          for (const { at, image } of chunks) {
            const rect = chunkRect(at.cx, at.cy, step.width, step.height);
            if (rect.w > 0 && rect.h > 0) ctx.drawImage(image, rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
        break;
      }
      case "ai":
        // Its output is the base the caller drew first (baseImageUrl), not a layer.
        break;
      case "crop":
        // Already cut out by whoever drew the base (drawBase): the canvas is the cropped size.
        break;
    }
  }
}

/** Run a recipe over an image at its natural size and export a PNG (the Illuminator's download, copy and save). */
export async function processImage(
  image: HTMLImageElement,
  settings: IlluminateSettings,
  loadImage: LoadImage = loadDomImage,
): Promise<Blob> {
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const { width: w, height: h } = croppedSize(natural, settings);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  drawBase(ctx, image, natural, settings, w, h);

  await applySteps(ctx, w, h, settings, loadImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png");
  });
}
