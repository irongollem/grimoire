import { describe, it, expect } from "vitest";
import {
  embedXmpInWebp,
  embedXmpInPng,
  embedXmpInJpeg,
  embedProvenance,
  readXmpFromWebp,
  readXmpFromPng,
  readXmpFromJpeg,
} from "./embed";
import type { AiProvenance } from "./types";

const PROV: AiProvenance = {
  generatorType: "npc",
  provider: "openai",
  model: "gpt-image-1",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// ── WebP fixtures ────────────────────────────────────────────────────────

function riffChunk(fourCC: string, data: number[]): number[] {
  const pad = data.length % 2 === 1 ? [0] : [];
  return [...ascii(fourCC), ...u32le(data.length), ...data, ...pad];
}

function webpFile(chunks: number[][]): Uint8Array {
  const payload = [...ascii("WEBP"), ...chunks.flat()];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

/** Lossy VP8 keyframe header: frame tag (arbitrary — this module never inspects it) + start code + LE width/height fields, per RFC 6386 §9.1. */
function vp8Payload(width: number, height: number): number[] {
  return [0x10, 0x01, 0x00, 0x9d, 0x01, 0x2a, width & 0xff, (width >>> 8) & 0xff, height & 0xff, (height >>> 8) & 0xff];
}

function buildVp8Webp(width: number, height: number): Uint8Array {
  return webpFile([riffChunk("VP8 ", vp8Payload(width, height))]);
}

/** VP8L header: 0x2F signature + LE-packed (width-1):14 (height-1):14 alpha:1 version:3, LSB first, per the WebP Lossless Bitstream Spec. */
function vp8lPayload(width: number, height: number, alpha: boolean): number[] {
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | ((alpha ? 1 : 0) << 28);
  return [0x2f, packed & 0xff, (packed >>> 8) & 0xff, (packed >>> 16) & 0xff, (packed >>> 24) & 0xff];
}

function buildVp8lWebp(width: number, height: number, alpha = false): Uint8Array {
  return webpFile([riffChunk("VP8L", vp8lPayload(width, height, alpha))]);
}

function vp8xPayload(width: number, height: number, flags: number): number[] {
  const wm1 = width - 1;
  const hm1 = height - 1;
  return [flags, 0, 0, 0, wm1 & 0xff, (wm1 >>> 8) & 0xff, (wm1 >>> 16) & 0xff, hm1 & 0xff, (hm1 >>> 8) & 0xff, (hm1 >>> 16) & 0xff];
}

function buildWebpWithVp8x(width: number, height: number, flags: number): Uint8Array {
  return webpFile([riffChunk("VP8X", vp8xPayload(width, height, flags)), riffChunk("VP8L", vp8lPayload(width, height, false))]);
}

/** Independent RIFF chunk walker (does not reuse embed.ts's internal parser) — used only to assert on structural details (chunk order, VP8X flag byte, dimensions) that the public API doesn't expose directly. */
function readWebpChunks(bytes: Uint8Array): { fourCC: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { fourCC: string; data: Uint8Array }[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    chunks.push({ fourCC, data: bytes.slice(dataStart, dataStart + size) });
    offset = dataStart + size + (size % 2);
  }
  return chunks;
}

function dimensionsFromVp8x(data: Uint8Array): { width: number; height: number } {
  const wm1 = data[4] | (data[5] << 8) | (data[6] << 16);
  const hm1 = data[7] | (data[8] << 8) | (data[9] << 16);
  return { width: wm1 + 1, height: hm1 + 1 };
}

// ── PNG fixtures ─────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Independently transcribed CRC-32 (poly 0xEDB88320) — used only to build/verify test fixtures, never imported by embed.ts. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function referenceCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function pngChunk(type: string, data: number[]): number[] {
  const crc = referenceCrc32(new Uint8Array([...ascii(type), ...data]));
  return [...u32be(data.length), ...ascii(type), ...data, ...u32be(crc)];
}

function buildMinimalPng(): Uint8Array {
  const ihdr = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const idat = pngChunk("IDAT", [0, 1, 2, 3]);
  const iend = pngChunk("IEND", []);
  return new Uint8Array([...PNG_SIGNATURE, ...ihdr, ...idat, ...iend]);
}

/** Independent PNG chunk walker — mirrors embed.ts's parser only in shape (length/type/data/crc), not in code, so it can assert on the CRC bytes embed.ts actually wrote. */
function readPngChunks(bytes: Uint8Array): { type: string; data: Uint8Array; crc: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; data: Uint8Array; crc: Uint8Array }[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const data = bytes.slice(dataStart, dataStart + length);
    const crc = bytes.slice(dataStart + length, dataStart + length + 4);
    chunks.push({ type, data, crc });
    offset = dataStart + length + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

// ── JPEG fixtures ────────────────────────────────────────────────────────

function jpegSegment(marker: number, data: number[]): number[] {
  const length = 2 + data.length;
  return [0xff, marker, (length >>> 8) & 0xff, length & 0xff, ...data];
}

function buildMinimalJpeg(withApp0 = true): Uint8Array {
  const app0 = withApp0 ? jpegSegment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]) : [];
  const sos = [0xff, 0xda, 0x00, 0x02]; // minimal SOS marker, no scan data needed for these tests
  const eoi = [0xff, 0xd9];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sos, ...eoi]);
}

