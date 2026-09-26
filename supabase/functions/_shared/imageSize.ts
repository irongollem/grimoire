/**
 * Reads a PNG's width/height straight from its IHDR chunk, without decoding
 * any pixels. `style-map` uses this to derive the size it requests from the
 * image provider from the image the client actually uploaded, rather than
 * trusting a client-supplied size field that could claim anything — the
 * client cannot ask for an arbitrary output size, because there is nothing
 * to ask with; the uploaded bytes are the only source of truth.
 *
 * PNG layout: an 8-byte signature, then IHDR as its very first chunk always:
 * a 4-byte length (13), the 4-byte type "IHDR", a 4-byte width (big-endian),
 * a 4-byte height (big-endian), then bit depth/color type/etc. Width sits at
 * byte offset 16, height at 20.
 */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!isPng) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * OpenAI's `gpt-image` size constraints for the `style-map` endpoint (per
 * OpenAI's image-generation guide, 26 Sep 2026): width/height must be
 * multiples of 16, aspect ratio between 1:3 and 3:1, neither edge over
 * 3840px, and total pixels between 655,360 and 8,294,400 (4K px). The
 * client is expected to have already fit its render to this window
 * (`src/cartographer/bake.ts`'s `fitStyleInputCanvas`); this is the
 * server-side re-check that rejects a request whose actual uploaded image
 * doesn't satisfy these rules, rather than forwarding it to a paid provider
 * call that would itself reject or mishandle it.
 */
export function isValidStyleImageSize(width: number, height: number): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width <= 0 || height <= 0) return false;
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  if (width > 3840 || height > 3840) return false;
  const total = width * height;
  if (total < 655_360 || total > 8_294_400) return false;
  const aspect = width / height;
  if (aspect < 1 / 3 || aspect > 3) return false;
  return true;
}
