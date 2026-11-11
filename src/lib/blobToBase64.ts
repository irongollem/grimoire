/**
 * Base64 of a blob's bytes, with no data-URL prefix, for the edge functions' `*_b64` fields.
 * Chunked: spreading a whole large picture into one `String.fromCharCode` call overflows the
 * argument limit, so the bytes go through in slices.
 */
const CHUNK = 0x8000;

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