// ── tests ────────────────────────────────────────────────────────────────

describe("WebP", () => {
  it("round-trips embed -> read for a VP8L (lossless) source", () => {
    const marked = embedXmpInWebp(buildVp8lWebp(4, 4), "hello xmp");
    expect(readXmpFromWebp(marked)).toBe("hello xmp");
  });

  it("round-trips embed -> read for a VP8 (lossy) source", () => {
    const marked = embedXmpInWebp(buildVp8Webp(4, 4), "hello xmp");
    expect(readXmpFromWebp(marked)).toBe("hello xmp");
  });

  it("returns null when a WebP carries no XMP chunk", () => {
    expect(readXmpFromWebp(buildVp8lWebp(4, 4))).toBeNull();
  });

  it("synthesizes a VP8X chunk (first, XMP flag set, correct dimensions) when absent, from a VP8L source", () => {
    const marked = embedXmpInWebp(buildVp8lWebp(37, 51, false), "p");
    const chunks = readWebpChunks(marked);
    expect(chunks[0].fourCC).toBe("VP8X");
    expect(chunks[0].data.length).toBe(10);
    expect(chunks[0].data[0] & 0x04).toBe(0x04); // XMP bit
    expect(chunks[0].data[0] & 0x10).toBe(0); // no alpha in source
    expect(dimensionsFromVp8x(chunks[0].data)).toEqual({ width: 37, height: 51 });
  });

  it("propagates VP8L's alpha_is_used bit into the synthesized VP8X alpha flag", () => {
    const marked = embedXmpInWebp(buildVp8lWebp(10, 10, true), "p");
    const chunks = readWebpChunks(marked);
    expect(chunks[0].data[0] & 0x10).toBe(0x10);
  });

  it("synthesizes correct dimensions from a VP8 (lossy) source, with no alpha flag", () => {
    const marked = embedXmpInWebp(buildVp8Webp(20, 15), "p");
    const chunks = readWebpChunks(marked);
    expect(chunks[0].fourCC).toBe("VP8X");
    expect(chunks[0].data[0] & 0x10).toBe(0);
    expect(dimensionsFromVp8x(chunks[0].data)).toEqual({ width: 20, height: 15 });
  });

  it("sets only the XMP flag on an existing VP8X, preserving its other flags and dimensions", () => {
    const marked = embedXmpInWebp(buildWebpWithVp8x(8, 8, 0x20 /* ICC bit pre-set */), "p");
    const chunks = readWebpChunks(marked);
    const vp8x = chunks.find((c) => c.fourCC === "VP8X");
    expect(vp8x).toBeDefined();
    expect(vp8x!.data[0] & 0x04).toBe(0x04); // XMP now set
    expect(vp8x!.data[0] & 0x20).toBe(0x20); // ICC bit preserved
    expect(dimensionsFromVp8x(vp8x!.data)).toEqual({ width: 8, height: 8 });
  });

  it("replaces rather than duplicates an existing XMP chunk on re-embed", () => {
    const once = embedXmpInWebp(buildVp8lWebp(4, 4), "first");
    const twice = embedXmpInWebp(once, "second");
    const chunks = readWebpChunks(twice);
    expect(chunks.filter((c) => c.fourCC === "XMP ")).toHaveLength(1);
    expect(readXmpFromWebp(twice)).toBe("second");
  });

  it("pads odd-length chunk data to an even boundary and keeps the RIFF size field correct", () => {
    const marked = embedXmpInWebp(buildVp8lWebp(4, 4), "a"); // 1-byte (odd) XMP payload
    const view = new DataView(marked.buffer, marked.byteOffset, marked.byteLength);
    expect(view.getUint32(4, true)).toBe(marked.length - 8);

    const chunks = readWebpChunks(marked);
    expect(chunks.map((c) => c.fourCC)).toEqual(["VP8X", "VP8L", "XMP "]);
    expect(Array.from(chunks[1].data)).toEqual(vp8lPayload(4, 4, false)); // VP8L chunk (odd-length payload) survives the padding of its own data untouched
    expect(readXmpFromWebp(marked)).toBe("a");
  });

  it("throws on garbage bytes (not caught here — embedProvenance is the pass-through boundary)", () => {
    expect(() => embedXmpInWebp(new Uint8Array([1, 2, 3]), "p")).toThrow();
  });
});

