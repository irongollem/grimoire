/*
 * The paper wash (#1176, repainted with the paint engine in #1181): a painting runs to every edge of the page and
 * the text sits on a brushed wash of paper painted over it. Wherever the brush went the picture is erased, so the
 * page's paper shows through. The wash is real brushwork: strokes laid with the engine's stock brushes (a dry
 * drag on `dry-brush`, a wet sweep on `flat-bristle` and `round-wash`) onto a mask layer, with pressure running
 * out along each stroke so a dry edge breaks into streaks and a wet one fades soft. Faint light and dark streaks
 * are painted inside the erased area with a soft brush at low flow.
 *
 * It is painted once on a reference document: the picture's own shape scaled so its long side is at most
 * REFERENCE_LONG pixels (a thumbnail preview paints smaller, never bigger), with every brush size, path and grain
 * scale a fraction of the picture. Preview, bake and print therefore draw the same wash, and the mask is upscaled
 * with smoothing to the size asked for. Painting the mask at reference size, not at a 4096 px bake's, is what
 * keeps the bake within a couple of seconds.
 *
 * Deterministic from step.seed (no Math.random). The brush art loads through the pipeline's injected loader.
 */
import { loadPaintAssets, type PaintAssetStore, type PixelDecoder } from "../paint/assets/loadPaintAssets";
import { STOCK_BRUSHES } from "../paint/brushes/stockBrushes";
import { DEFAULT_PRESSURE_CURVE } from "../paint/engine/pressure";
import { createRng } from "../paint/engine/rng";
import { beginStroke } from "../paint/engine/stroke";
import { TiledLayer } from "../paint/engine/tiledLayer";
import type { BrushPreset, PenSample, PaintAssets } from "../paint/engine/types";
import type { LoadImage } from "./loadImage";
import { decodedSize } from "./textureOverlay";
import { makeScratchCanvas, scratchContext } from "./scratch";
import type { WashStep } from "./treatment";

/** The long side of the reference document the wash is painted on. */
export const REFERENCE_LONG = 2048;
/** The live preview's reference long side (`draft`): the same composition for a fraction of the cost, since every size is a fraction of the picture. Bake and print never use it. */
export const DRAFT_REFERENCE_LONG = 768;

const EDGE_WANDER = 0.2;

/** Smooth 1-D noise over 0 to 1. */
function noise1(r: () => number, n: number): (x: number) => number {
  const pts = Array.from({ length: n + 1 }, () => r());
  return (x) => {
    const i = Math.floor(x * n);
    const f = x * n - i;
    const a = pts[Math.max(0, Math.min(n, i))];
    const b = pts[Math.max(0, Math.min(n, i + 1))];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

// ─── Brushes ────────────────────────────────────────────────────────────────

function stock(id: string): BrushPreset {
  const found = STOCK_BRUSHES.find((b) => b.id === id);
  if (!found) throw new Error(`stock brush ${id} is missing`);
  return found;
}

/**
 * The wash's variants of the stock brushes. A dry brush runs out of paint with pressure (its stock flow is
 * steady, which suits a painter's hand but not a stroke that must break up); every brush paints plain, without
 * a blend, since the wash only wants coverage.
 */
function washBrushes(refLong: number) {
  // The grain is a fixed share of the picture, so its tooth is the same size at every reference resolution.
  const grainScale = 1024 / refLong;
  const dry = stock("dry-brush");
  const bristle = stock("flat-bristle");
  const wet = stock("round-wash");
  const soft = stock("soft-round");
  return {
    dry: {
      ...dry,
      tip: { ...dry.tip, spacing: 0.008 },
      // A little turn on every dab, so the comb's teeth never line up into rows of dots along a long sweep.
      shape: dry.shape && { ...dry.shape, angle: { ...dry.shape.angle, jitter: 0.012 } },
      grain: dry.grain && { ...dry.grain, depth: 0.2, scale: grainScale },
      transfer: { ...dry.transfer, flowDynamics: { jitter: 0.2, control: "pressure" as const, minimum: 0 } },
    },
    bristle: { ...bristle, tip: { ...bristle.tip, spacing: 0.05 }, transfer: { ...bristle.transfer, flow: 0.5 } },
    wet: { ...wet, blend: "normal" as const, tip: { ...wet.tip, spacing: 0.06 } },
    // The body: a broad even sweep that must cover fully.
    body: { ...soft, tip: { ...soft.tip, source: { kind: "round" as const, hardness: 0.85 }, spacing: 0.12 }, transfer: { ...soft.transfer, flow: 1 } },
    // The streaks: a broad soft swipe, low flow, its tip squashed so it reads as a bristle swipe.
    streak: { ...soft, tip: { ...soft.tip, roundness: 0.45, followDirection: true, spacing: 0.1 }, transfer: { ...soft.transfer, flow: 0.12 } },
  };
}

/** One pass of the brush along a path, as pen samples (a pen, so pressure counts). */
function samplesAlong(x0: number, y0: number, len: number, angle: number, bow: number, pressureAt: (t: number) => number, step: number): PenSample[] {
  const n = Math.max(2, Math.ceil(len / step));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: PenSample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const along = t * len;
    const across = Math.sin(t * Math.PI) * bow;
    out.push({
      x: x0 + along * cos - across * sin,
      y: y0 + along * sin + across * cos,
      pressure: pressureAt(t),
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      time: i * 8,
      pointer: "pen",
    });
  }
  return out;
}

interface Lay {
  layer: TiledLayer;
  assets: PaintAssets;
  rng: () => number;
}

function paintStroke(lay: Lay, brush: BrushPreset, size: number, opacity: number, samples: PenSample[], flow?: number): void {
  const stroke = beginStroke(
    lay.layer,
    {
      brush,
      colour: { r: 0, g: 0, b: 0 },
      mode: "paint",
      seed: Math.floor(lay.rng() * 4294967296),
      curve: DEFAULT_PRESSURE_CURVE,
      overrides: { size, opacity, flow },
    },
    lay.assets,
  );
  stroke.add(samples);
  stroke.end();
}

/** A layer's alpha as one byte per pixel. */
function alphaOf(layer: TiledLayer): Uint8ClampedArray {
  const out = new Uint8ClampedArray(layer.width * layer.height);
  for (const key of layer.keys()) {
    const tile = layer.tile(key);
    if (!tile) continue;
    const rect = layer.tileRect(key);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) out[(rect.y + y) * layer.width + rect.x + x] = tile[(y * layer.tileSize + x) * 4 + 3];
    }
  }
  return out;
}

