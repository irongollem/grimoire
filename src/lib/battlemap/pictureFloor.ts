import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { MapGrid } from "@/lib/battlemap/imageGrid";

/** Samples per side of a square: enough to tell a lit floor from the black around a building. */
export const FLOOR_SAMPLES = 4;
/** A square counts as ground when at least this share of its samples shows something. */
const SHOWN_SHARE = 0.6;
/** Below this a sample is the black (or the nothing) a map picture leaves around its rooms. Lamp-lit stone is far above it. */
const DARK = 14;

/**
 * Which squares of a picture show ground, from its pixels: a square that is almost all black or transparent is the
 * void around the rooms, not somewhere to stand. `rgba` is the picture drawn `cols * FLOOR_SAMPLES` wide and
 * `rows * FLOOR_SAMPLES` high, four bytes a sample.
 *
 * It is a guess from a picture, used only where nothing better is known (no room traced, no walls drawn): it keeps
 * a token out of the black, and says nothing about walls or furniture.
 */
export function floorFromPixels(rgba: Uint8ClampedArray, grid: MapGrid): Set<CellKey> {
  const floor = new Set<CellKey>();
  const width = grid.cols * FLOOR_SAMPLES;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      let shown = 0;
      for (let sy = 0; sy < FLOOR_SAMPLES; sy++) {
        for (let sx = 0; sx < FLOOR_SAMPLES; sx++) {
          const at = ((y * FLOOR_SAMPLES + sy) * width + x * FLOOR_SAMPLES + sx) * 4;
          const light = Math.max(rgba[at], rgba[at + 1], rgba[at + 2]);
          if (rgba[at + 3] >= 128 && light > DARK) shown += 1;
        }
      }
      if (shown >= FLOOR_SAMPLES * FLOOR_SAMPLES * SHOWN_SHARE) floor.add(cellKey(x, y));
    }
  }
  return floor;
}

/**
 * Reads a map picture's ground squares in the browser. Null when the picture cannot be read (it would not load, the
 * host does not allow its pixels to be read, or there is no canvas): the caller then goes without.
 */
export async function readPictureFloor(url: string, grid: MapGrid): Promise<Set<CellKey> | null> {
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("the picture did not load"));
      image.src = url;
    });
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = grid.cols * FLOOR_SAMPLES;
    canvas.height = grid.rows * FLOOR_SAMPLES;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // The grid is as wide as the picture; its last row may reach past the picture's foot, which stays empty.
    ctx.drawImage(image, 0, 0, canvas.width, canvas.width * (image.naturalHeight / image.naturalWidth));
    return floorFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, grid);
  } catch {
    return null;
  }
}
