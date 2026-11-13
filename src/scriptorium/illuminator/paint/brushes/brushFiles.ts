import { ASSET_IMAGES_BUCKET, removeStorageImages } from "@/composables/useImageUpload";
import { uploadToBucket } from "@/lib/storage";
import { encodeWebp } from "@/lib/webpEncode";
import type { GrainImage, TipImage } from "../engine/types";

/*
 * A painter's tips and grains as files (#1181). Named `brush-...` under the painter's own id, so the
 * Illuminator's sweep, which only takes `ill-` files, leaves them alone. Quality 1 asks the encoder for its best:
 * a tip's coverage rides in the alpha channel, which WebP keeps exactly, and the colour under it is black.
 */
export interface BrushFileDeps {
  encodeTip(tip: TipImage): Promise<Blob>;
  encodeGrain(grain: GrainImage): Promise<Blob>;
  /** Stores one encoded picture for this painter and returns its URL. */
  upload(blob: Blob, userId: string): Promise<string>;
  remove(urls: readonly string[]): Promise<void>;
}

export const brushFilePath = (userId: string, random: string = crypto.randomUUID().slice(0, 12)) => `${userId}/brush-${random}.webp`;

function canvasOf(width: number, height: number, fill: (data: Uint8ClampedArray) => void): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  const img = ctx.createImageData(width, height);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const browserBrushFiles: BrushFileDeps = {
  encodeTip: (tip) =>
    encodeWebp(
      canvasOf(tip.width, tip.height, (d) => {
        for (let i = 0; i < tip.alpha.length; i++) d[i * 4 + 3] = tip.alpha[i];
      }),
      1,
    ),
  encodeGrain: (grain) =>
    encodeWebp(
      canvasOf(grain.width, grain.height, (d) => {
        for (let i = 0; i < grain.value.length; i++) {
          const v = grain.value[i];
          d[i * 4] = v;
          d[i * 4 + 1] = v;
          d[i * 4 + 2] = v;
          d[i * 4 + 3] = 255;
        }
      }),
      1,
    ),
  async upload(blob, userId) {
    const url = await uploadToBucket({ bucket: "assetImages", blob, path: brushFilePath(userId), contentType: "image/webp" });
    if (!url) throw new Error("Could not store the brush picture.");
    return url;
  },
  remove: (urls) => removeStorageImages(ASSET_IMAGES_BUCKET, ...urls),
};
