/**
 * PNG checks shared by the edge functions that take a client-cut picture as base64 (generate-nook-part,
 * illuminate-picture). Pure, so a validator built on it is unit-testable without Deno's `serve`.
 *
 * The bytes are checked here for being a PNG, for size, and (when a mask travels) for the mask matching the
 * picture, because OpenAI's edit endpoint refuses a mismatched mask only after the credits are reserved.
 */

/** The largest picture or mask a function accepts, decoded. */
export const MAX_PNG_BYTES = 6 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decoded byte length of a base64 string without decoding it. */
export function base64DecodedLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** The first 24 bytes of a base64 PNG: enough for the signature and the IHDR width and height. */
function pngHeader(b64: string): number[] | null {
  try {
    const head = atob(b64.slice(0, 32));
    return Array.from(head, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function pngSize(header: number[]): { width: number; height: number } {
  const u32 = (at: number) => ((header[at] << 24) | (header[at + 1] << 16) | (header[at + 2] << 8) | header[at + 3]) >>> 0;
  return { width: u32(16), height: u32(20) };
}

/** Why `b64` is not an acceptable PNG, or the header bytes when it is. */
export function checkPng(b64: unknown): { error: string } | { header: number[] } {
  if (typeof b64 !== "string" || !b64) return { error: "invalid_image" };
  if (!BASE64.test(b64) || b64.length % 4 !== 0) return { error: "invalid_image" };
  if (base64DecodedLength(b64) > MAX_PNG_BYTES) return { error: "image_too_large" };
  const header = pngHeader(b64);
  if (!header || header.length < 24 || PNG_SIGNATURE.some((byte, i) => header[i] !== byte)) {
    return { error: "invalid_image" };
  }
  return { header };
}

/** Decodes validated base64 into a PNG Blob. */
export function pngBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
