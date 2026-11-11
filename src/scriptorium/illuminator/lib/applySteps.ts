/*
 * The one pipeline (#1176 story 9). A recipe (IlluminateSettings) is applied to
 * a canvas the same way for the live preview, the full-resolution bake in a
 * Worker and the print redraw: grade, depth of field, texture, vignette, edges,
 * then the mask. The texture sits under the vignette on purpose, so the
 * vignette darkens it too, and the mask erases last.
 *
 * Steps run in that order whatever order the recipe lists them in
 * (normaliseSettings). An `ai` step is typed but not applied yet.
 */
import { applyColourGrading } from "./colourGrading";
import { applyDofBlur } from "./dofBlur";
import { applyEdgeTreatmentToCtx } from "./edgeTreatment";
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
      case "ai":
        // Not applied yet: a later story stores an AI edit's output here.
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
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.drawImage(image, 0, 0, w, h);

  await applySteps(ctx, w, h, settings, loadImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png");
  });
}
