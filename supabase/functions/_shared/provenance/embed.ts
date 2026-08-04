/**
 * Binary XMP embedders/extractors for WebP, PNG and JPEG. Pure TS —
 * Uint8Array/DataView/TextEncoder only — so the same code runs unmodified
 * in Deno edge functions and the browser. `embedProvenance` is the only
 * entry point most callers need; the per-format functions are exported for
 * direct use and for testing.
 */
import type { AiProvenance } from "./types.ts";
import { buildXmpPacket } from "./xmp.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

// ── WebP (RIFF) ────────────────────────────────────────────────────────────

const RIFF_HEADER_BYTES = 12; // "RIFF" + size(u32) + "WEBP"
const WEBP_CHUNK_HEADER_BYTES = 8; // fourCC(4) + size(u32)
const VP8X_CHUNK_DATA_BYTES = 10;

/**
 * VP8X flags-byte bit values we act on (WebP Container Spec). The full byte
 * also carries ICC (0x20), EXIF (0x08) and Animation (0x02) bits — this
 * module never sets them (it has no ICC/EXIF/animation payload to declare),
 * and preserves whatever an existing VP8X chunk already has by OR-ing the
 * XMP bit into the byte rather than rebuilding it from named constants.
 */
const VP8X_FLAG_XMP = 0x04;
const VP8X_FLAG_ALPHA = 0x10;

interface WebpChunk {
  fourCC: string;
  data: Uint8Array;
}

