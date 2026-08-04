import { describe, it, expect } from "vitest";
import { markGeneratedImage, markGeneratedImageB64 } from "./mark";
import { embedProvenance, readXmpFromPng, readXmpFromWebp } from "./embed";
import type { AiProvenance } from "./types";

const PROV: AiProvenance = {
  generatorType: "npc_portrait",
  provider: "gemini",
  model: "gemini-3.1-flash-image",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

// Independently transcribed CRC-32 (poly 0xEDB88320) — only used to build the
// PNG fixture below, never imported from embed.ts.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const crc = crc32(new Uint8Array([...ascii(type), ...data]));
  return [...u32be(data.length), ...ascii(type), ...data, ...u32be(crc)];
}

function buildMinimalPng(): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const idat = pngChunk("IDAT", [0, 1, 2, 3]);
  const iend = pngChunk("IEND", []);
  return new Uint8Array([...signature, ...ihdr, ...idat, ...iend]);
}

function riffChunk(fourCC: string, data: number[]): number[] {
  const pad = data.length % 2 === 1 ? [0] : [];
  return [...ascii(fourCC), ...u32le(data.length), ...data, ...pad];
}

// Minimal lossless (VP8L) WebP, 1x1 no-alpha — same construction as embed.test.ts's
// fixture: signature byte 0x2F + 4-byte packed width-1/height-1/alpha/version
// field, all zero for a 1x1 image (WebP Lossless Bitstream Spec).
function buildMinimalWebp(): Uint8Array {
  const vp8lData = [0x2f, 0x00, 0x00, 0x00, 0x00];
  const payload = [...ascii("WEBP"), ...riffChunk("VP8L", vp8lData)];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

describe("markGeneratedImage", () => {
  it("delegates to embedProvenance — same output for the same input", () => {
    const bytes = buildMinimalPng();
    expect(markGeneratedImage(bytes, "image/png", PROV)).toEqual(embedProvenance(bytes, "image/png", PROV));
  });

  it("produces a recoverable packet on a PNG", () => {
    const marked = markGeneratedImage(buildMinimalPng(), "image/png", PROV);
    const packet = readXmpFromPng(marked);
    expect(packet).toContain('xmp:CreatorTool="Grimoire AI (npc_portrait)"');
    expect(packet).toContain('grimoire:provider="gemini"');
  });

  it("passes an unrecognised content type through unchanged (never corrupts an asset it can't mark)", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(markGeneratedImage(bytes, "image/gif", PROV)).toBe(bytes);
  });
});

describe("markGeneratedImageB64", () => {
  it("round-trips base64 in/out and embeds a recoverable packet", () => {
    const original = buildMinimalWebp();
    const b64In = Buffer.from(original).toString("base64");

    const b64Out = markGeneratedImageB64(b64In, "image/webp", PROV);
    const marked = new Uint8Array(Buffer.from(b64Out, "base64"));

    expect(readXmpFromWebp(marked)).toContain('grimoire:model="gemini-3.1-flash-image"');
  });

  it("is a no-op re-encode for an unrecognised content type (bytes pass through unmarked)", () => {
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const b64In = Buffer.from(original).toString("base64");

    const b64Out = markGeneratedImageB64(b64In, "application/octet-stream", PROV);
    const roundTripped = new Uint8Array(Buffer.from(b64Out, "base64"));

    expect(roundTripped).toEqual(original);
  });

  it("round-trips a large (multi-chunk) image without throwing or corrupting bytes", () => {
    // Comfortably larger than the 0x8000 spread-arg chunk size, and not a
    // multiple of it, to exercise the trailing partial chunk too.
    const size = 3 * 0x8000 + 137;
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i++) original[i] = i % 256;
    const b64In = Buffer.from(original).toString("base64");

    let b64Out = "";
    expect(() => {
      b64Out = markGeneratedImageB64(b64In, "application/octet-stream", PROV);
    }).not.toThrow();

    const roundTripped = new Uint8Array(Buffer.from(b64Out, "base64"));
    expect(roundTripped).toEqual(original);
  });
});