// ─── The wash ───────────────────────────────────────────────────────────────

export interface WashLayers {
  w: number;
  h: number;
  /** 0 to 255 per pixel: how much of the picture the paper covers. */
  erase: Uint8ClampedArray;
  /** Light and dark brush streaks left in the erased area: their alpha. */
  light: Uint8ClampedArray;
  dark: Uint8ClampedArray;
}

/** The wash's mask layers in the reference document's local frame. */
interface LocalWash {
  Um: number;
  Vm: number;
  erase: Uint8ClampedArray;
  light: Uint8ClampedArray;
  dark: Uint8ClampedArray;
}

function paintLocal(U: number, V: number, k: number, step: WashStep, assets: PaintAssets): LocalWash {
  const Um = Math.max(8, Math.ceil(U * k));
  const Vm = Math.max(8, Math.ceil(V * k));
  const Ur = U * k;
  const Vr = V * k;
  const m = Math.min(Ur, Vr);
  const brush = m * (0.03 + 0.08 * step.brush);
  const R = m * (0.09 + 0.07 * step.brush); // how far a sweep runs past the edge
  const B = washBrushes(Math.max(Ur, Vr));

  const r = createRng(step.seed);
  const edgeAt = noise1(r, 5);
  const topAt = noise1(r, 5);
  const lobes = noise1(r, 14);
  const boundary = (v: number) => Ur * (step.reach + (edgeAt(v / Vr) - 0.5) * EDGE_WANDER + (lobes(v / Vr) - 0.5) * 0.06);
  // Where the wash starts along the side: the top of the picture stays picture.
  const top = Vr * 0.153;
  const topWander = Vr * 0.047;
  const topLine = (u: number) => top + (topAt(u / Ur) - 0.5) * topWander;
  // Strokes start well inside the edge, but never so close to the side that it is left uncovered.
  const inner = (v: number, f: number) => Math.max(boundary(v) - f * R, boundary(v) * 0.3);
  const pathStep = Math.max(2, brush * 0.3);

  const mask = new TiledLayer(Um, Vm);
  const lay: Lay = { layer: mask, assets, rng: r };

  // Solid paper well inside, its own edge hidden under the sweeps: strokes run in from the side.
  for (let v = top + R * 0.6; v < Vr + brush; v += brush * 0.7) {
    const uMax = inner(v, 1.25);
    if (uMax <= 0) continue;
    paintStroke(lay, B.body, brush * 2.2, 1, samplesAlong(-brush, v, uMax + brush, 0, 0, () => 1, pathStep * 2));
  }

  // Dry drags and wet sweeps; `dry` is the share that are drags.
  const dryShare = 0.2 + 0.75 * step.dry;
  const sweep = (x0: number, y0: number, len: number, angle: number, width: number, load: number) => {
    const dry = r() < dryShare;
    const bow = (r() - 0.5) * width * 0.3;
    if (dry) {
      // Dry: full paint at the start, running out; the end gives out earlier the drier the brush.
      const out = 0.12 + (1 - step.dry) * 0.3 + r() * 0.2;
      paintStroke(lay, B.dry, width * 1.3, load, samplesAlong(x0, y0, len, angle, bow, (t) => Math.max(out, 1 - t ** 1.6 * (1 - out)), pathStep));
    } else if (r() < 0.5) {
      paintStroke(lay, B.bristle, width, load, samplesAlong(x0, y0, len, angle, bow, (t) => 1 - 0.55 * t * t, pathStep));
    } else {
      paintStroke(lay, B.wet, width * 1.1, load, samplesAlong(x0, y0, len, angle, bow, (t) => 1 - 0.45 * t, pathStep));
    }
  };

  // Side edge: sweeps start inside and run out past the edge.
  for (let layer = 0; layer < 2; layer++) {
    for (let v = top; v < Vr + brush; v += brush * (0.16 + r() * 0.14)) {
      const len = R * (0.9 + r() * 1.4);
      const width = brush * (0.7 + r() * 0.9);
      const angle = (r() - 0.5) * 0.45;
      sweep(inner(v, 1.3) + layer * m * 0.02, v, len, angle, width, layer ? 0.75 : 1);
    }
  }
  // Top edge: sweeps pulled sideways along it, each sitting a little higher or lower.
  for (let layer = 0; layer < 3; layer++) {
    for (let u = -R; u < boundary(top) - R * 0.6; u += R * (0.5 + r() * 0.5)) {
      const len = R * (1.6 + r() * 1.6);
      const v = topLine(u) + brush * (0.1 + r() * 0.5) + layer * brush * 0.45;
      const width = brush * (0.8 + r() * 0.7);
      const angle = (r() - 0.5) * 0.25;
      sweep(u, v, len, angle, width, layer ? 0.8 : 1);
    }
  }

  // Broad sweeps inside the wash, a shade lighter and a shade darker than the paper, so it shows brushwork.
  const light = new TiledLayer(Um, Vm);
  const dark = new TiledLayer(Um, Vm);
  for (let i = 0; i < 40; i++) {
    const v = top + r() * (Vr - top);
    const u = -brush + r() * Math.max(0, inner(v, 1.5));
    const len = R * (2 + r() * 2.5);
    const width = brush * (1 + r() * 1.2);
    const angle = (r() - 0.5) * 0.5;
    const into: Lay = { layer: i % 2 ? light : dark, assets, rng: r };
    paintStroke(into, B.streak, width, 0.5, samplesAlong(u, v, len, angle, 0, (t) => 0.5 + 0.5 * Math.sin(t * Math.PI), pathStep * 2));
  }

  return { Um, Vm, erase: alphaOf(mask), light: alphaOf(light), dark: alphaOf(dark) };
}

