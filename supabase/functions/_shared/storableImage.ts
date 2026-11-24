// A generated picture in a format the picture buckets take (#1021 row 17, #1271 review).
import decodePng from "@jsquash/png/decode";
import encodeWebp from "@jsquash/webp/encode";

/**
 * The picture in a format the place-picture bucket takes (WebP or JPEG). Gemini answers in PNG when it names no format,
 * which the bucket refuses after the picture was paid for (#1271 review); that is re-encoded as WebP, near-lossless,
 * at the same size, so the grid still lands where the plan put it.
 */
export async function storable(bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (contentType !== "image/png") return { bytes, contentType };
  const image = await decodePng(bytes.slice().buffer);
  return { bytes: new Uint8Array(await encodeWebp(image, { quality: 92 })), contentType: "image/webp" };
}
