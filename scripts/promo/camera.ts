/**
 * The camera, as plain arithmetic: where it looks at any moment of a shot, and
 * the ffmpeg `zoompan` expressions that make it so. Kept free of ffmpeg and
 * the browser so it can be tested.
 *
 * Everything is in device pixels. The canvas is the screen plus paper around
 * it, shaped like the Reel's window so a view of it always fills the window.
 * A view is the part of the canvas the window shows.
 */

import type { CameraKeyframe } from "./types";

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export type { CameraKeyframe } from "./types";

/** The screen sat on a paper canvas of the window's shape. */
export interface Canvas extends Size {
  /** Where the screen's top-left corner sits on the canvas. */
  screenX: number;
  screenY: number;
}

/** A glide between two views takes this long. */
export const GLIDE = 0.7;
/** The camera never looks closer than this many times the full view. */
export const MAX_ZOOM = 2.6;
/** Default breathing room around a target, as a share of its longer side. */
export const PADDING_RATIO = 0.08;
/** Breathing room is never less than this, so a tiny target is not framed edge to edge. */
export const MIN_PADDING = 24;

const even = (n: number) => 2 * Math.round(n / 2);

/** The smallest canvas of the window's shape that holds the screen, with the screen centred. */
export function canvasFor(screen: Size, window: Size): Canvas {
  const aspect = window.width / window.height;
  let width = screen.width;
  let height = even(screen.width / aspect);
  if (height < screen.height) {
    height = screen.height;
    width = even(screen.height * aspect);
  }
  return { width, height, screenX: even((width - screen.width) / 2), screenY: even((height - screen.height) / 2) };
}

/** Eases 0..1 to 0..1 with a soft start and end. */
export function smoothstep(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
}

/** The view the camera rests on for a target (screen coordinates), in canvas coordinates. `null` is the whole canvas. */
export function viewFor(target: Rect | null, canvas: Canvas, padding?: number): Rect {
  const full: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (target === null) return full;
  const aspect = canvas.width / canvas.height;
  const pad = Math.max(MIN_PADDING, padding ?? PADDING_RATIO * Math.max(target.width, target.height));
  const wantW = target.width + 2 * pad;
  const wantH = target.height + 2 * pad;
  // As wide as the target needs, or as the shape of the window needs, but never closer than the readable limit.
  const width = Math.min(canvas.width, Math.max(wantW, wantH * aspect, canvas.width / MAX_ZOOM));
  const height = width / aspect;
  const cx = target.x + canvas.screenX + target.width / 2;
  const cy = target.y + canvas.screenY + target.height / 2;
  // Where the screen lies on the canvas; a view that fits inside it never shows paper (a target near the screen's top does not pull the paper above it into frame).
  const [x0, x1] = width <= canvas.width - 2 * canvas.screenX ? [canvas.screenX, canvas.width - canvas.screenX] : [0, canvas.width];
  const [y0, y1] = height <= canvas.height - 2 * canvas.screenY ? [canvas.screenY, canvas.height - canvas.screenY] : [0, canvas.height];
  return {
    x: Math.min(x1 - width, Math.max(x0, cx - width / 2)),
    y: Math.min(y1 - height, Math.max(y0, cy - height / 2)),
    width,
    height,
  };
}

/**
 * The view the camera rests on when nothing is being pointed at. A screen that
 * fills the window's shape (a phone, a tablet) rests on the whole canvas. A
 * wide screen (a laptop) would shrink to a strip with paper above and below,
 * unreadable on a phone, so it rests on a "fill" view instead: the window's
 * full height over the screen's full height, as wide as the window's shape
 * makes it, starting `leftInset` device pixels in (the sidebar's width) so the
 * page's own column and its heading are what the viewer sees first.
 */
export function homeView(canvas: Canvas, screen: Size, leftInset = 0): Rect {
  const full: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (canvas.height - screen.height <= 2) return full;
  const aspect = canvas.width / canvas.height;
  const width = Math.min(canvas.width, screen.height * aspect);
  return {
    x: Math.min(canvas.width - width, Math.max(0, canvas.screenX + leftInset)),
    y: canvas.screenY,
    width,
    height: screen.height,
  };
}