describe("PNG", () => {
  it("round-trips embed -> read", () => {
    const marked = embedXmpInPng(buildMinimalPng(), "hello xmp");
    expect(readXmpFromPng(marked)).toBe("hello xmp");
  });

  it("returns null when a PNG carries no XMP iTXt chunk", () => {
    expect(readXmpFromPng(buildMinimalPng())).toBeNull();
  });

  it("inserts the iTXt chunk immediately before IEND", () => {
    const marked = embedXmpInPng(buildMinimalPng(), "p");
    const chunks = readPngChunks(marked);
    const types = chunks.map((c) => c.type);
    expect(types.at(-1)).toBe("IEND");
    expect(types.at(-2)).toBe("iTXt");
  });

  it("writes a correct CRC-32 for the new iTXt chunk (cross-checked against an independent CRC implementation)", () => {
    const marked = embedXmpInPng(buildMinimalPng(), "p");
    const chunks = readPngChunks(marked);
    const itxt = chunks.find((c) => c.type === "iTXt")!;
    const expectedCrc = referenceCrc32(new Uint8Array([...ascii("iTXt"), ...itxt.data]));
    const actualCrc = new DataView(itxt.crc.buffer, itxt.crc.byteOffset, 4).getUint32(0, false);
    expect(actualCrc).toBe(expectedCrc);
  });

  it("recomputes IEND's CRC to the well-known constant for an empty chunk (0xAE426082)", () => {
    // The CRC of a zero-length IEND chunk depends only on the ASCII bytes "IEND" — it
    // is the same in every PNG ever written, independent of anything this module does.
    // If our hand-rolled CRC32 disagreed with this universally documented constant, it
    // would be wrong for every chunk, not just this one.
    const marked = embedXmpInPng(buildMinimalPng(), "p");
    const chunks = readPngChunks(marked);
    const iend = chunks.find((c) => c.type === "IEND")!;
    const crc = new DataView(iend.crc.buffer, iend.crc.byteOffset, 4).getUint32(0, false);
    expect(crc).toBe(0xae426082);
  });

  it("replaces rather than duplicates an existing XMP iTXt chunk on re-embed", () => {
    const once = embedXmpInPng(buildMinimalPng(), "first");
    const twice = embedXmpInPng(once, "second");
    const chunks = readPngChunks(twice);
    expect(chunks.filter((c) => c.type === "iTXt")).toHaveLength(1);
    expect(readXmpFromPng(twice)).toBe("second");
  });

  it("throws on garbage bytes (not caught here — embedProvenance is the pass-through boundary)", () => {
    expect(() => embedXmpInPng(new Uint8Array([1, 2, 3]), "p")).toThrow();
  });
});

