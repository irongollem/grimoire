#!/usr/bin/env tsx
/**
 * Turns the generated brush tips and paper grain into app assets (#1181).
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/paintbox/stockAssets.ts [--dir <tips>] [--papers <papers>]
 *
 * Reads black-on-white PNGs from the painter folder and writes lossless WebP under
 * public/assets/: tips (black RGB, alpha = coverage) and grains under paintbox/, and per paper a seamless
 * colour surface (1024, lossy) under papers/ with the fine tooth taken from it as a grain (large-scale tone removed). Run `npm run art:manifest` afterwards. Re-running
 * reproduces the same bytes.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { isCliEntry } from "../lib/cli.ts";

export const TIP_IDS = ["round-wet", "flat-bristle", "dry-comb", "sponge", "charcoal", "ink-round", "soft-round"] as const;
export const TIP_SIZE = 512;
export const PAPER_SIZE = 1024;
export const PAPER_IDS = [
  "hot-press",
  "cold-press",
  "rough",
  "laid",
  "rice-paper",
  "parchment",
  "treasure-map",
  "kraft",
  "pastel-grey",
  "linen-canvas",
] as const;
export const DEFAULT_DIR = path.join(os.homedir(), "Desktop/art-955/paintbox/tips");
export const DEFAULT_PAPERS_DIR = path.join(os.homedir(), "Desktop/art-955/paintbox/papers");
const OUT_DIR = path.join(import.meta.dirname, "../../public/assets/paintbox");
const PAPERS_DIR = path.join(import.meta.dirname, "../../public/assets/papers");

/** Alpha from darkness: white paper is 0, anything at or below black is 255. */
export function alphaFromLuminance(lum: number): number {
  return Math.max(0, Math.min(255, Math.round(((245 - lum) * 255) / 245)));
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The square around the marked pixels (alpha above `threshold`) plus a margin, clamped to the image. Null when empty. */
export function markBounds(alpha: Uint8Array, width: number, height: number, threshold = 8, margin = 8): Box | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const left = Math.max(0, x0 - margin);
  const top = Math.max(0, y0 - margin);
  const right = Math.min(width - 1, x1 + margin);
  const bottom = Math.min(height - 1, y1 + margin);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** The blend margin for a source of side `size`: an eighth of it. */
export function seamMargin(size: number): number {
  return size >> 3;
}

/**
 * Makes a square image tile seamlessly by blending only an edge band, so nothing repeats inside the tile.
 * The result is `size - margin` square. Per axis, the first `margin` columns are cross-faded (cosine ramp)
 * into the `margin` extra columns past the output's end, so the last column flows on into the first: a
 * tile wrapped at W = size - margin meets itself with the continuation the picture already had. Rows follow columns.
 */
export function makeSeamless(src: Float32Array, size: number, margin = seamMargin(size)): Float32Array {
  const width = size - margin;
  const ramp = (i: number): number => 0.5 - 0.5 * Math.cos((Math.PI * (i + 0.5)) / margin);
  const wide = new Float32Array(width * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < width; x++) {
      const kept = src[y * size + x];
      wide[y * width + x] = x >= margin ? kept : kept * ramp(x) + src[y * size + x + width] * (1 - ramp(x));
    }
  }
  const out = new Float32Array(width * width);
  for (let y = 0; y < width; y++) {
    const w = y >= margin ? 1 : ramp(y);
    for (let x = 0; x < width; x++) {
      out[y * width + x] = wide[y * width + x] * w + (w === 1 ? 0 : wide[(y + width) * width + x] * (1 - w));
    }
  }
  return out;
}

