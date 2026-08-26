import { decodeBase64 } from "./normalizeGeneratedTile.ts";

/**
 * The edge side of the pack generator attaches the approved proof tiles to every
 * pack-phase call so the family stays coherent. Those references are charged as
 * image-input tokens and they are not cheap: production `gpt-image-2` rows
 * measure ~1500 tokens per 1024x1024 reference, so three of them cost several
 * times the 196-token tile they help produce, and at 1024px they dominated the
 * price of a pack outright.
 *
 * Tokens scale with area, so a 256x256 reference is 1/16 of that while still
 * carrying palette, material and rendering style — which is all a style
 * reference is for; the geometry comes from the prompt and the template.
 *
 * Built in the browser because the tile is already decoded here for
 * normalization, and the edge runtime has no image library. Adding one is not
 * free either: every edge dependency is resolved over the network at deploy
 * time, and a CDN failure there fails the whole release.
 */
export const STYLE_REFERENCE_SIZE = 256;

export async function styleReferenceFrom(imageB64: string, contentType: string): Promise<Blob> {
  const bytes = decodeBase64(imageB64);
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: contentType }));
  const canvas = document.createElement("canvas");
  canvas.width = STYLE_REFERENCE_SIZE;
  canvas.height = STYLE_REFERENCE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.drawImage(bitmap, 0, 0, STYLE_REFERENCE_SIZE, STYLE_REFERENCE_SIZE);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Style reference encoding failed")),
    "image/webp",
    0.85,
  ));
}
