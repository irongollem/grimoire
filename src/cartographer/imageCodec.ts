// base64 -> Blob for the AI map-restyle round trip: the restyled image comes back from the
// `style-map` edge function as base64. The encode side is `@/lib/blobToBase64`.

/** Converts a base64 string back to a Blob of the given MIME type. */
export function base64ToBlob(b64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}
