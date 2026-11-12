/*
 * The paper tear (#1176 story 9): an irregular outline on each chosen side, a
 * band of lighter paper fibres along it and a soft shadow where the sheet
 * lifts. It sits beside the classic edge as a second `edges.style`.
 *
 * How it is built, side by side:
 *  - Each side gets a 1D fractal outline, sampled on that side's own 0..1
 *    coordinate (not in pixels). A 900 px preview and a 4000 px bake therefore
 *    tear the same way; only the sampling density differs. Depth, fibre width
 *    and shadow size are fractions of the picture's short side for the same
 *    reason.
 *  - The four outlines give a signed distance per pixel (positive = inside the
 *    paper). Alpha is that distance, antialiased over about one pixel.
 *  - A band just inside the outline, ragged by per-pixel noise, is blended
 *    toward paper white: the torn fibres.
 *  - The shadow is the outline's silhouette, blurred with `ctx.filter` and
 *    drawn offset under the picture.
 *
 * The output keeps the input's size: the picture keeps its box. On each torn
 * side the outline starts `reach` pixels inside the box, and the shadow lives
 * in that margin, so it is never cut off by the canvas edge. A side that is
 * not torn keeps the picture to the box edge.
 */
import { makeScratchCanvas, scratchContext, type ScratchCanvas } from "./scratch";

export interface PaperSideOptions {
  enabled: boolean;
  /** 0-1: how ragged the outline is (fine detail and amplitude). */
  roughness: number;
  /** 0-1: how far the tear reaches into the picture (up to 6.1% of the short side). */
  depth: number;
  /** 0-1: width of the pale fibre band along the tear. */
  fibres: number;
  /** 0-1: size and weight of the lift shadow. */
  shadow: number;
}

export interface PaperEdgeOptions {
  top: PaperSideOptions;
  right: PaperSideOptions;
  bottom: PaperSideOptions;
  left: PaperSideOptions;
}

export const DEFAULT_PAPER_SIDE: PaperSideOptions = {
  enabled: false,
  roughness: 0.6,
  depth: 0.4,
  fibres: 0.5,
  shadow: 0.5,
};

export type PaperSide = "top" | "right" | "bottom" | "left";
export const PAPER_SIDES: readonly PaperSide[] = ["top", "right", "bottom", "left"];

/** Paper white the fibres fade toward, and the warm brown of the shadow. */
const FIBRE_RGB: readonly [number, number, number] = [250, 245, 232];
const FIBRE_MIX = 0.75;
const SHADOW_RGB: readonly [number, number, number] = [60, 40, 20];
/** Shadow opacity at full strength. */
const SHADOW_ALPHA = 0.7;

// ─── Seeded noise ───────────────────────────────────────────────────────────

/** A 32-bit integer hash of two integers and a seed, mapped to 0..1. */
function hash01(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Smooth value noise in -1..1 at lattice coordinate x. */
function valueNoise(x: number, octave: number, seed: number): number {
  const i = Math.floor(x);
  const t = smooth(x - i);
  const a = hash01(i, octave, seed) * 2 - 1;
  const b = hash01(i + 1, octave, seed) * 2 - 1;
  return a * (1 - t) + b * t;
}

const OCTAVES = 6;
const BASE_CELLS = 8;
const LACUNARITY = 2.3;

/** Fractal noise at u in 0..1, normalised to about -1..1. Depends on u, roughness and the seed only. */
function fbm(u: number, roughness: number, seed: number): number {
  const persistence = 0.35 + 0.25 * clamp01(roughness);
  let amp = 1;
  let cells = BASE_CELLS;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < OCTAVES; o++) {
    sum += amp * valueNoise(u * cells, o, seed);
    norm += amp;
    amp *= persistence;
    cells *= LACUNARITY;
  }
  return sum / norm;
}

// ─── Geometry ───────────────────────────────────────────────────────────────

export interface PaperGeometry {
  /** Mean tear depth, px. */
  depthPx: number;
  /** Width of the fibre band, px. */
  bandPx: number;
  shadowBlurPx: number;
  /** The shadow falls down and right: dx 0.6 and dy 0.8 of the blur. */
  shadowDx: number;
  shadowDy: number;
}

/** Every size is a fraction of the picture's short side. */
export function paperGeometry(short: number, side: PaperSideOptions): PaperGeometry {
  const shadowBlurPx = clamp01(side.shadow) * short * 0.0143;
  return {
    // The panel defaults (depth 0.45, fibres 0.55, shadow 0.5) give, at 700 px:
    // a tear 19 px deep on average, a 5.5 px fibre band and a 5 px shadow blur,
    // the look of the approved prototype.
    depthPx: clamp01(side.depth) * short * 0.061,
    bandPx: clamp01(side.fibres) * short * 0.0143,
    shadowBlurPx,
    shadowDx: shadowBlurPx * 0.6,
    shadowDy: shadowBlurPx * 0.8,
  };
}

/** Bottom and right outlines keep a margin the shadow falls into; top and left need none. */
function shadowReach(side: PaperSide, g: PaperGeometry): number {
  if (g.shadowBlurPx <= 0) return 0;
  return side === "bottom" ? Math.ceil(g.shadowDy + g.shadowBlurPx) : side === "right" ? Math.ceil(g.shadowDx + g.shadowBlurPx) : 0;
}

const SIDE_SALT: Record<PaperSide, number> = { top: 11, right: 23, bottom: 37, left: 53 };

/** The seed one side's outline draws from. */
export function sideSeed(seed: number, side: PaperSide): number {
  return (seed | 0) * 7919 + SIDE_SALT[side];
}

