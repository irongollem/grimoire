import { describe, it, expect } from "vitest";
import { readEmbeddedXmp, inheritXmpIntoVariant, canBackfill } from "./upload";
import { embedXmpInWebp, embedXmpInPng, readXmpFromWebp } from "@edge-shared/provenance/embed.ts";

// Minimal fixture builders — independently transcribed (not imported from
// embed.ts's own test file), mirroring the pattern already used across
// supabase/functions/_shared/provenance/*.test.ts.

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

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

// Return type is intentionally inferred (not annotated `Uint8Array`) —
// same reasoning as localKeyVault.ts's `fromBase64`: a bare `Uint8Array`
// annotation widens to `Uint8Array<ArrayBufferLike>`, which BlobPart rejects.
function buildMinimalPng() {
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

// Minimal lossless (VP8L) WebP, 1x1 no-alpha.
function buildMinimalWebp() {
  const vp8lData = [0x2f, 0x00, 0x00, 0x00, 0x00];
  const payload = [...ascii("WEBP"), ...riffChunk("VP8L", vp8lData)];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

// embed.ts's embedXmpIn* functions have a bare `Uint8Array` return
// annotation (widens to `Uint8Array<ArrayBufferLike>`); re-wrap before
// handing the result to `new Blob(...)`.
function toBlobPart(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

describe("readEmbeddedXmp", () => {
  it("reads a packet embedded in a PNG blob", async () => {
    const marked = embedXmpInPng(buildMinimalPng(), "packet-from-png");
    const blob = new Blob([toBlobPart(marked)], { type: "image/png" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-from-png");
  });

  it("reads a packet embedded in a WebP blob", async () => {
    const marked = embedXmpInWebp(buildMinimalWebp(), "packet-from-webp");
    const blob = new Blob([toBlobPart(marked)], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-from-webp");
  });

  it("returns null for an unmarked image", async () => {
    const blob = new Blob([buildMinimalWebp()], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBeNull();
  });

  it("sniffs the real format rather than trusting a mismatched blob.type", async () => {
    // Actual bytes are PNG (marked), but the blob is labelled webp — a
    // b64-derived blob routinely is. The packet must still be found.
    const marked = embedXmpInPng(buildMinimalPng(), "packet-despite-wrong-label");
    const blob = new Blob([toBlobPart(marked)], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-despite-wrong-label");
  });

  it("returns null for bytes in no recognised image format", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBeNull();
  });
});

describe("inheritXmpIntoVariant", () => {
  it("embeds the given packet into an unmarked webp variant", async () => {
    const variant = new Blob([buildMinimalWebp()], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, "inherited-packet");
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(readXmpFromWebp(bytes)).toBe("inherited-packet");
  });

  it("leaves the variant untouched when there is no packet to inherit", async () => {
    const variant = new Blob([buildMinimalWebp()], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, null);
    expect(result).toBe(variant);
  });

  it("falls back to the unmarked variant rather than throwing on malformed bytes", async () => {
    const variant = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, "some-packet");
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

describe("canBackfill", () => {
  const USER = "11111111-1111-4111-8111-111111111111";

  it("always allows the owner's own folder", () => {
    expect(canBackfill("spellImages", `${USER}/a.webp`, USER, false)).toBe(true);
  });

  it("refuses other users' folders, admin or not", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(canBackfill("spellImages", `${other}/a.webp`, USER, false)).toBe(false);
    expect(canBackfill("spellImages", `${other}/a.webp`, USER, true)).toBe(false);
  });

  it("lets only admins backfill the shared srd/ prefix", () => {
    // This is what lets canonical art self-heal: 94 of 97 srd spell originals
    // shipped with zero variants, and the owner-only rule locked them out of
    // backfill permanently — srd/ matches nobody's uuid.
    expect(canBackfill("spellImages", "srd/fireball.webp", USER, true)).toBe(true);
    expect(canBackfill("spellImages", "srd/fireball.webp", USER, false)).toBe(false);
    expect(canBackfill("sounds", "library/rain.ogg", USER, true)).toBe(true);
  });

  it("never opens a prefix the bucket does not declare", () => {
    expect(canBackfill("itemImages", "srd/x.webp", USER, true)).toBe(false);
    // mini-models is service-managed: clientWrites false blocks even bases/.
    expect(canBackfill("miniModels", "bases/round25.stl", USER, true)).toBe(false);
  });
});
