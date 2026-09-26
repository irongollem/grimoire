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

/** A two-finger touch, as the canvas sees it: where the fingers' midpoint is
 *  (CSS pixels, canvas-relative) and how far apart they are. */
export interface Pinch {
  mid: { x: number; y: number };
  dist: number;
}

/**
 * The viewport for a two-finger pan-and-pinch, measured from where the
 * gesture started rather than step by step, so rounding never accumulates.
 *
 * The world point that was under the fingers' midpoint when they landed stays
 * under the midpoint as it moves (the pan), and the zoom scales with how far
 * the fingers have spread (the pinch), clamped to the usual range.
 */
export function pinchViewport(start: Viewport, from: Pinch, now: Pinch, dpr: number): Viewport {
  const spread = from.dist > 0 ? now.dist / from.dist : 1;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.zoom * spread));
  const scale = zoom / start.zoom;
  const worldX = start.offset.x + from.mid.x * dpr;
  const worldY = start.offset.y + from.mid.y * dpr;
  return {
    zoom,
    offset: {
      x: worldX * scale - now.mid.x * dpr,
      y: worldY * scale - now.mid.y * dpr,
    },
  };
}

/** The midpoint and spread of two touch points. */
export function pinchOf(a: { x: number; y: number }, b: { x: number; y: number }): Pinch {
  return {
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dist: Math.hypot(a.x - b.x, a.y - b.y),
  };
}