describe("JPEG", () => {
  it("round-trips embed -> read", () => {
    const marked = embedXmpInJpeg(buildMinimalJpeg(), "hello xmp");
    expect(readXmpFromJpeg(marked)).toBe("hello xmp");
  });

  it("returns null when a JPEG carries no XMP APP1 segment", () => {
    expect(readXmpFromJpeg(buildMinimalJpeg())).toBeNull();
  });

  it("inserts APP1 right after SOI, after an existing APP0", () => {
    const marked = embedXmpInJpeg(buildMinimalJpeg(true), "p");
    expect(marked[0]).toBe(0xff);
    expect(marked[1]).toBe(0xd8); // SOI
    expect(marked[2]).toBe(0xff);
    expect(marked[3]).toBe(0xe0); // original APP0 (JFIF) still first
    // Walk past the APP0 segment to find our inserted APP1 immediately after it.
    const app0Length = (marked[4] << 8) | marked[5];
    const nextMarkerOffset = 2 + 2 + app0Length;
    expect(marked[nextMarkerOffset]).toBe(0xff);
    expect(marked[nextMarkerOffset + 1]).toBe(0xe1); // APP1 (our XMP segment)
  });

  it("inserts APP1 right after SOI when there is no APP0", () => {
    const marked = embedXmpInJpeg(buildMinimalJpeg(false), "p");
    expect(marked[2]).toBe(0xff);
    expect(marked[3]).toBe(0xe1);
  });

  it("replaces rather than duplicates an existing XMP APP1 on re-embed", () => {
    const once = embedXmpInJpeg(buildMinimalJpeg(), "first");
    const twice = embedXmpInJpeg(once, "second");
    expect(readXmpFromJpeg(twice)).toBe("second");
    // Only one APP1 segment should remain in the leading run.
    let app1Count = 0;
    let offset = 2;
    const view = new DataView(twice.buffer, twice.byteOffset, twice.byteLength);
    while (offset + 4 <= twice.length && twice[offset] === 0xff) {
      const marker = twice[offset + 1];
      if (marker !== 0xe0 && marker !== 0xe1) break;
      if (marker === 0xe1) app1Count++;
      offset += 2 + view.getUint16(offset + 2, false);
    }
    expect(app1Count).toBe(1);
  });

  it("throws on garbage bytes (not caught here — embedProvenance is the pass-through boundary)", () => {
    expect(() => embedXmpInJpeg(new Uint8Array([1, 2, 3]), "p")).toThrow();
  });
});

describe("embedProvenance", () => {
  it("marks a WebP, PNG and JPEG asset and produces a recoverable AiProvenance-derived packet", () => {
    const webp = embedProvenance(buildVp8lWebp(4, 4), "image/webp", PROV);
    const png = embedProvenance(buildMinimalPng(), "image/png", PROV);
    const jpeg = embedProvenance(buildMinimalJpeg(), "image/jpeg", PROV);

    for (const packet of [readXmpFromWebp(webp), readXmpFromPng(png), readXmpFromJpeg(jpeg)]) {
      expect(packet).toContain('xmp:CreatorTool="Grimoire AI (npc)"');
      expect(packet).toContain("trainedAlgorithmicMedia");
    }
  });

  it("passes unknown content types through unchanged", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const result = embedProvenance(bytes, "application/octet-stream", PROV);
    expect(result).toBe(bytes);
  });

  it("passes garbage bytes through unchanged for every known content type, rather than throwing", () => {
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]);
    for (const contentType of ["image/webp", "image/png", "image/jpeg"]) {
      expect(() => embedProvenance(garbage, contentType, PROV)).not.toThrow();
      expect(embedProvenance(garbage, contentType, PROV)).toEqual(garbage);
    }
  });

  it("passes empty bytes through unchanged", () => {
    const empty = new Uint8Array(0);
    expect(embedProvenance(empty, "image/png", PROV)).toEqual(empty);
  });
});
