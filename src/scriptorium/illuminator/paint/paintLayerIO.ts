/*
 * A paint layer's pixels to and from the recipe's chunks (#1181). The recipe stores a layer as PAINT_CHUNK
 * squares of the document; the session holds it as smaller tiles. These move straight RGBA between the two for
 * one chunk, so saving renders only the chunks that changed and loading puts each stored chunk back at its place.
 * The pixel work is pure and tested in Node; the canvas wrappers at the foot are the only DOM.
 */
import { chunkKey, chunkRect, chunksForTiles } from "../lib/paintChunks";
import type { TiledLayer } from "./engine/tiledLayer";
import type { Pixels } from "./maskPixels";

/** The chunks (as "cx,cy" keys) of a layer that hold any paint. */
export function paintedChunks(layer: TiledLayer): Set<string> {
  const filled = layer.keys().filter((key) => {
    const tile = layer.tile(key);
    return tile !== undefined && !layer.isTileEmpty(tile);
  });
  return chunksForTiles(filled, layer.tileSize, layer.cols);
}

/** A chunk of the layer as straight RGBA, or null when it holds no paint at all. */
export function chunkPixels(layer: TiledLayer, cx: number, cy: number): Pixels | null {
  const rect = chunkRect(cx, cy, layer.width, layer.height);
  if (rect.w === 0 || rect.h === 0) return null;
  const data = new Uint8ClampedArray(rect.w * rect.h * 4);
  const T = layer.tileSize;
  let any = false;
  for (const tx of tileRange(rect.x, rect.w, T)) {
    for (const ty of tileRange(rect.y, rect.h, T)) {
      const tile = layer.tile(layer.key(tx, ty));
      if (!tile) continue;
      const inner = layer.tileRect(layer.key(tx, ty));
      for (let y = Math.max(inner.y, rect.y); y < Math.min(inner.y + inner.h, rect.y + rect.h); y++) {
        for (let x = Math.max(inner.x, rect.x); x < Math.min(inner.x + inner.w, rect.x + rect.w); x++) {
          const from = ((y - inner.y) * T + (x - inner.x)) * 4;
          if ((tile[from + 3] ?? 0) === 0) continue;
          const to = ((y - rect.y) * rect.w + (x - rect.x)) * 4;
          data[to] = tile[from] ?? 0;
          data[to + 1] = tile[from + 1] ?? 0;
          data[to + 2] = tile[from + 2] ?? 0;
          data[to + 3] = tile[from + 3] ?? 0;
          any = true;
        }
      }
    }
  }
  return any ? { width: rect.w, height: rect.h, data } : null;
}

/** Puts a decoded chunk into an (empty) layer at its place. The picture must be the chunk's size. */
export function fillChunk(layer: TiledLayer, cx: number, cy: number, pixels: Pixels): void {
  const rect = chunkRect(cx, cy, layer.width, layer.height);
  if (pixels.width !== rect.w || pixels.height !== rect.h) throw new Error("A saved chunk is not the size of its place.");
  const T = layer.tileSize;
  for (const tx of tileRange(rect.x, rect.w, T)) {
    for (const ty of tileRange(rect.y, rect.h, T)) {
      const key = layer.key(tx, ty);
      const inner = layer.tileRect(key);
      let tile: Uint8ClampedArray | null = layer.tile(key) ?? null;
      for (let y = Math.max(inner.y, rect.y); y < Math.min(inner.y + inner.h, rect.y + rect.h); y++) {
        for (let x = Math.max(inner.x, rect.x); x < Math.min(inner.x + inner.w, rect.x + rect.w); x++) {
          const from = ((y - rect.y) * rect.w + (x - rect.x)) * 4;
          if ((pixels.data[from + 3] ?? 0) === 0) continue;
          tile ??= layer.ensureTile(key);
          const to = ((y - inner.y) * T + (x - inner.x)) * 4;
          tile[to] = pixels.data[from] ?? 0;
          tile[to + 1] = pixels.data[from + 1] ?? 0;
          tile[to + 2] = pixels.data[from + 2] ?? 0;
          tile[to + 3] = pixels.data[from + 3] ?? 0;
        }
      }
    }
  }
}

/** Every tile index a span of pixels touches. */
function tileRange(start: number, length: number, tile: number): number[] {
  const out: number[] = [];
  for (let t = Math.floor(start / tile); t <= Math.floor((start + length - 1) / tile); t++) out.push(t);
  return out;
}

/** The URL the preview and exports use for a chunk that is not stored yet: the loader reads it off the session. */
export const VIEW_CHUNK = "view:paint:";
export const viewChunkUrl = (layerId: string, cx: number, cy: number): string => `${VIEW_CHUNK}${layerId}|${chunkKey(cx, cy)}`;

/** Which chunk of which layer a view URL names, or null when it is not one. */
export function parseViewChunk(url: string): { layerId: string; cx: number; cy: number } | null {
  if (!url.startsWith(VIEW_CHUNK)) return null;
  const [layerId, key] = url.slice(VIEW_CHUNK.length).split("|");
  const m = /^(\d+),(\d+)$/.exec(key ?? "");
  return layerId && m ? { layerId, cx: Number(m[1]), cy: Number(m[2]) } : null;
}

// ---- the canvas wrappers ----

/** A chunk on a canvas of its own size, for encoding or for the preview. Null when it holds no paint. */
export function chunkCanvas(layer: TiledLayer, cx: number, cy: number): HTMLCanvasElement | null {
  const pixels = chunkPixels(layer, cx, cy);
  return pixels ? pixelsCanvas(pixels) : null;
}

export function pixelsCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser gave no 2d canvas context to draw the painting with.");
  ctx.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  return canvas;
}

/** A stored chunk read back as straight RGBA at the size its place wants. */
export function decodePixels(source: CanvasImageSource, width: number, height: number): Pixels {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The browser gave no 2d canvas context to read the painting with.");
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}
