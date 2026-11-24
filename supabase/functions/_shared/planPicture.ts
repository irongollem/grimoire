/**
 * Draws a map plan (rooms, walls, doors on a cell grid) as a plain top-down
 * PNG, server side, for the AI styler (`style-map`) to paint over. The walls
 * are exact elsewhere; this picture only has to show the layout clearly to an
 * image model. Edge functions have no DOM or canvas, so the pixels are filled
 * in a byte buffer and encoded with a hand-written PNG writer.
 */
import { GEMINI_ASPECT_RATIOS, isValidGeminiAspectRatio } from "./geminiAspect.ts";
import { isValidStyleImageSize } from "./imageSize.ts";

export type Cell = [number, number];
export interface PlanSegment {
  a: Cell;
  b: Cell;
}
export interface PlanPictureInput {
  cols: number;
  rows: number;
  rooms: Array<{ x: number; y: number; w: number; h: number }>;
  walls: PlanSegment[];
  doors: PlanSegment[];
}
export interface PlanPicture {
  png: Uint8Array;
  width: number;
  height: number;
  pxPerCell: number;
  /** Background added right of the grid so the canvas lands on a size and aspect the styler accepts. */
  padRight: number;
  /** Background added below the grid, for the same reason. */
  padBottom: number;
  /**
   * The same pixels as RGBA, row by row, for a caller that stores the picture in another format: the image buckets take
   * WebP or JPEG only, while the styler is given the PNG.
   */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export type Rgb = readonly [number, number, number];
export const BACKGROUND: Rgb = [38, 36, 40];
export const FLOOR: Rgb = [214, 205, 184];
export const WALL: Rgb = [28, 22, 20];
export const DOOR: Rgb = [139, 90, 43];

/** The styler wants a megapixel or more and sides in multiples of 16 (`isValidStyleImageSize`). */
const MIN_PIXELS = 655_360;

function ceil16(n: number): number {
  return Math.ceil(n / 16) * 16;
}

/**
 * Smallest canvas, on one of Gemini's aspect buckets, that holds the grid and
 * passes both of style-map's server checks. A grid that already matches a
 * bucket gets no padding; a very wide one gets background below it.
 */
function chooseCanvas(contentW: number, contentH: number): { width: number; height: number } {
  let best: { width: number; height: number } | null = null;
  for (const { ratio } of GEMINI_ASPECT_RATIOS) {
    let w = contentW;
    let h = contentH;
    if (w / h < ratio) w = Math.ceil(h * ratio);
    else h = Math.ceil(w / ratio);
    if (w * h < MIN_PIXELS) {
      // A tiny plan: grow the canvas (the grid stays put in a corner).
      const scale = Math.sqrt(MIN_PIXELS / (w * h));
      w = Math.ceil(w * scale);
      h = Math.ceil(h * scale);
    }
    w = ceil16(w);
    h = ceil16(h);
    if (!isValidStyleImageSize(w, h) || !isValidGeminiAspectRatio(w, h)) continue;
    if (!best || w * h < best.width * best.height) best = { width: w, height: h };
  }
  if (!best) throw new Error(`plan of ${contentW}x${contentH}px fits no size the map styler accepts`);
  return best;
}

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the type and the data, not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlibDeflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Wraps filtered scanlines (each starting with its filter byte) as an RGB PNG. */
async function encodePng(width: number, height: number, scanlines: Uint8Array): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlibDeflate(scanlines)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

/** The picture's size for a grid: pixels per cell and the padded canvas the styler accepts. No pixels drawn. */
export function planCanvas(cols: number, rows: number): { pxPerCell: number; width: number; height: number } {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
    throw new Error("plan needs a whole, positive number of columns and rows");
  }
  const pxPerCell = Math.min(64, Math.max(24, Math.floor(2048 / Math.max(cols, rows))));
  return { pxPerCell, ...chooseCanvas(cols * pxPerCell, rows * pxPerCell) };
}

export async function planPicturePng(input: PlanPictureInput): Promise<PlanPicture> {
  const { cols, rows } = input;
  const { pxPerCell, width, height } = planCanvas(cols, rows);
  const contentW = cols * pxPerCell;
  const contentH = rows * pxPerCell;

  const stride = 1 + width * 3; // filter byte 0 (None) then RGB
  const data = new Uint8Array(stride * height);
  const fill = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb) => {
    const xa = Math.max(0, x0);
    const xb = Math.min(width, x1);
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
      for (let x = xa; x < xb; x++) {
        const i = y * stride + 1 + x * 3;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  };

  fill(0, 0, width, height, BACKGROUND);
  for (const room of input.rooms) {
    fill(room.x * pxPerCell, room.y * pxPerCell, (room.x + room.w) * pxPerCell, (room.y + room.h) * pxPerCell, FLOOR);
  }

  /** A segment as a thick rectangle centred on its lattice line; `extend` lets walls overlap at corners. */
  const stroke = (s: PlanSegment, thickness: number, extend: boolean, colour: Rgb) => {
    const lo = Math.floor(thickness / 2);
    const hi = thickness - lo;
    const ext = extend ? lo : 0;
    const extHi = extend ? hi : 0;
    const x0 = Math.min(s.a[0], s.b[0]) * pxPerCell;
    const x1 = Math.max(s.a[0], s.b[0]) * pxPerCell;
    const y0 = Math.min(s.a[1], s.b[1]) * pxPerCell;
    const y1 = Math.max(s.a[1], s.b[1]) * pxPerCell;
    if (s.a[1] === s.b[1]) fill(x0 - ext, y0 - lo, x1 + extHi, y0 + hi, colour);
    else fill(x0 - lo, y0 - ext, x0 + hi, y1 + extHi, colour);
  };

  const wallThickness = Math.max(2, Math.round(pxPerCell / 6));
  for (const wall of input.walls) stroke(wall, wallThickness, true, WALL);
  // Doors go on top and a little thicker, so a door reads as a door and not a gap in the wall line.
  for (const door of input.doors) stroke(door, wallThickness * 2, false, DOOR);
  for (let y = 0; y < height; y++) data[y * stride] = 0;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = y * stride + 1 + x * 3;
      const to = (y * width + x) * 4;
      rgba[to] = data[from];
      rgba[to + 1] = data[from + 1];
      rgba[to + 2] = data[from + 2];
      rgba[to + 3] = 255;
    }
  }

  return {
    png: await encodePng(width, height, data),
    rgba,
    width,
    height,
    pxPerCell,
    padRight: width - contentW,
    padBottom: height - contentH,
  };
}
