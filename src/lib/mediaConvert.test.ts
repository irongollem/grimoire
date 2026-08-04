import { describe, it, expect } from "vitest";
import { readEmbeddedXmp, reembedXmp } from "./mediaConvert";
import { embedXmpInWebp, embedXmpInJpeg, readXmpFromWebp, readXmpFromJpeg } from "@edge-shared/provenance/embed.ts";

// Minimal fixture builders — independently transcribed, mirroring the
// pattern already used across supabase/functions/_shared/provenance/*.test.ts.

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function riffChunk(fourCC: string, data: number[]): number[] {
  const pad = data.length % 2 === 1 ? [0] : [];
  return [...ascii(fourCC), ...u32le(data.length), ...data, ...pad];
}

// Minimal lossless (VP8L) WebP, 1x1 no-alpha.
function buildMinimalWebp(): Uint8Array {
  const vp8lData = [0x2f, 0x00, 0x00, 0x00, 0x00];
  const payload = [...ascii("WEBP"), ...riffChunk("VP8L", vp8lData)];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

function buildMinimalJpeg(): Uint8Array {
  // SOI, then a bare EOI — embed.ts's JPEG reader/writer only cares about
  // the leading APP0/APP1 run, never the compressed scan data.
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}

describe("readEmbeddedXmp", () => {
  it("reads a packet embedded in webp bytes", () => {
    const marked = embedXmpInWebp(buildMinimalWebp(), "webp-packet");
    expect(readEmbeddedXmp(marked)).toBe("webp-packet");
  });

  it("reads a packet embedded in jpeg bytes", () => {
    const marked = embedXmpInJpeg(buildMinimalJpeg(), "jpeg-packet");
    expect(readEmbeddedXmp(marked)).toBe("jpeg-packet");
  });

  it("returns null for unmarked bytes", () => {
    expect(readEmbeddedXmp(buildMinimalWebp())).toBeNull();
  });

  it("returns null for bytes in no recognised format", () => {
    expect(readEmbeddedXmp(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("reembedXmp", () => {
  it("embeds the packet into fresh webp bytes", () => {
    const result = reembedXmp(buildMinimalWebp(), "re-embedded", "image/webp");
    expect(readXmpFromWebp(result)).toBe("re-embedded");
  });

  it("embeds the packet into fresh jpeg bytes", () => {
    const result = reembedXmp(buildMinimalJpeg(), "re-embedded", "image/jpeg");
    expect(readXmpFromJpeg(result)).toBe("re-embedded");
  });

  it("falls back to the original bytes rather than throwing on malformed input", () => {
    const malformed = new Uint8Array([1, 2, 3, 4]);
    expect(reembedXmp(malformed, "packet", "image/webp")).toEqual(malformed);
  });
});