function parseWebpChunks(bytes: Uint8Array): WebpChunk[] {
  if (bytes.length < RIFF_HEADER_BYTES || asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 4) !== "WEBP") {
    throw new Error("Not a RIFF/WEBP file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: WebpChunk[] = [];
  let offset = RIFF_HEADER_BYTES;
  while (offset + WEBP_CHUNK_HEADER_BYTES <= bytes.length) {
    const fourCC = asciiAt(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + WEBP_CHUNK_HEADER_BYTES;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) {
      throw new Error(`WebP chunk '${fourCC}' declares ${size} bytes but file is truncated`);
    }
    chunks.push({ fourCC, data: bytes.slice(dataStart, dataEnd) });
    offset = dataEnd + (size % 2); // odd-length chunk data is padded with one 0x00 byte
  }
  if (chunks.length === 0) throw new Error("WebP file has no chunks");
  return chunks;
}

function writeWebpChunks(chunks: WebpChunk[]): Uint8Array {
  let payloadSize = 4; // "WEBP"
  for (const chunk of chunks) payloadSize += WEBP_CHUNK_HEADER_BYTES + chunk.data.length + (chunk.data.length % 2);

  const out = new Uint8Array(8 + payloadSize);
  const view = new DataView(out.buffer);
  out.set(textEncoder.encode("RIFF"), 0);
  view.setUint32(4, payloadSize, true);
  out.set(textEncoder.encode("WEBP"), 8);

  let offset = 12;
  for (const chunk of chunks) {
    out.set(textEncoder.encode(chunk.fourCC), offset);
    view.setUint32(offset + 4, chunk.data.length, true);
    out.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
    if (chunk.data.length % 2 === 1) {
      out[offset] = 0;
      offset += 1;
    }
  }
  return out;
}

interface Vp8Dimensions {
  width: number;
  height: number;
  hasAlpha: boolean;
}

/** Lossy VP8 keyframe header: 3-byte frame tag, then the fixed start code, then two little-endian 16-bit fields packing a 14-bit dimension + 2-bit scale each (RFC 6386 §9.1). Simple-format VP8 never carries alpha. */
function vp8Dimensions(data: Uint8Array): Vp8Dimensions {
  if (data.length < 10) throw new Error("VP8 chunk too small to contain a key frame header");
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
    throw new Error("VP8 chunk missing key frame start code");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const widthField = view.getUint16(6, true);
  const heightField = view.getUint16(8, true);
  return { width: widthField & 0x3fff, height: heightField & 0x3fff, hasAlpha: false };
}

/** Lossless VP8L header: 1-byte signature (0x2F), then a little-endian 32-bit field packing 14-bit width-1, 14-bit height-1, a 1-bit alpha_is_used flag and a 3-bit version, LSB first (WebP Lossless Bitstream Spec). */
function vp8lDimensions(data: Uint8Array): Vp8Dimensions {
  if (data.length < 5 || data[0] !== 0x2f) throw new Error("Invalid VP8L signature");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const packed = view.getUint32(1, true);
  return {
    width: (packed & 0x3fff) + 1,
    height: ((packed >>> 14) & 0x3fff) + 1,
    hasAlpha: ((packed >>> 28) & 0x1) === 1,
  };
}

function buildVp8xData(dims: Vp8Dimensions, extraFlags: number): Uint8Array {
  const data = new Uint8Array(VP8X_CHUNK_DATA_BYTES);
  data[0] = VP8X_FLAG_XMP | extraFlags;
  const widthMinusOne = dims.width - 1;
  const heightMinusOne = dims.height - 1;
  data[4] = widthMinusOne & 0xff;
  data[5] = (widthMinusOne >>> 8) & 0xff;
  data[6] = (widthMinusOne >>> 16) & 0xff;
  data[7] = heightMinusOne & 0xff;
  data[8] = (heightMinusOne >>> 8) & 0xff;
  data[9] = (heightMinusOne >>> 16) & 0xff;
  return data;
}

/**
 * Embeds `xmpPacket` into a WebP file as an `XMP ` RIFF chunk.
 *
 * A "simple" WebP (bare VP8 or VP8L chunk, no VP8X) has nowhere to declare
 * "this file carries XMP" — that flag only exists on the VP8X extended-
 * format header, and readers are only required to look for metadata chunks
 * when VP8X says to. So when VP8X is absent this synthesizes one: canvas
 * dimensions are read straight out of the VP8/VP8L bitstream header (the
 * only place they exist pre-VP8X), and the alpha flag is propagated from
 * VP8L's own alpha_is_used bit so the synthesized header doesn't claim
 * "no alpha" for an image that has it. An existing VP8X is left otherwise
 * untouched — only its XMP bit is set — so any animation/ICC/EXIF/alpha
 * signal it already carries survives.
 */
export function embedXmpInWebp(bytes: Uint8Array, xmpPacket: string): Uint8Array {
  const chunks = parseWebpChunks(bytes);
  const xmpData = textEncoder.encode(xmpPacket);

  const vp8xIndex = chunks.findIndex((c) => c.fourCC === "VP8X");
  if (vp8xIndex === -1) {
    const imageChunk = chunks.find((c) => c.fourCC === "VP8 " || c.fourCC === "VP8L");
    if (!imageChunk) throw new Error("WebP file has neither VP8X nor a VP8/VP8L image chunk");
    const dims = imageChunk.fourCC === "VP8L" ? vp8lDimensions(imageChunk.data) : vp8Dimensions(imageChunk.data);
    const extraFlags = dims.hasAlpha ? VP8X_FLAG_ALPHA : 0;
    chunks.unshift({ fourCC: "VP8X", data: buildVp8xData(dims, extraFlags) });
  } else {
    const existing = chunks[vp8xIndex];
    if (existing.data.length < VP8X_CHUNK_DATA_BYTES) throw new Error("Malformed VP8X chunk");
    const updated = existing.data.slice();
    updated[0] |= VP8X_FLAG_XMP;
    chunks[vp8xIndex] = { fourCC: "VP8X", data: updated };
  }

  const xmpIndex = chunks.findIndex((c) => c.fourCC === "XMP ");
  const xmpChunk: WebpChunk = { fourCC: "XMP ", data: xmpData };
  if (xmpIndex === -1) chunks.push(xmpChunk);
  else chunks[xmpIndex] = xmpChunk;

  return writeWebpChunks(chunks);
}

export function readXmpFromWebp(bytes: Uint8Array): string | null {
  try {
    const chunks = parseWebpChunks(bytes);
    const xmpChunk = chunks.find((c) => c.fourCC === "XMP ");
    return xmpChunk ? textDecoder.decode(xmpChunk.data) : null;
  } catch {
    return null;
  }
}

// ── PNG ──────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_ITXT_KEYWORD = "XML:com.adobe.xmp";

interface PngChunk {
  type: string;
  data: Uint8Array;
}

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function parsePngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPngSignature(bytes)) throw new Error("Not a PNG file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = asciiAt(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) throw new Error(`PNG chunk '${type}' declares ${length} bytes but file is truncated`);
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
    offset = crcEnd;
    if (type === "IEND") break;
  }
  if (chunks.length === 0) throw new Error("PNG file has no chunks");
  return chunks;
}

