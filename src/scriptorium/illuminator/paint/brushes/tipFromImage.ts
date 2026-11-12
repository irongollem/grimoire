/*
 * A brush tip from a picture of a mark (#1181): a photo of a dab of ink on paper, a box drawn on the painting,
 * or one quarter of a described sheet. All three are dark marks on a lighter ground, so one function serves
 * them: it works out what the paper looks like, how dark the ink gets, and turns every pixel into how far it
 * is from paper toward ink. Light-on-dark is refused rather than inverted: a photo's dark vignette or a dark
 * painting would be read as the mark, and the painter would get a brush shaped like the background.
 */
import type { TipImage } from "../engine/types";

/** RGBA pixels, as ImageData holds them. */
export interface RgbaPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export type TipResult = { ok: true; tip: TipImage } | { ok: false; message: string };

/** The tip's long side never exceeds this; a mark is not upscaled. */
export const MAX_TIP_EDGE = 512;
/** Paper minus ink, in luminance steps, below which there is no mark to speak of. */
const MIN_CONTRAST = 24;
/** The faintest coverage that counts as part of the mark when finding its box. */
const MARK_FLOOR = 32;
/** Paper noise below this share of the paper-to-ink range is not ink. */
const DEADBAND = 0.06;
/** The share of an edge that must be inked for the mark to count as touching it. */
const EDGE_SHARE = 0.05;
/** The ink is the darkest tenth of a percent: a small dab in a big photo still counts, a few specks of dust do not. */
const INK_PERCENTILE = 0.001;

export const NO_MARK = "No mark was found. Use a dark mark on lighter paper, with the paper filling the edges.";
export const NOT_ON_PAPER = "The mark runs off every edge. Take the picture further back, so the mark sits on paper with room around it.";

function luminance(d: ArrayLike<number>, o: number): number {
  return 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function tipFromImage(px: RgbaPixels): TipResult {
  const { width, height, data } = px;
  if (width < 2 || height < 2 || data.length < width * height * 4) return { ok: false, message: "That picture is too small to use." };

  // The paper: the middle value of the outer ring, where a mark (centred in a photo or a box) is not.
  // Transparent pixels are paper, whatever colour they hold.
  const ring: number[] = [];
  const onRing = (x: number, y: number) => x === 0 || y === 0 || x === width - 1 || y === height - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!onRing(x, y)) continue;
      const o = (y * width + x) * 4;
      if (data[o + 3] >= 128) ring.push(luminance(data, o));
    }
  }
  const paper = ring.length > 0 ? median(ring) : 255;

  // Each pixel's luminance, with a see-through pixel pulled toward the paper by how see-through it is.
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const o = i * 4;
    const a = data[o + 3] / 255;
    lum[i] = paper + (luminance(data, o) - paper) * a;
  }
  const sorted = Float32Array.from(lum).sort();
  const ink = sorted[Math.floor(sorted.length * INK_PERCENTILE)];
  const range = paper - ink;
  if (range < MIN_CONTRAST) return { ok: false, message: NO_MARK };

  const cover = new Uint8Array(width * height);
  for (let i = 0; i < cover.length; i++) {
    const c = Math.min(1, Math.max(0, (paper - lum[i]) / range));
    cover[i] = c <= DEADBAND ? 0 : Math.round(((c - DEADBAND) / (1 - DEADBAND)) * 255);
  }

  // The mark's box, and whether it touches all four edges.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const edgeInk = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cover[y * width + x];
      if (c >= MARK_FLOOR) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (c >= 128) {
        if (y === 0) edgeInk.top++;
        if (y === height - 1) edgeInk.bottom++;
        if (x === 0) edgeInk.left++;
        if (x === width - 1) edgeInk.right++;
      }
    }
  }
  const touches = (n: number, of: number) => n / of > EDGE_SHARE;
  if (touches(edgeInk.top, width) && touches(edgeInk.bottom, width) && touches(edgeInk.left, height) && touches(edgeInk.right, height)) {
    return { ok: false, message: NOT_ON_PAPER };
  }

  // Trim to the box with a little paper round it, then pad to a square so the tip is not stretched.
  const longSide = Math.max(maxX - minX + 1, maxY - minY + 1);
  const margin = Math.max(1, Math.round(longSide * 0.04));
  const side = longSide + margin * 2;
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);
  const square = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < side; x++) {
      const sx = left + x;
      if (sx >= 0 && sx < width) square[y * side + x] = cover[sy * width + sx];
    }
  }

  if (side <= MAX_TIP_EDGE) return { ok: true, tip: { width: side, height: side, alpha: square } };
  return { ok: true, tip: shrink({ width: side, height: side, alpha: square }, MAX_TIP_EDGE) };
}

/** A tip averaged down to `edge` square (area average, so a fine mark does not alias). */
function shrink(src: TipImage, edge: number): TipImage {
  const out = new Uint8Array(edge * edge);
  const k = src.width / edge;
  for (let y = 0; y < edge; y++) {
    const y0 = Math.floor(y * k);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) * k)));
    for (let x = 0; x < edge; x++) {
      const x0 = Math.floor(x * k);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) * k)));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += src.alpha[yy * src.width + xx];
      out[y * edge + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return { width: edge, height: edge, alpha: out };
}

/** One quarter of a 2x2 sheet's pixels, cut out as its own picture. */
export function quadrantOf(px: RgbaPixels, index: 0 | 1 | 2 | 3): RgbaPixels {
  const w = Math.floor(px.width / 2);
  const h = Math.floor(px.height / 2);
  const x0 = (index % 2) * w;
  const y0 = Math.floor(index / 2) * h;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * px.width + x0) * 4;
    for (let i = 0; i < w * 4; i++) data[y * w * 4 + i] = px.data[from + i];
  }
  return { width: w, height: h, data };
}
