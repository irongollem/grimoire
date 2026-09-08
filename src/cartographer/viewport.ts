// Viewport maths for the cartographer canvas — zoom limits and cursor-anchored
// zooming. Pure: no Vue refs, no DOM. The view reads the cursor position off
// the event and hands plain numbers in.

/** 5%–400%: small enough to scan an 80×80 dungeon at a glance, large enough to paint tile-by-tile. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

const STEP = 1.1;

export interface Viewport {
  zoom: number;
  offset: { x: number; y: number };
}

/** One wheel notch. Negative deltaY (scroll up) zooms in. */
export function zoomStep(current: number, deltaY: number): number {
  const factor = deltaY < 0 ? STEP : 1 / STEP;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor));
}

/**
 * Zoom while keeping the world point under the cursor stationary.
 *
 * `cursor` is in CSS pixels relative to the canvas's top-left; `dpr` converts
 * that to the device-pixel space the offset is stored in.
 */
export function zoomAtPoint(vp: Viewport, cursor: { x: number; y: number }, dpr: number, deltaY: number): Viewport {
  const next = zoomStep(vp.zoom, deltaY);
  const scale = next / vp.zoom;
  const worldX = vp.offset.x + cursor.x * dpr;
  const worldY = vp.offset.y + cursor.y * dpr;
  return {
    zoom: next,
    offset: {
      x: worldX * scale - cursor.x * dpr,
      y: worldY * scale - cursor.y * dpr,
    },
  };
}
