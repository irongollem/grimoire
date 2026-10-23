// Viewport maths for the cartographer canvas — zoom limits, cursor-anchored
// zooming, panning and fitting. Pure: no Vue refs, no DOM. The view reads the cursor position off
// the event and hands plain numbers in.

/** 5%–400%: small enough to scan an 80×80 dungeon at a glance, large enough to paint tile-by-tile. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export interface CanvasViewport {
  zoom: number;
  offset: { x: number; y: number };
}

/**
 * Multiply the zoom by `factor`, keeping the world point under `cursor` still.
 *
 * The scale applied to the offset comes from the clamped zoom, not the asked-for
 * one, so hitting a limit never drags the map sideways.
 */
export function zoomByFactor(vp: CanvasViewport, cursor: { x: number; y: number }, dpr: number, factor: number): CanvasViewport {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
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

/**
 * Move the view the way a scroll does: positive deltas (scrolling down or
 * right) carry the view further along the map. Deltas are CSS pixels; the
 * offset is stored in device pixels.
 */
export function panBy(vp: CanvasViewport, dxCss: number, dyCss: number, dpr: number): CanvasViewport {
  return { zoom: vp.zoom, offset: { x: vp.offset.x + dxCss * dpr, y: vp.offset.y + dyCss * dpr } };
}

/** Inclusive cell bounds of everything painted. */
export interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The inclusive bounds of a set of "x,y" cell keys; null when there are none. */
export function boundsOfCells(keys: Iterable<string>): CellBounds | null {
  let bounds: CellBounds | null = null;
  for (const key of keys) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    bounds = bounds
      ? { minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y), maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y) }
      : { minX: x, minY: y, maxX: x, maxY: y };
  }
  return bounds;
}

/**
 * Zoom and centre so every painted cell, plus `margin` empty cells on each
 * side, fits the canvas. An empty map gets zoom 1 centred on the origin cell,
 * matching what "centre" does.
 */
export function fitViewport(
  bbox: CellBounds | null,
  canvasCss: { width: number; height: number },
  dpr: number,
  baseTile: number,
  margin = 1,
): CanvasViewport {
  const cx = bbox ? (bbox.minX + bbox.maxX + 1) / 2 : 0.5;
  const cy = bbox ? (bbox.minY + bbox.maxY + 1) / 2 : 0.5;
  let zoom = 1;
  if (bbox) {
    const cellsW = bbox.maxX - bbox.minX + 1 + margin * 2;
    const cellsH = bbox.maxY - bbox.minY + 1 + margin * 2;
    // dpr cancels: both the canvas and a cell are scaled by it.
    const fit = Math.min(canvasCss.width / (cellsW * baseTile), canvasCss.height / (cellsH * baseTile));
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
  }
  const tilePx = baseTile * zoom * dpr;
  return {
    zoom,
    offset: {
      x: cx * tilePx - (canvasCss.width * dpr) / 2,
      y: cy * tilePx - (canvasCss.height * dpr) / 2,
    },
  };
}

/** Back to 100%, keeping whatever is at the canvas centre where it is. */
export function actualSizeViewport(vp: CanvasViewport, canvasCss: { width: number; height: number }, dpr: number): CanvasViewport {
  return zoomByFactor(vp, { x: canvasCss.width / 2, y: canvasCss.height / 2 }, dpr, 1 / vp.zoom);
}

/** One keyboard zoom step, anchored at the canvas centre. */
export const KEY_ZOOM_FACTOR = 1.25;

export function stepZoom(vp: CanvasViewport, canvasCss: { width: number; height: number }, dpr: number, dir: "in" | "out"): CanvasViewport {
  const factor = dir === "in" ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR;
  return zoomByFactor(vp, { x: canvasCss.width / 2, y: canvasCss.height / 2 }, dpr, factor);
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
export function pinchViewport(start: CanvasViewport, from: Pinch, now: Pinch, dpr: number): CanvasViewport {
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
