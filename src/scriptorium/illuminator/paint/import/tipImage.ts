import type { GrainImage, TipImage } from "../engine/types";
import { ImportError, type ImportLimits } from "./types";

/** Refuse an image before allocating for it; a header can claim any size. */
export function checkDimensions(width: number, height: number, limits: ImportLimits): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ImportError("A brush image has no size.");
  }
  if (width * height > limits.maxPixels) throw new ImportError("A brush image is too large to import.");
}

/** Box-average down so the long side is at most `max`; a smaller image comes back as it is. */
export function fitImage(
  data: Uint8Array,
  width: number,
  height: number,
  max: number,
): { width: number; height: number; data: Uint8Array } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height, data };
  const scale = max / long;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.ceil(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.ceil(((x + 1) * width) / w));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += data[yy * width + xx];
          n++;
        }
      }
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return { width: w, height: h, data: out };
}

export function makeTip(coverage: Uint8Array, width: number, height: number, limits: ImportLimits): TipImage {
  const fit = fitImage(coverage, width, height, limits.maxTipSide);
  return { width: fit.width, height: fit.height, alpha: fit.data };
}

export function makeGrain(value: Uint8Array, width: number, height: number, limits: ImportLimits): GrainImage {
  const fit = fitImage(value, width, height, limits.maxTipSide);
  return { width: fit.width, height: fit.height, value: fit.data };
}

export function invertInPlace(data: Uint8Array): Uint8Array {
  for (let i = 0; i < data.length; i++) data[i] = 255 - data[i];
  return data;
}