/** ISO 3309 / zlib CRC-32 (poly 0xEDB88320, reflected), implemented by hand — every PNG chunk (including ones this module doesn't otherwise touch, since a full rewrite recomputes all of them) needs a CRC over its type+data, and there is no Deno/Node/browser-neutral CRC32 builtin to reach for. */
let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crc32Table = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writePngChunks(chunks: PngChunk[]): Uint8Array {
  let total = PNG_SIGNATURE.length;
  for (const chunk of chunks) total += 8 + chunk.data.length + 4;

  const out = new Uint8Array(total);
  out.set(PNG_SIGNATURE, 0);
  const view = new DataView(out.buffer);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    const typeBytes = textEncoder.encode(chunk.type);
    view.setUint32(offset, chunk.data.length, false);
    out.set(typeBytes, offset + 4);
    out.set(chunk.data, offset + 8);
    view.setUint32(offset + 8 + chunk.data.length, crc32(concatBytes(typeBytes, chunk.data)), false);
    offset += 8 + chunk.data.length + 4;
  }
  return out;
}

/** iTXt payload: keyword\0, compression flag, compression method, language tag\0, translated keyword\0, then UTF-8 text (PNG spec §11.3.4.4). We always write flag=0 (uncompressed) and empty language/translated-keyword fields — round-tripping compressed iTXt is not a case this module's own writer ever produces. */
function buildItxtChunkData(xmpPacket: string): Uint8Array {
  const keyword = textEncoder.encode(PNG_ITXT_KEYWORD);
  const text = textEncoder.encode(xmpPacket);
  const data = new Uint8Array(keyword.length + 5 + text.length);
  let offset = 0;
  data.set(keyword, offset);
  offset += keyword.length;
  data[offset++] = 0; // NUL terminates keyword
  data[offset++] = 0; // compression flag: uncompressed
  data[offset++] = 0; // compression method
  data[offset++] = 0; // empty language tag, NUL-terminated
  data[offset++] = 0; // empty translated keyword, NUL-terminated
  data.set(text, offset);
  return data;
}

function itxtKeyword(data: Uint8Array): string {
  const nul = data.indexOf(0);
  return textDecoder.decode(nul === -1 ? data : data.slice(0, nul));
}

function isXmpItxtChunk(chunk: PngChunk): boolean {
  return chunk.type === "iTXt" && itxtKeyword(chunk.data) === PNG_ITXT_KEYWORD;
}

function decodeItxtText(data: Uint8Array): string {
  let offset = data.indexOf(0) + 1; // past keyword NUL
  offset += 2; // compression flag + compression method
  offset = data.indexOf(0, offset) + 1; // past language tag NUL
  offset = data.indexOf(0, offset) + 1; // past translated-keyword NUL
  return textDecoder.decode(data.slice(offset));
}

/**
 * Embeds `xmpPacket` into a PNG as an `iTXt` chunk (keyword
 * `XML:com.adobe.xmp`, uncompressed) immediately before `IEND` — the
 * position Adobe's own XMP-in-PNG convention uses, so downstream tools
 * that scan backward from IEND for metadata find it. A prior XMP `iTXt`
 * chunk (if any) is dropped first so re-marking never leaves duplicates.
 */
export function embedXmpInPng(bytes: Uint8Array, xmpPacket: string): Uint8Array {
  const chunks = parsePngChunks(bytes).filter((c) => !isXmpItxtChunk(c));
  const iendIndex = chunks.findIndex((c) => c.type === "IEND");
  if (iendIndex === -1) throw new Error("PNG file has no IEND chunk");
  chunks.splice(iendIndex, 0, { type: "iTXt", data: buildItxtChunkData(xmpPacket) });
  return writePngChunks(chunks);
}

export function readXmpFromPng(bytes: Uint8Array): string | null {
  try {
    const xmpChunk = parsePngChunks(bytes).find(isXmpItxtChunk);
    return xmpChunk ? decodeItxtText(xmpChunk.data) : null;
  } catch {
    return null;
  }
}

// ── JPEG ─────────────────────────────────────────────────────────────────

