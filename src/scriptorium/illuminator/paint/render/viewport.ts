/*
 * The painting canvas's zoom and pan, as pure maths (#1181). A viewport maps document pixels to the stage's CSS
 * pixels: screen = document * scale + offset. The stage multiplies by devicePixelRatio only when it draws.
 */
import type { ZoomTarget } from "@/lib/canvasControls/zoomKeys";

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 32;
/** One press of a zoom-in or zoom-out key. */
export const ZOOM_STEP = 1.25;
const FIT_PADDING = 16;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function docToScreen(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * vp.scale + vp.offsetX, y: y * vp.scale + vp.offsetY };
}

export function screenToDoc(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: (x - vp.offsetX) / vp.scale, y: (y - vp.offsetY) / vp.scale };
}

/** The whole document, centred in the view with a little margin. */
export function fitViewport(doc: Size, view: Size, padding: number = FIT_PADDING): Viewport {
  const availW = view.width - padding * 2;
  const availH = view.height - padding * 2;
  if (availW <= 0 || availH <= 0 || doc.width <= 0 || doc.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = clampScale(Math.min(availW / doc.width, availH / doc.height));
  return centred(scale, doc, view);
}

function centred(scale: number, doc: Size, view: Size): Viewport {
  return { scale, offsetX: (view.width - doc.width * scale) / 2, offsetY: (view.height - doc.height * scale) / 2 };
}

/** Zooms by `factor`, keeping the document point under the screen point (sx, sy) where it is. */
export function zoomAbout(vp: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = clampScale(vp.scale * factor);
  const under = screenToDoc(vp, sx, sy);
  return { scale, offsetX: sx - under.x * scale, offsetY: sy - under.y * scale };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy };
}

/** What the shared zoom keys ask for: a step about the view's centre, fit, or one document pixel per CSS pixel. */
export function zoomToTarget(vp: Viewport, target: ZoomTarget, doc: Size, view: Size): Viewport {
  if (target === "fit") return fitViewport(doc, view);
  if (target === "actual") return centred(1, doc, view);
  return zoomAbout(vp, target === "in" ? ZOOM_STEP : 1 / ZOOM_STEP, view.width / 2, view.height / 2);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A two-finger pinch: the document point that was under the fingers' midpoint when the pinch began stays under
 * the midpoint as it moves, and the scale follows the distance between the fingers.
 */
export function pinchViewport(start: Viewport, startA: Point, startB: Point, a: Point, b: Point): Viewport {
  const startDist = Math.hypot(startB.x - startA.x, startB.y - startA.y);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = startDist > 0 ? clampScale(start.scale * (dist / startDist)) : start.scale;
  const startMid = { x: (startA.x + startB.x) / 2, y: (startA.y + startB.y) / 2 };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const under = screenToDoc(start, startMid.x, startMid.y);
  return { scale, offsetX: mid.x - under.x * scale, offsetY: mid.y - under.y * scale };
}
