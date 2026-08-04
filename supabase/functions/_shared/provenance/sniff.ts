/**
 * Detects an image's true wire format from its magic bytes.
 *
 * Client code routinely carries images in Blobs/Files whose `.type` was set
 * by whoever constructed them rather than sniffed from the bytes — and that
 * label is often wrong. `b64ToBlob` (src/ai/utils.ts) defaults every decoded
 * provider response to "image/webp" regardless of what the provider actually
 * returned (Gemini: PNG, fal.ai: JPEG, OpenAI: WebP), and a canvas round-trip
 * can relabel bytes without changing them. Anything that needs to pick the
 * correct format-specific XMP reader/embedder (embed.ts) must sniff the real
 * format rather than trust that label.
 *
 * Returns null for anything that isn't one of the three formats this
 * provenance module knows how to read/write XMP for.
 */
export function sniffImageFormat(bytes: Uint8Array): "image/webp" | "image/png" | "image/jpeg" | null {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isWebp(bytes)) return "image/webp";
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** JPEG files always start with the SOI marker 0xFFD8 (ITU-T T.81 Annex B). */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** RIFF/WEBP: "RIFF" fourCC, a 4-byte size field we don't need to read here, then the "WEBP" form type (WebP Container Spec). */
function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}
