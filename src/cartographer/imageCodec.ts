// Blob <-> base64 conversion for the AI map-restyle round trip (and, at the
// bottom, the tile pipeline's guarded WebP encoder): the baked
// PNG goes to the `style-map` edge function as base64 in a JSON body, and
// the restyled image comes back the same way.
//
// The encode side is a byte-by-byte binary-string build rather than any
// chunked/streaming approach — deliberately. Do not "optimise" this into a
// different algorithm; it must stay byte-for-byte identical, including
// bytes >= 0x80, or restyled images silently corrupt. See the colocated test.

/** Converts a Blob to a base64 string. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Converts a base64 string back to a Blob of the given MIME type. */
export function base64ToBlob(b64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

/**
 * Encodes a canvas as WebP, or fails saying why.
 *
 * `toBlob`'s type is a request, not a promise: a browser that cannot encode
 * WebP hands back a PNG without complaint (Safari on iOS is the one that
 * matters here). Tile packs store WebP and `tile-pack-generator` checks for it,
 * so the silent PNG used to travel to the server and come back as a refusal
 * nobody could read: an admin generating a pack on an iPhone saw only "Edge
 * Function returned a non-2xx status code" (26 Sep 2026). Checking the blob's
 * type here turns that into a message that says what to do instead.
 */
export function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => {
      if (!blob) reject(new Error("The browser could not encode this image."));
      else if (blob.type !== "image/webp") reject(new Error(WEBP_UNSUPPORTED));
      else resolve(blob);
    },
    "image/webp",
    quality,
  ));
}

export const WEBP_UNSUPPORTED =
  "This browser can't save WebP images, which tile packs need. Use Chrome, Edge or Firefox on a computer for this step.";
