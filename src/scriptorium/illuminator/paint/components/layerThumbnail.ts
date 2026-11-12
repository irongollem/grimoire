/*
 * A layer's thumbnail pixels (#1181): the layer sampled down to fit a square, aspect kept, so the panel can
 * show what is on it without a canvas per layer. Pure; the thumbnail component puts the pixels on screen.
 */
import type { TiledLayer } from "../engine/tiledLayer";

export interface ThumbnailPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Null when the layer has no pixels, so an empty layer shows blank rather than a transparent square. */
export function sampleThumbnail(layer: TiledLayer, size: number): ThumbnailPixels | null {
  if (layer.keys().length === 0) return null;
  const long = Math.max(layer.width, layer.height);
  const width = Math.max(1, Math.round((size * layer.width) / long));
  const height = Math.max(1, Math.round((size * layer.height) / long));
  const data = new Uint8ClampedArray(width * height * 4);
  const T = layer.tileSize;
  for (let y = 0; y < height; y++) {
    const py = Math.min(layer.height - 1, Math.floor(((y + 0.5) * layer.height) / height));
    for (let x = 0; x < width; x++) {
      const px = Math.min(layer.width - 1, Math.floor(((x + 0.5) * layer.width) / width));
      const tile = layer.tile(layer.key(Math.floor(px / T), Math.floor(py / T)));
      if (!tile) continue;
      const from = ((py % T) * T + (px % T)) * 4;
      const to = (y * width + x) * 4;
      data[to] = tile[from] ?? 0;
      data[to + 1] = tile[from + 1] ?? 0;
      data[to + 2] = tile[from + 2] ?? 0;
      data[to + 3] = tile[from + 3] ?? 0;
    }
  }
  return { width, height, data };
}
