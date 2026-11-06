/** The zoom and pan arithmetic under the Lift brush: pure, so the numbers are tested without a DOM. */
import type { Size } from "./liftGeometry";

/** Scale and the stage's top-left in the viewport, in screen pixels. */
export interface LiftView {
  scale: number;
  tx: number;
  ty: number;
}

/** How far past "fit" the picture may be enlarged. */
export const MAX_ZOOM = 8;

/** The scale at which the whole picture just fits the viewport. */
export function fitScale(viewport: Size, natural: Size): number {
  if (natural.width <= 0 || natural.height <= 0) return 1;
  return Math.min(viewport.width / natural.width, viewport.height / natural.height);
}

/** Keeps a scale between fit (1x) and MAX_ZOOM times fit. */
export function clampScale(scale: number, fit: number): number {
  return Math.max(fit, Math.min(fit * MAX_ZOOM, scale));
}

/**
 * Pans so the content never shows a gap at an edge it overflows, and sits centred on an axis it does not fill.
 * `content` is the picture at its on-screen size.
 */
export function clampPan(view: LiftView, viewport: Size, content: Size): LiftView {
  const axis = (t: number, box: number, size: number) => (size <= box ? (box - size) / 2 : Math.max(box - size, Math.min(0, t)));
  return { ...view, tx: axis(view.tx, viewport.width, content.width), ty: axis(view.ty, viewport.height, content.height) };
}

/** The view that fits and centres the picture. */
export function fitView(viewport: Size, natural: Size): LiftView {
  const scale = fitScale(viewport, natural);
  return clampPan({ scale, tx: 0, ty: 0 }, viewport, { width: natural.width * scale, height: natural.height * scale });
}

/** Zooms by `factor` keeping the picture point under `point` (viewport coordinates) where it is. */
export function zoomAbout(view: LiftView, factor: number, point: { x: number; y: number }, viewport: Size, natural: Size): LiftView {
  const scale = clampScale(view.scale * factor, fitScale(viewport, natural));
  const k = scale / view.scale;
  const moved = { scale, tx: point.x - (point.x - view.tx) * k, ty: point.y - (point.y - view.ty) * k };
  return clampPan(moved, viewport, { width: natural.width * scale, height: natural.height * scale });
}