/**
 * How far inside the box a side's outline sits, in pixels, at `n` evenly spaced
 * points along the side. Normalised to the side's 0..1 coordinate: the value at
 * u, divided by the short side, is the same whatever n and the size are.
 */
export function tearOutline(n: number, short: number, side: PaperSideOptions, seed: number, which: PaperSide): Float32Array {
  const g = paperGeometry(short, side);
  const { depthPx } = g;
  const reach = shadowReach(which, g);
  const rough = clamp01(side.roughness);
  const s = sideSeed(seed, which);
  const out = new Float32Array(n);
  const last = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const wobble = fbm(i / last, rough, s);
    // A mean depth with a wobble that grows with roughness (about 0.86 of the
    // depth at the default); never outside the box.
    out[i] = reach + Math.max(0, depthPx * (1 + (0.5 + 0.6 * rough) * wobble));
  }
  return out;
}

// ─── Pixels ─────────────────────────────────────────────────────────────────

/**
 * Cut the torn outline into RGBA `data` in place: alpha follows the signed
 * distance, and the fibre band is blended toward paper white. Pure, so it is
 * tested without a canvas. Returns the silhouette (alpha 0..255 per pixel) the
 * shadow is drawn from.
 */
export function tearPixels(data: Uint8ClampedArray, w: number, h: number, opts: PaperEdgeOptions, seed: number): Uint8ClampedArray {
  const short = Math.min(w, h);
  const lengths: Record<PaperSide, number> = { top: w, bottom: w, left: h, right: h };
  const outline: Partial<Record<PaperSide, Float32Array>> = {};
  let band = 0;
  for (const side of PAPER_SIDES) {
    const o = opts[side];
    if (!o.enabled) continue;
    outline[side] = tearOutline(lengths[side], short, o, seed, side);
    band = Math.max(band, paperGeometry(short, o).bandPx);
  }
  const silhouette = new Uint8ClampedArray(w * h);
  const { top, right, bottom, left } = outline;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d = Infinity;
      if (top) d = Math.min(d, y - top[x]);
      if (bottom) d = Math.min(d, h - 1 - y - bottom[x]);
      if (left) d = Math.min(d, x - left[y]);
      if (right) d = Math.min(d, w - 1 - x - right[y]);
      if (d === Infinity) {
        silhouette[y * w + x] = 255;
        continue;
      }
      const idx = (y * w + x) * 4;
      const cover = clamp01(d + 0.5);
      silhouette[y * w + x] = Math.round(cover * 255);
      data[idx + 3] = Math.round(data[idx + 3] * cover);
      if (d > 0 && band > 0) {
        const ragged = band * (0.7 + 0.6 * hash01(x, y, seed));
        if (d < ragged) {
          const k = FIBRE_MIX;
          data[idx] = Math.round(data[idx] * (1 - k) + FIBRE_RGB[0] * k);
          data[idx + 1] = Math.round(data[idx + 1] * (1 - k) + FIBRE_RGB[1] * k);
          data[idx + 2] = Math.round(data[idx + 2] * (1 - k) + FIBRE_RGB[2] * k);
        }
      }
    }
  }
  return silhouette;
}

/** The strongest shadow among the enabled sides. */
function strongestShadow(short: number, opts: PaperEdgeOptions): { blur: number; dx: number; dy: number; weight: number } {
  let blur = 0;
  let dx = 0;
  let dy = 0;
  let weight = 0;
  for (const side of PAPER_SIDES) {
    const o = opts[side];
    if (!o.enabled || o.shadow <= 0) continue;
    const g = paperGeometry(short, o);
    blur = Math.max(blur, g.shadowBlurPx);
    dx = Math.max(dx, g.shadowDx);
    dy = Math.max(dy, g.shadowDy);
    weight = Math.max(weight, clamp01(o.shadow));
  }
  return { blur, dx, dy, weight };
}

/** Tear the picture on `ctx` (w by h) in place. The canvas keeps its size. */
export function applyTornPaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: PaperEdgeOptions,
  seed: number,
  makeCanvas: (w: number, h: number) => ScratchCanvas = makeScratchCanvas,
): void {
  if (!PAPER_SIDES.some((s) => opts[s].enabled)) return;

  const image = ctx.getImageData(0, 0, w, h);
  const silhouette = tearPixels(image.data, w, h, opts, seed);
  const shadow = strongestShadow(Math.min(w, h), opts);

  if (shadow.weight <= 0) {
    ctx.putImageData(image, 0, 0);
    return;
  }

  // The picture on one scratch canvas, the silhouette on another, so the
  // shadow can be blurred on its own and the picture drawn sharp over it.
  const pictureCanvas = makeCanvas(w, h);
  scratchContext(pictureCanvas).putImageData(image, 0, 0);

  const shadowCanvas = makeCanvas(w, h);
  const shadowCtx = scratchContext(shadowCanvas);
  const shadowData = shadowCtx.createImageData(w, h);
  const [sr, sg, sb] = SHADOW_RGB;
  for (let i = 0; i < silhouette.length; i++) {
    const o = i * 4;
    shadowData.data[o] = sr;
    shadowData.data[o + 1] = sg;
    shadowData.data[o + 2] = sb;
    shadowData.data[o + 3] = Math.round(silhouette[i] * SHADOW_ALPHA * shadow.weight);
  }
  shadowCtx.putImageData(shadowData, 0, 0);

  ctx.clearRect(0, 0, w, h);
  ctx.filter = `blur(${shadow.blur}px)`;
  ctx.drawImage(shadowCanvas, shadow.dx, shadow.dy);
  ctx.filter = "none";
  ctx.drawImage(pictureCanvas, 0, 0);
}
