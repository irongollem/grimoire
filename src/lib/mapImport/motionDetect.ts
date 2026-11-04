/**
 * Does this file move? Decides whether a map is uploaded as a still or kept
 * on the DM's device as a moving map (#1125 decision 6). Reads container
 * headers only; nothing is decoded.
 */

export type MapMotion = "still" | "animated" | "video";

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

async function readBytes(file: Blob, start: number, len: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, start + len).arrayBuffer());
}

/** GIF: more than one image descriptor means more than one frame. */
function gifIsAnimated(b: Uint8Array): boolean {
  if (b.length < 13) return false;
  let p = 13;
  if (b[10] & 0x80) p += 3 * 2 ** ((b[10] & 7) + 1);
  const skipSubBlocks = () => {
    while (p < b.length && b[p] !== 0) p += b[p] + 1;
    p += 1;
  };
  let frames = 0;
  while (p < b.length) {
    const tag = b[p];
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      p += 2;
      skipSubBlocks();
    } else if (tag === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      const flags = b[p + 9];
      p += 10;
      if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1);
      p += 1; // LZW minimum code size
      skipSubBlocks();
    } else {
      break; // not a block we know: stop rather than guess
    }
  }
  return false;
}

/** WebP: the VP8X animation flag (bit 1 of the flags byte) or an ANIM chunk. */
function webpIsAnimated(b: Uint8Array): boolean {
  if (b.length < 21 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return false;
  if (ascii(b, 12, 4) !== "VP8X") return false;
  return (b[20] & 0x02) !== 0 || ascii(b, 30, 4) === "ANIM";
}

/** PNG (APNG): an acTL chunk before the first IDAT. */
async function pngIsAnimated(file: Blob): Promise<boolean> {
  let pos = 8;
  while (pos + 8 <= file.size) {
    const head = await readBytes(file, pos, 8);
    const len = new DataView(head.buffer).getUint32(0);
    const type = ascii(head, 4, 4);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    pos += 12 + len;
  }
  return false;
}

export async function detectMotion(file: File): Promise<MapMotion> {
  if (file.type.startsWith("video/")) return "video";
  const head = await readBytes(file, 0, 32);
  if (ascii(head, 0, 3) === "GIF") return gifIsAnimated(await readBytes(file, 0, file.size)) ? "animated" : "still";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return webpIsAnimated(head) ? "animated" : "still";
  if (head[0] === 0x89 && ascii(head, 1, 3) === "PNG") return (await pngIsAnimated(file)) ? "animated" : "still";
  return "still";
}
