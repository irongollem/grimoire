/**
 * Fetches one picture from a URL that has ALREADY passed the storage SSRF guard (`isSafeStorageUrl`), for the look's
 * pictures (#1252): describe-look reads them, the generators hand them to an image model as style references.
 *
 * A picture is accepted only when it is a png, jpeg or webp, non-empty and under the byte cap; it is never trusted
 * on a 200 alone, because a provider answers 400 to a body it cannot read and that failure is not a refusal, so one
 * bad URL would fail every AI picture in the campaign. Redirects are refused (a storage URL that redirects is not
 * one of ours) and the wait is bounded so a URL that hangs cannot stall a generator.
 */

/** One picture, in bytes, before it is sent to a provider as input. */
export const MAX_STYLE_IMAGE_BYTES = 8 * 1024 * 1024;
// Storage answers in well under a second; this is long enough for an 8 MB body on a slow link and short enough that a
// hanging URL does not hold up a generation the DM is waiting on.
export const IMAGE_FETCH_TIMEOUT_MS = 8000;

const IMAGE_TYPES: Record<string, string> = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/webp": "image/webp" };

/** The bare media type when it is one the providers read (png, jpeg, webp), else null. Parameters are ignored. */
export function acceptedImageType(contentType: string | null): string | null {
  const bare = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return Object.hasOwn(IMAGE_TYPES, bare) ? IMAGE_TYPES[bare] : null;
}

export interface FetchedImage {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/** The picture, or null when it is missing, not an accepted image type, empty or over the cap. Throws on a redirect, timeout or network error. */
export async function fetchGuardedImage(url: string): Promise<FetchedImage | null> {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const mimeType = acceptedImageType(res.headers.get("content-type"));
  if (!mimeType) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_STYLE_IMAGE_BYTES) return null;
  return { bytes, mimeType };
}
