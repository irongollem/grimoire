/*
 * The geometry of the workbench's crop box (#1176 story 9c). Pure.
 *
 * The box is a rectangle in fractions of the base picture. A drag is reported
 * in the same fractions (pixels moved over the displayed size), and `imageAspect`
 * (width over height of the base) turns a fixed shape such as 3:2 into the
 * fractions that keep it, since a square in fractions is not a square picture.
 */
import { MIN_CROP } from "./treatment";

export interface CropRect { x: number; y: number; w: number; h: number }
export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
export type CropShape = "free" | "1:1" | "4:3" | "3:2" | "16:9" | "page";

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const RATIOS: Record<Exclude<CropShape, "free" | "page">, number> = { "1:1": 1, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9 };

/** Width over height a shape asks for, or null for Free (and for the page's shape when there is no page). */
export function shapeRatio(shape: CropShape, pageAspect: number | null): number | null {
  if (shape === "free") return null;
  if (shape === "page") return pageAspect;
  return RATIOS[shape];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The largest box of `ratio` inside `rect`, centred on it. */
export function fitRatio(rect: CropRect, ratio: number, imageAspect: number): CropRect {
  const widthPx = rect.w * imageAspect;
  const heightPx = rect.h;
  const keptWidth = widthPx / heightPx > ratio ? heightPx * ratio : widthPx;
  const keptHeight = widthPx / heightPx > ratio ? heightPx : widthPx / ratio;
  const w = keptWidth / imageAspect;
  const h = keptHeight;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

/** A box dragged by `handle` by (dx, dy) fractions. It stays inside the picture, never thinner than MIN_CROP, and keeps `ratio` when given. */
export function dragCrop(rect: CropRect, handle: CropHandle, dx: number, dy: number, ratio: number | null, imageAspect: number): CropRect {
  if (handle === "move") {
    return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
  }

  const isCorner = handle.length === 2;
  if (ratio !== null && isCorner) return dragCorner(rect, handle, dx, dy, ratio, imageAspect);

  const left = handle.includes("w");
  const right = handle.includes("e");
  const top = handle.includes("n");
  const bottom = handle.includes("s");
  const x1 = left ? clamp(rect.x + dx, 0, rect.x + rect.w - MIN_CROP) : rect.x;
  const x2 = right ? clamp(rect.x + rect.w + dx, rect.x + MIN_CROP, 1) : rect.x + rect.w;
  const y1 = top ? clamp(rect.y + dy, 0, rect.y + rect.h - MIN_CROP) : rect.y;
  const y2 = bottom ? clamp(rect.y + rect.h + dy, rect.y + MIN_CROP, 1) : rect.y + rect.h;
  const free = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  // An edge dragged while a shape is set still keeps it: the box shrinks to fit the shape.
  return ratio === null ? free : fitRatio(free, ratio, imageAspect);
}

function dragCorner(rect: CropRect, handle: CropHandle, dx: number, dy: number, ratio: number, imageAspect: number): CropRect {
  const left = handle.includes("w");
  const top = handle.includes("n");
  // The opposite corner stays where it is.
  const anchorX = left ? rect.x + rect.w : rect.x;
  const anchorY = top ? rect.y + rect.h : rect.y;
  const pointX = (left ? rect.x : rect.x + rect.w) + dx;
  const pointY = (top ? rect.y : rect.y + rect.h) + dy;

  // Height in fractions for a width in fractions, at this shape.
  const k = imageAspect / ratio;
  let w = Math.abs(pointX - anchorX);
  let h = Math.abs(pointY - anchorY);
  if (w * k > h) h = w * k;
  else w = h / k;
  if (w <= 0) {
    w = MIN_CROP;
    h = w * k;
  }

  const roomW = left ? anchorX : 1 - anchorX;
  const roomH = top ? anchorY : 1 - anchorY;
  const shrink = Math.min(1, roomW / w, roomH / h);
  w *= shrink;
  h *= shrink;

  // Not thinner than MIN_CROP on either side, as long as the room allows.
  const grow = Math.max(1, MIN_CROP / w, MIN_CROP / h);
  w = Math.min(w * grow, roomW, roomH / k);
  h = w * k;

  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h };
}
