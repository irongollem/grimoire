/**
 * The geometry under "Lift" (Book Nook, #1142): draw round a thing in the room's picture, cut it out, paint the
 * gap behind it. Everything here is pure arithmetic over rectangles and RGBA bytes, so the canvas code that
 * feeds it is thin and the numbers are tested without a DOM.
 */
import type { Rect } from "./scene.ts";

/** The share of the drawn rectangle's size added on every side, so the model sees context round the thing. */
export const LIFT_PAD = 0.08;
/** Pixels the mask grows past the cut-out's edge, so the fill covers the fringe the cut leaves. */
export const MASK_GROW = 6;
/** A pixel at or above this alpha belongs to the lifted thing. */
export const OPAQUE = 128;
/** An upload with any pixel below this alpha already has a transparent background. */
export const SOLID = 250;

export interface Size {
  width: number;
  height: number;
}

/** A rectangle from two corners, in any order, clamped to the image and rounded to whole pixels. */
export function rectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }, image: Size): Rect {
  const x0 = clamp(Math.min(a.x, b.x), 0, image.width);
  const y0 = clamp(Math.min(a.y, b.y), 0, image.height);
  const x1 = clamp(Math.max(a.x, b.x), 0, image.width);
  const y1 = clamp(Math.max(a.y, b.y), 0, image.height);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** Moves the rectangle by `dx`, `dy` without letting it leave the image. */
export function nudgeRect(rect: Rect, dx: number, dy: number, image: Size): Rect {
  return { ...rect, x: clamp(rect.x + dx, 0, image.width - rect.w), y: clamp(rect.y + dy, 0, image.height - rect.h) };
}

/** Grows (or shrinks) the rectangle's far corner by `dw`, `dh`, staying inside the image and at least `min` wide. */
export function resizeRect(rect: Rect, dw: number, dh: number, image: Size, min = 8): Rect {
  return {
    ...rect,
    w: clamp(rect.w + dw, Math.min(min, image.width - rect.x), image.width - rect.x),
    h: clamp(rect.h + dh, Math.min(min, image.height - rect.y), image.height - rect.y),
  };
}

/** The drawn rectangle widened by `pad` of its size on every side, clamped to the room's picture. */
export function paddedCrop(rect: Rect, room: Size, pad = LIFT_PAD): Rect {
  const x0 = Math.max(0, Math.floor(rect.x - rect.w * pad));
  const y0 = Math.max(0, Math.floor(rect.y - rect.h * pad));
  const x1 = Math.min(room.width, Math.ceil(rect.x + rect.w + rect.w * pad));
  const y1 = Math.min(room.height, Math.ceil(rect.y + rect.h + rect.h * pad));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** True when any pixel is see-through: the upload already has a background cut away. `rgba` is canvas ImageData bytes. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < SOLID) return true;
  return false;
}

/** The tightest rectangle round the opaque pixels, or null when there are none. */
export function alphaBounds(rgba: ArrayLike<number>, width: number, height: number): Rect | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < OPAQUE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The fill's mask, as RGBA bytes: transparent where the model repaints (the lifted thing, grown by `grow`
 * pixels each way so no fringe survives) and opaque everywhere else.
 */
export function maskFromAlpha(part: ArrayLike<number>, width: number, height: number, grow = MASK_GROW): Uint8ClampedArray<ArrayBuffer> {
  let hit = new Uint8Array(width * height);
  for (let i = 0; i < hit.length; i++) hit[i] = part[i * 4 + 3] >= OPAQUE ? 1 : 0;
  hit = dilate(hit, width, height, grow);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < hit.length; i++) out[i * 4 + 3] = hit[i] ? 0 : 255;
  return out;
}

/** A square dilation, done as a horizontal pass then a vertical one. */
function dilate(src: Uint8Array<ArrayBuffer>, width: number, height: number, r: number): Uint8Array<ArrayBuffer> {
  if (r <= 0) return src;
  const across = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!src[y * width + x]) continue;
      for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++) across[y * width + k] = 1;
    }
  }
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!across[y * width + x]) continue;
      for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) out[k * width + x] = 1;
    }
  }
  return out;
}

/**
 * Where the lifted thing sits in the room, in the scene's own units: its bounds inside the crop, moved by the
 * crop's origin, then scaled from the picture's natural pixels to the room's (`scale` is 1 unless the scene's
 * room is a different size from the picture file).
 */
export function partRect(bounds: Rect, crop: Rect, scale = 1): Rect {
  return { x: (crop.x + bounds.x) * scale, y: (crop.y + bounds.y) * scale, w: bounds.w * scale, h: bounds.h * scale };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
