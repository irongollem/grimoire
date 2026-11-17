import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { MapGrid } from "@/lib/battlemap/imageGrid";

/** Samples per side of a square: enough to tell a lit floor from the black around a building. */
export const FLOOR_SAMPLES = 4;
/** A square counts as ground when at least this share of its samples shows something. */
const SHOWN_SHARE = 0.6;
/** Below this a sample is the black (or the nothing) a map picture leaves around its rooms. Lamp-lit stone is far above it. */
const DARK = 14;

/** A surround darker than this is taken for the nothing around a building; a lighter rim is likely ground running off the picture. */
const SURROUND_DARK = 90;
/** Above this share of the whole picture, the rim's colour is the place itself and not something around it. */
const SURROUND_MOST = 0.8;
/** How close (summed over red, green and blue) a sample must be to the surround's colour to count as surround. */
const SURROUND_NEAR = 30;

/**
 * The colour a picture is drawn on, when it has one: the middle colour of its outermost samples, if that is dark.
 * Many maps sit on a dark slate or a gridded grey, not on black (seen live: creatures were stood out on the slate
 * around a house, and a walk was routed across it). Null when the rim is light, which is ground reaching the edge.
 */
function surroundOf(rgba: Uint8ClampedArray, width: number, height: number): [number, number, number] | null {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const take = (x: number, y: number): void => {
    const at = (y * width + x) * 4;
    if (rgba[at + 3] < 128) return;
    reds.push(rgba[at]);
    greens.push(rgba[at + 1]);
    blues.push(rgba[at + 2]);
  };
  for (let x = 0; x < width; x++) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    take(0, y);
    take(width - 1, y);
  }
  if (reds.length === 0) return null;
  const middle = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const colour: [number, number, number] = [middle(reds), middle(greens), middle(blues)];
  if (Math.max(...colour) >= SURROUND_DARK) return null;
  // A picture that is mostly that colour is not a building on a surround: it is a dark place filling the frame.
  let alike = 0;
  const samples = width * height;
  for (let at = 0; at < samples * 4; at += 4) {
    if (Math.abs(rgba[at] - colour[0]) + Math.abs(rgba[at + 1] - colour[1]) + Math.abs(rgba[at + 2] - colour[2]) <= SURROUND_NEAR) alike += 1;
  }
  return alike / samples > SURROUND_MOST ? null : colour;
}

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
  const surround = surroundOf(rgba, width, grid.rows * FLOOR_SAMPLES);
  const isSurround = (at: number): boolean =>
    surround !== null &&
    Math.abs(rgba[at] - surround[0]) + Math.abs(rgba[at + 1] - surround[1]) + Math.abs(rgba[at + 2] - surround[2]) <= SURROUND_NEAR;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      let shown = 0;
      for (let sy = 0; sy < FLOOR_SAMPLES; sy++) {
        for (let sx = 0; sx < FLOOR_SAMPLES; sx++) {
          const at = ((y * FLOOR_SAMPLES + sy) * width + x * FLOOR_SAMPLES + sx) * 4;
          const light = Math.max(rgba[at], rgba[at + 1], rgba[at + 2]);
          if (rgba[at + 3] >= 128 && light > DARK && !isSurround(at)) shown += 1;
        }
      }
      if (shown >= FLOOR_SAMPLES * FLOOR_SAMPLES * SHOWN_SHARE) floor.add(cellKey(x, y));
    }
  }
  return floor;
}

/** Every square of the grid that is not ground, as the squares nothing can stand on or walk through. */
export function voidAround(floor: ReadonlySet<CellKey>, grid: MapGrid): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) if (!floor.has(cellKey(x, y))) out.add(`${x},${y}`);
  return out;
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
