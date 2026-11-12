import type { TipImage } from "../engine/types";
import type { PreviewPixels } from "../render/brushPreview";
import { PREVIEW_INK } from "./previewPaper";

/** A tip as ink on a see-through ground, nearest-neighbour fitted to `edge` square, for a preview canvas over paper. */
export function tipSwatch(tip: TipImage, edge = 192): PreviewPixels {
  const k = Math.max(tip.width, tip.height) / edge;
  const data = new Uint8ClampedArray(edge * edge * 4);
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const sx = Math.floor(x * k);
      const sy = Math.floor(y * k);
      const o = (y * edge + x) * 4;
      data[o] = PREVIEW_INK.r;
      data[o + 1] = PREVIEW_INK.g;
      data[o + 2] = PREVIEW_INK.b;
      data[o + 3] = sx < tip.width && sy < tip.height ? tip.alpha[sy * tip.width + sx] : 0;
    }
  }
  return { width: edge, height: edge, data };
}