/**
 * The wash as per-pixel layers in the picture's frame, painted with the engine from `assets` (the brush tips
 * and the grain must already be loaded). Everything is a fraction of the picture, so size does not change the look.
 */
export function paintWashLayers(w: number, h: number, step: WashStep, assets: PaintAssets, referenceLong: number = REFERENCE_LONG): WashLayers {
  const horizontal = step.from === "left" || step.from === "right";
  // The local frame: u runs from the side the paper comes in from, v along that side.
  const U = horizontal ? w : h;
  const V = horizontal ? h : w;
  const k = Math.min(1, referenceLong / Math.max(w, h));
  const local = paintLocal(U, V, k, step, assets);

  const erase = new Uint8ClampedArray(w * h);
  const light = new Uint8ClampedArray(w * h);
  const dark = new Uint8ClampedArray(w * h);
  const { Um, Vm } = local;
  const sample = (src: Uint8ClampedArray, fx: number, fy: number): number => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => src[Math.min(Vm - 1, Math.max(0, y)) * Um + Math.min(Um - 1, Math.max(0, x))];
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let u: number, v: number;
      if (step.from === "left") { u = x; v = y; }
      else if (step.from === "right") { u = w - 1 - x; v = y; }
      else if (step.from === "top") { u = y; v = x; }
      else { u = h - 1 - y; v = x; }
      // The mask's pixel centres sit at (i + 0.5) / k in picture pixels.
      const fx = (u + 0.5) * (Um / U) - 0.5;
      const fy = (v + 0.5) * (Vm / V) - 0.5;
      const i = y * w + x;
      erase[i] = sample(local.erase, fx, fy);
      light[i] = sample(local.light, fx, fy);
      dark[i] = sample(local.dark, fx, fy);
    }
  }
  return { w, h, erase, light, dark };
}