/** Stretches the values to the full 0..255 range, first clipping `tail` (a fraction) off each end. A flat image comes back mid-grey. */
export function normalise(values: Float32Array, tail = 0): Uint8Array {
  let lo = Infinity;
  let hi = -Infinity;
  if (tail > 0) {
    const sorted = Float32Array.from(values).sort();
    lo = sorted[Math.floor(sorted.length * tail)];
    hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - tail)))];
  } else {
    for (const v of values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const out = new Uint8Array(values.length);
  const span = hi - lo;
  for (let i = 0; i < values.length; i++) out[i] = span <= 0 ? 128 : Math.max(0, Math.min(255, Math.round(((values[i] - lo) * 255) / span)));
  return out;
}

async function buildTip(file: string, outFile: string): Promise<string> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = alphaFromLuminance(data[i]);
  const box = markBounds(alpha, info.width, info.height);
  if (!box) throw new Error(`${file} has no mark`);
  const side = Math.max(box.width, box.height);
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < alpha.length; i++) rgba[i * 4 + 3] = alpha[i];
  const padX = side - box.width;
  const padY = side - box.height;
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .extend({
      left: Math.floor(padX / 2),
      right: padX - Math.floor(padX / 2),
      top: Math.floor(padY / 2),
      bottom: padY - Math.floor(padY / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(TIP_SIZE, TIP_SIZE, { fit: "fill" })
    .webp({ lossless: true, exact: true })
    .toFile(outFile);
  return `${path.basename(outFile)} ${side}px -> ${TIP_SIZE}`;
}

/** Blur radius (at grain size) that carries the paper's tone: stains and mottling, not tooth. */
export const TONE_RADIUS = 24;

/** Box blur that wraps at the edges, so a tile stays a tile. */
function wrapBlur(src: Float32Array, size: number, radius: number): Float32Array {
  const run = (input: Float32Array, horizontal: boolean): Float32Array => {
    const out = new Float32Array(input.length);
    const span = radius * 2 + 1;
    for (let line = 0; line < size; line++) {
      const at = (i: number): number => (horizontal ? line * size + ((i + size) % size) : ((i + size) % size) * size + line);
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += input[at(i)];
      for (let i = 0; i < size; i++) {
        out[at(i)] = sum / span;
        sum += input[at(i + radius + 1)] - input[at(i - radius)];
      }
    }
    return out;
  };
  return run(run(src, true), false);
}

/**
 * Only the fine tooth of a tile: the large-scale tone (a wide, wrapped blur, run three times to
 * approach a gaussian) is subtracted, then the rest is stretched to 0..255 with the extreme tails clipped.
 */
export function removeTone(src: Float32Array, size: number, radius = TONE_RADIUS): Uint8Array {
  let tone = src;
  for (let pass = 0; pass < 3; pass++) tone = wrapBlur(tone, size, radius);
  const detail = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) detail[i] = src[i] - tone[i];
  return normalise(detail, 0.005);

}

/**
 * Scales a square tile to a new side with a Catmull-Rom spline that wraps at the edges, so a tile stays a
 * tile (a plain resize clamps there and would draw a line at the seam).
 */
export function resizeTile(tile: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(to * to);
  const weights = (t: number): number[] => {
    const t2 = t * t;
    const t3 = t2 * t;
    return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
  };
  const wrap = (i: number): number => ((i % from) + from) % from;
  for (let y = 0; y < to; y++) {
    const fy = ((y + 0.5) * from) / to - 0.5;
    const y0 = Math.floor(fy);
    const wy = weights(fy - y0);
    for (let x = 0; x < to; x++) {
      const fx = ((x + 0.5) * from) / to - 0.5;
      const x0 = Math.floor(fx);
      const wx = weights(fx - x0);
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        const row = wrap(y0 - 1 + j) * from;
        for (let i = 0; i < 4; i++) sum += tile[row + wrap(x0 - 1 + i)] * wx[i] * wy[j];
      }
      out[y * to + x] = sum;
    }
  }
  return out;
}

/** The seamless colour surface at full size, as float channels. */
async function seamlessSurface(file: string): Promise<{ channels: Float32Array[]; size: number }> {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .toColourspace("srgb")
    .resize(PAPER_SIZE, PAPER_SIZE, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels: Float32Array[] = [];
  for (let c = 0; c < 3; c++) {
    const plane = new Float32Array(PAPER_SIZE * PAPER_SIZE);
    for (let i = 0; i < plane.length; i++) plane[i] = data[i * info.channels + c];
    channels.push(resizeTile(makeSeamless(plane, PAPER_SIZE), PAPER_SIZE - seamMargin(PAPER_SIZE), PAPER_SIZE));
  }
  return { channels, size: PAPER_SIZE };
}

async function buildPaper(id: string, file: string): Promise<string> {
  const { channels, size } = await seamlessSurface(file);
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(channels[c][i]);
  const surface = path.join(PAPERS_DIR, `${id}.webp`);
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 90 }).toFile(surface);
  // Tooth from the seamless surface, halved to grain size (a mean of 2x2 stays a tile).
  const luma = new Float32Array(size * size);
  for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * channels[0][i] + 0.587 * channels[1][i] + 0.114 * channels[2][i];
  const half = size >> 1;
  const small = new Float32Array(half * half);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const i = y * 2 * size + x * 2;
      small[y * half + x] = (luma[i] + luma[i + 1] + luma[i + size] + luma[i + size + 1]) / 4;
    }
  }
  const grain = path.join(OUT_DIR, "grains", `${id}.webp`);
  await sharp(Buffer.from(removeTone(small, half)), { raw: { width: half, height: half, channels: 1 } })
    .webp({ lossless: true })
    .toFile(grain);
  return `${id}: surface ${size}px, grain ${half}px`;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { dir: { type: "string" }, papers: { type: "string" } } });
  const dir = values.dir ?? DEFAULT_DIR;
  mkdirSync(path.join(OUT_DIR, "tips"), { recursive: true });
  mkdirSync(path.join(OUT_DIR, "grains"), { recursive: true });
  for (const id of TIP_IDS) {
    console.log(await buildTip(path.join(dir, `tip-${id}.png`), path.join(OUT_DIR, "tips", `${id}.webp`)));
  }
  mkdirSync(PAPERS_DIR, { recursive: true });
  const papersDir = values.papers ?? DEFAULT_PAPERS_DIR;
  for (const id of PAPER_IDS) console.log(await buildPaper(id, path.join(papersDir, `${id}.png`)));
}

if (isCliEntry(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
