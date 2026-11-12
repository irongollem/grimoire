import { unzlibSync } from "fflate";
import { ImportError, type ImportLimits, type PngPixels } from "./types";

/*
 * A small PNG decoder so brush import needs no DOM: non-interlaced, any colour type, 1 to 16 bits.
 * The browser may pass a canvas-backed decoder instead; this one is the default and what tests use.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(bytes: Uint8Array, limits: Pick<ImportLimits, "maxPixels">): PngPixels {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new ImportError("A picture in the file is not a PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = -1;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const parts: Uint8Array[] = [];

  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const start = pos + 8;
    if (start + len > bytes.length) throw new ImportError("A PNG ends early.");
    const data = bytes.subarray(start, start + len);
    if (type === "IHDR") {
      if (len < 13) throw new ImportError("A PNG header is damaged.");
      width = view.getUint32(start);
      height = view.getUint32(start + 4);
      depth = data[8];
      colour = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    pos = start + len + 4;
  }

  const channels = CHANNELS[colour];
  if (channels === undefined || ![1, 2, 4, 8, 16].includes(depth)) throw new ImportError("A PNG is in a form this reader does not know.");
  if (interlace !== 0) throw new ImportError("An interlaced PNG is not supported.");
  if (width < 1 || height < 1 || width * height > limits.maxPixels) throw new ImportError("A PNG is empty or too large.");
  if (colour === 3 && !palette) throw new ImportError("A PNG is missing its palette.");

  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const step = Math.max(1, bitsPerPixel >> 3);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  const expected = (stride + 1) * height;
  let raw: Uint8Array;
  try {
    raw = unzlibSync(joined, { out: new Uint8Array(expected) });
  } catch {
    throw new ImportError("A PNG's picture data is damaged.");
  }
  if (raw.length < expected) throw new ImportError("A PNG's picture data ends early.");

  // Undo the per-row filters in place.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= step ? rows[dst + x - step] : 0;
      const b = y > 0 ? rows[dst - stride + x] : 0;
      const c = x >= step && y > 0 ? rows[dst - stride + x - step] : 0;
      let predict = 0;
      if (filter === 1) predict = a;
      else if (filter === 2) predict = b;
      else if (filter === 3) predict = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predict = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new ImportError("A PNG uses a row filter this reader does not know.");
      rows[dst + x] = (raw[src + x] + predict) & 255;
    }
  }

  /** Sample `i` of a row, scaled to 0..255 (palette indices stay as they are). */
  const sample = (row: number, i: number): number => {
    const base = row * stride;
    if (depth === 8) return rows[base + i];
    if (depth === 16) return rows[base + i * 2];
    const perByte = 8 / depth;
    const byte = rows[base + Math.floor(i / perByte)];
    const shift = 8 - depth * ((i % perByte) + 1);
    const v = (byte >> shift) & ((1 << depth) - 1);
    return colour === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * channels;
      if (colour === 0) {
        const g = sample(y, i);
        rgba.set([g, g, g, 255], o);
      } else if (colour === 2) rgba.set([sample(y, i), sample(y, i + 1), sample(y, i + 2), 255], o);
      else if (colour === 3) {
        const idx = sample(y, i);
        const pal = palette as Uint8Array;
        if (idx * 3 + 2 >= pal.length) throw new ImportError("A PNG points outside its palette.");
        rgba.set([pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2], transparency && idx < transparency.length ? transparency[idx] : 255], o);
      } else if (colour === 4) {
        const g = sample(y, i);
        rgba.set([g, g, g, sample(y, i + 1)], o);
      } else rgba.set([sample(y, i), sample(y, i + 1), sample(y, i + 2), sample(y, i + 3)], o);
    }
  }
  return { width, height, rgba };
}
