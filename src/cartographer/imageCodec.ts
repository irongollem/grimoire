// Blob <-> base64 conversion for the AI map-restyle round trip: the baked
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