const JPEG_MARKER_SOI = 0xd8;
const JPEG_MARKER_APP0 = 0xe0;
const JPEG_MARKER_APP1 = 0xe1;
const JPEG_MARKER_SOS = 0xda;
const JPEG_MARKER_EOI = 0xd9;
const JPEG_XMP_IDENTIFIER = "http://ns.adobe.com/xap/1.0/";

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === JPEG_MARKER_SOI;
}

/** Markers with no length/payload field — only relevant while scanning for a marker to skip past; TEM and the restart markers (RST0-7) never carry XMP so we don't need to inspect them. */
function isStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function jpegXmpIdentifierBytes(): Uint8Array {
  return textEncoder.encode(`${JPEG_XMP_IDENTIFIER}\0`);
}

function isXmpApp1Segment(segment: Uint8Array): boolean {
  const identifier = jpegXmpIdentifierBytes();
  if (segment.length < 4 + identifier.length) return false;
  for (let i = 0; i < identifier.length; i++) {
    if (segment[4 + i] !== identifier[i]) return false;
  }
  return true;
}

function buildApp1XmpSegment(xmpPacket: string): Uint8Array {
  const identifier = jpegXmpIdentifierBytes();
  const payload = textEncoder.encode(xmpPacket);
  const length = 2 + identifier.length + payload.length; // JPEG segment length includes the 2 length bytes themselves
  if (length > 0xffff) throw new Error("XMP packet too large for a single JPEG APP1 segment");

  const segment = new Uint8Array(2 + length);
  segment[0] = 0xff;
  segment[1] = JPEG_MARKER_APP1;
  new DataView(segment.buffer).setUint16(2, length, false);
  segment.set(identifier, 4);
  segment.set(payload, 4 + identifier.length);
  return segment;
}

/**
 * Embeds `xmpPacket` into a JPEG as an APP1 segment (Adobe XMP identifier)
 * right after SOI, after any existing APP0/APP1 segments — the
 * conventional position most XMP-aware readers scan first. Any existing
 * XMP APP1 in that leading run is dropped so re-marking never leaves
 * duplicates; a JFIF APP0 or an unrelated APP1 (e.g. Exif) is left in
 * place and in its original order.
 */
export function embedXmpInJpeg(bytes: Uint8Array, xmpPacket: string): Uint8Array {
  if (!isJpeg(bytes)) throw new Error("Not a JPEG file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const kept: Uint8Array[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker !== JPEG_MARKER_APP0 && marker !== JPEG_MARKER_APP1) break;
    const length = view.getUint16(offset + 2, false);
    const segment = bytes.slice(offset, offset + 2 + length);
    if (!(marker === JPEG_MARKER_APP1 && isXmpApp1Segment(segment))) kept.push(segment);
    offset += 2 + length;
  }

  return concatBytes(bytes.slice(0, 2), ...kept, buildApp1XmpSegment(xmpPacket), bytes.slice(offset));
}

export function readXmpFromJpeg(bytes: Uint8Array): string | null {
  try {
    if (!isJpeg(bytes)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 2 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (marker === JPEG_MARKER_EOI || marker === JPEG_MARKER_SOS) break;
      if (isStandaloneMarker(marker)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.length) break;
      const length = view.getUint16(offset + 2, false);
      const segment = bytes.slice(offset, offset + 2 + length);
      if (marker === JPEG_MARKER_APP1 && isXmpApp1Segment(segment)) {
        return textDecoder.decode(segment.slice(4 + jpegXmpIdentifierBytes().length));
      }
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

// ── dispatcher ───────────────────────────────────────────────────────────

/**
 * Marks `bytes` with `prov` for the given `contentType`. Marking must never
 * corrupt or throw on an asset it's about to hand to `uploadWithRetry` —
 * an unrecognised content type or any parse failure in the format-specific
 * embedder returns the original bytes unchanged rather than propagating
 * the error.
 */
export function embedProvenance(bytes: Uint8Array, contentType: string, prov: AiProvenance): Uint8Array {
  const xmpPacket = buildXmpPacket(prov);
  try {
    switch (contentType) {
      case "image/webp":
        return embedXmpInWebp(bytes, xmpPacket);
      case "image/png":
        return embedXmpInPng(bytes, xmpPacket);
      case "image/jpeg":
        return embedXmpInJpeg(bytes, xmpPacket);
      default:
        return bytes;
    }
  } catch {
    return bytes;
  }
}
