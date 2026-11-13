/*
 * The picture's mask between the paint engine and the recipe (#1181). The recipe's mask step is a picture whose
 * alpha is "erased to the paper", stretched over the canvas; the session holds the same thing as tiles. These
 * move the alpha between the two, at the session's document size. The pixel work is pure and tested in Node;
 * the canvas wrappers below are the only DOM.
 */
import { TiledLayer } from "./engine/tiledLayer";

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Fills an (empty) mask layer from a picture's alpha. Rows are read at `pixels.width`, which must match the layer. */
export function fillMaskFromPixels(mask: TiledLayer, pixels: Pixels): void {
  if (pixels.width !== mask.width || pixels.height !== mask.height) throw new Error("The mask picture is not the size of the mask layer.");
  const T = mask.tileSize;
  for (let ty = 0; ty < mask.rows; ty++) {
    for (let tx = 0; tx < mask.cols; tx++) {
      const rect = mask.tileRect(mask.key(tx, ty));
      let tile: Uint8ClampedArray | null = null;
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const a = pixels.data[((rect.y + y) * pixels.width + rect.x + x) * 4 + 3] ?? 0;
          if (a === 0) continue;
          tile ??= new Uint8ClampedArray(T * T * 4);
          const o = (y * T + x) * 4;
          tile[o] = 255;
          tile[o + 1] = 255;
          tile[o + 2] = 255;
          tile[o + 3] = a;
        }
      }
      if (tile) mask.setTile(mask.key(tx, ty), tile);
    }
  }
}

/** The mask as straight RGBA, white with the mask's alpha: what the recipe's mask step stores. */
export function maskToPixels(mask: TiledLayer): Pixels {
  const data = new Uint8ClampedArray(mask.width * mask.height * 4);
  const T = mask.tileSize;
  for (const key of mask.keys()) {
    const tile = mask.tile(key);
    if (!tile) continue;
    const rect = mask.tileRect(key);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const a = tile[(y * T + x) * 4 + 3] ?? 0;
        if (a === 0) continue;
        const o = ((rect.y + y) * mask.width + rect.x + x) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = a;
      }
    }
  }
  return { width: mask.width, height: mask.height, data };
}

/** True when the mask erases anything at all. */
export function maskHasPaint(mask: TiledLayer): boolean {
  return mask.keys().length > 0;
}

/** A saved mask picture decoded into an empty mask layer, stretched to the layer's size. */
export function loadMaskFromImage(mask: TiledLayer, source: CanvasImageSource): void {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The browser gave no 2d canvas context to read the mask with.");
  ctx.drawImage(source, 0, 0, mask.width, mask.height);
  const { width, height, data } = ctx.getImageData(0, 0, mask.width, mask.height);
  fillMaskFromPixels(mask, { width, height, data });
}

/** The mask on a canvas at its own size, ready to encode or to hand the preview as the mask step's picture. */
export function maskToCanvas(mask: TiledLayer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser gave no 2d canvas context to draw the mask with.");
  const { data } = maskToPixels(mask);
  ctx.putImageData(new ImageData(data, mask.width, mask.height), 0, 0);
  return canvas;
}