// ─── Assets ─────────────────────────────────────────────────────────────────

const stores = new WeakMap<LoadImage, Promise<PaintAssetStore>>();

/** Decodes a tip or grain through the pipeline's own loader: a scratch canvas works on the main thread and in the Worker. */
function decoderFor(loadImage: LoadImage): PixelDecoder {
  return async (url) => {
    const image = await loadImage(url);
    const { width, height } = decodedSize(image);
    const ctx = scratchContext(makeScratchCanvas(width, height));
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { width, height, data };
  };
}

/** The wash's tips and grain, loaded once per loader, so a print of many pictures fetches them once. */
export function washAssets(loadImage: LoadImage): Promise<PaintAssetStore> {
  const hit = stores.get(loadImage);
  if (hit) return hit;
  const store = loadPaintAssets({ decode: decoderFor(loadImage) });
  const ready = Promise.all([
    store.loadTip("dry-comb"),
    store.loadTip("flat-bristle"),
    store.loadTip("soft-round"),
    store.loadGrain("cold-press"),
  ]).then(() => store);
  // A failed load is not remembered, so the next picture tries again.
  ready.catch(() => stores.delete(loadImage));
  stores.set(loadImage, ready);
  return ready;
}

export interface WashOptions {
  /** Paint at DRAFT_REFERENCE_LONG, for the live preview. */
  draft?: boolean;
  /** The reference long sides to paint at, for tests that need the full/draft split without painting a 2048 px wash. Production leaves this out. */
  references?: { full: number; draft: number };
}

/** The last few washes, so a change to another step (or none) does not repaint the wash. Only preview-sized ones are kept: a bake's layers are large and used once. */
const MEMO_SIZE = 3;
const MEMO_MAX_PIXELS = 4_000_000;
const memo: { loader: LoadImage; key: string; layers: WashLayers }[] = [];

export async function washLayers(w: number, h: number, step: WashStep, loadImage: LoadImage, options: WashOptions = {}): Promise<WashLayers> {
  const references = options.references ?? { full: REFERENCE_LONG, draft: DRAFT_REFERENCE_LONG };
  const referenceLong = options.draft ? references.draft : references.full;
  const key = JSON.stringify([step.from, step.reach, step.brush, step.dry, step.seed, w, h, referenceLong]);
  const hit = memo.find((m) => m.loader === loadImage && m.key === key);
  if (hit) return hit.layers;
  const layers = paintWashLayers(w, h, step, await washAssets(loadImage), referenceLong);
  if (w * h <= MEMO_MAX_PIXELS) {
    memo.unshift({ loader: loadImage, key, layers });
    memo.length = Math.min(memo.length, MEMO_SIZE);
  }
  return layers;
}

// ─── Applying ───────────────────────────────────────────────────────────────

/** The brush streaks' two tones, as the prototype's light and dark paper. */
const LIGHT = [244, 243, 239] as const;
const DARK = [207, 205, 198] as const;
const STREAK_OPACITY = 0.3 * 0.7;

/** Lay a streak tone over a pixel (premultiplied-free), returning the new alpha. */
function laid(d: Uint8ClampedArray, o: number, a: number, sa: number, tone: readonly [number, number, number]): number {
  if (sa <= 0) return a;
  const out = sa + a * (1 - sa);
  for (let c = 0; c < 3; c++) d[o + c] = Math.round((tone[c] * sa + d[o + c] * a * (1 - sa)) / out);
  return out;
}

/** Erase the wash out of the canvas and lay the brush streaks over the paper it uncovers. */
export async function applyPaperWash(ctx: CanvasRenderingContext2D, w: number, h: number, step: WashStep, loadImage: LoadImage, options: WashOptions = {}): Promise<void> {
  const layers = await washLayers(w, h, step, loadImage, options);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const gone = layers.erase[i] / 255;
    let a = (d[o + 3] / 255) * (1 - gone);
    // Streaks only show on the paper the wash uncovers.
    a = laid(d, o, a, (layers.dark[i] / 255) * STREAK_OPACITY * gone, DARK);
    a = laid(d, o, a, (layers.light[i] / 255) * STREAK_OPACITY * gone, LIGHT);
    d[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
}