/** One stretch of the camera's movement: it glides from `from` towards `to` from `t0`, cut short at `t1` if the next move starts first. */
export interface Glide {
  t0: number;
  t1: number;
  from: Rect;
  to: Rect;
}

/** Turns keyframes into glides. Each starts from wherever the camera is when it begins, so a cut-short glide never jumps. */
export function planCamera(
  keyframes: CameraKeyframe[],
  canvas: Canvas,
  home: Rect = viewFor(null, canvas),
  homeWithInset?: (inset: number) => Rect,
): Glide[] {
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const glides: Glide[] = [];
  let resting = home;
  sorted.forEach((k, i) => {
    const t0 = k.t;
    const next = sorted[i + 1]?.t;
    const t1 = next === undefined ? t0 + GLIDE : Math.min(t0 + GLIDE, next);
    const glide: Glide = { t0, t1, from: resting, to: k.overview ? viewFor(null, canvas) : k.rect === null ? (k.homeInset !== undefined && homeWithInset ? homeWithInset(k.homeInset) : home) : viewFor(k.rect, canvas, k.padding) };
    glides.push(glide);
    resting = lerpRect(glide.from, glide.to, smoothstep((t1 - t0) / GLIDE));
  });
  return glides;
}

function lerpRect(a: Rect, b: Rect, u: number): Rect {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    width: a.width + (b.width - a.width) * u,
    height: a.height + (b.height - a.height) * u,
  };
}

/** Where the camera looks at time `t`: still between glides, easing during one. */
export function viewAt(glides: Glide[], canvas: Canvas, t: number, home: Rect = viewFor(null, canvas)): Rect {
  let resting = home;
  for (const g of glides) {
    if (t < g.t0) return g.from;
    const eased = lerpRect(g.from, g.to, smoothstep((t - g.t0) / GLIDE));
    if (t < g.t1) return eased;
    resting = lerpRect(g.from, g.to, smoothstep((g.t1 - g.t0) / GLIDE));
  }
  return resting;
}

const num = (n: number) => String(Math.round(n * 1e4) / 1e4);

/** smoothstep of the glide's progress at input time `it`, as an ffmpeg expression (commas escaped for the filter graph). */
function easedAt(g: Glide): string {
  const u = `clip((it-${num(g.t0)})/${GLIDE}\\,0\\,1)`;
  return `(${u}*${u}*(3-2*${u}))`;
}

/** One zoompan option: still before each glide, easing during it, and `rest` after the last. */
function expression(glides: Glide[], rest: string, pick: (r: Rect) => number): string {
  let expr = rest;
  for (let i = glides.length - 1; i >= 0; i--) {
    const g = glides[i];
    const [a, b] = [num(pick(g.from)), num(pick(g.to))];
    expr = `if(lt(it\\,${num(g.t0)})\\,${a}\\,if(lt(it\\,${num(g.t1)})\\,${a}+(${b}-${a})*${easedAt(g)}\\,${expr}))`;
  }
  return expr;
}

/**
 * The `z`, `x` and `y` options for ffmpeg's zoompan over the canvas, evaluated on the input time `it`.
 * Zoom is the canvas width over the view's width, so a view that is the whole canvas is zoom 1.
 */
export function zoompanExpressions(glides: Glide[], canvas: Canvas, home: Rect = viewFor(null, canvas)): { z: string; x: string; y: string } {
  const last = glides[glides.length - 1];
  const rest = last ? lerpRect(last.from, last.to, smoothstep((last.t1 - last.t0) / GLIDE)) : home;
  return {
    z: `${canvas.width}/(${expression(glides, num(rest.width), (r) => r.width)})`,
    x: expression(glides, num(rest.x), (r) => r.x),
    y: expression(glides, num(rest.y), (r) => r.y),
  };
}
