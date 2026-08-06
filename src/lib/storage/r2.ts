/**
 * Browser-side transport for R2-backed buckets (#577 stage 2).
 *
 * R2 has no RLS, so the browser never holds a credential that can write to it.
 * Instead the `r2-sign-upload` edge function re-derives the caller from their
 * JWT, applies the same prefix / MIME / size rules the `storage.objects`
 * policies express, and hands back a URL that is valid for exactly one key, one
 * content type and one byte length. Deletes go through `r2-delete` for the same
 * reason, minus the presigning — there is no body to stream around us.
 *
 * WHEN THIS PATH IS USED, and why the gate has two conditions:
 * only when the bucket is R2-backed **and** an asset CDN is configured. An R2
 * object is readable only through the Worker, so writing to R2 with no CDN
 * hostname would store bytes that no URL we can build points at. Falling back to
 * Supabase Storage in that state is not a degraded mode — the Worker's dual-read
 * serves both locations, so a bucket mid-migration works either way.
 */

import { supabase } from "@/lib/supabase";
import { isR2Bucket } from "@edge-shared/r2/config.ts";
import { MAX_DELETE_PATHS } from "@edge-shared/r2/api.ts";
import { ASSET_CDN_BASE, BUCKETS, type BucketKey } from "./buckets";

export interface PreparedUpload {
  readonly path: string;
  readonly blob: Blob;
  readonly contentType: string;
}

interface SignedUpload {
  readonly path: string;
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** True when writes for this bucket should go to R2 rather than Supabase Storage. */
export function usesR2(bucket: BucketKey): boolean {
  return isR2Bucket(BUCKETS[bucket].id) && ASSET_CDN_BASE !== null;
}

/**
 * The two failure classes, and the rule that decides which is which.
 *
 * An upload has two stages: **authorization** at `r2-sign-upload`, then
 * **transport** — the PUT to R2. The stage the failure happened in is what
 * determines whether falling back to Supabase Storage is right:
 *
 *   Authorization refused (403)  →  R2RefusedError, fatal.
 *     The caller may not write this path / type / size. Supabase's own policies
 *     encode the same rules and would refuse it too, so retrying there just
 *     replaces a precise error with a vague one.
 *
 *   Anything else                →  R2UnavailableError, fall back.
 *     R2 unprovisioned (503), the function unreachable, CORS not configured,
 *     the network flaking, or the PUT itself failing. By the time a PUT runs,
 *     authorization has already *passed* — so a failure there is infrastructure,
 *     never permission, and the correct response is to store the bytes the way
 *     we did yesterday rather than lose the user's upload.
 *
 * That second line is what makes flipping a bucket to R2 a low-risk change: the
 * worst case of a misconfiguration is that uploads quietly keep working exactly
 * as before, with a warning in the console, rather than failing app-wide.
 */
export class R2RefusedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "R2RefusedError";
  }
}

export class R2UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2UnavailableError";
  }
}

/**
 * Ask the edge function to authorize and presign every object in one call.
 *
 * One call rather than one per object: `uploadWithVariants` produces an original
 * plus four width variants, and authorization is all-or-nothing anyway (a
 * partially-authorized set would leave an image whose variants 404 forever).
 */
async function signUploads(bucket: BucketKey, uploads: readonly PreparedUpload[]): Promise<SignedUpload[]> {
  const { data, error } = await supabase.functions.invoke<{ uploads: SignedUpload[] }>("r2-sign-upload", {
    body: {
      bucket: BUCKETS[bucket].id,
      objects: uploads.map((u) => ({
        path: u.path,
        contentType: u.contentType,
        size: u.blob.size,
      })),
    },
  });

  if (error) {
    // supabase-js surfaces the status on FunctionsHttpError. Only a 403 is a
    // decision about this caller; every other outcome (503 unconfigured, 5xx,
    // or no status at all because the function was unreachable) is us failing
    // to ask, not R2 answering no.
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    if (status === 403) throw new R2RefusedError(error.message, status);
    throw new R2UnavailableError(`r2-sign-upload failed (${status || "unreachable"}): ${error.message}`);
  }
  if (!data?.uploads?.length) throw new R2UnavailableError("r2-sign-upload returned no URLs");
  return data.uploads;
}

/**
 * PUT one blob to its presigned URL.
 *
 * `Content-Length` is signed but deliberately not set here — browsers forbid
 * setting it, and set it themselves from the blob's size, which is the same
 * number the edge function signed. Sending a different body length therefore
 * fails R2's signature check rather than silently exceeding the bucket's cap.
 */
async function putSigned(signed: SignedUpload, blob: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(signed.url, {
      method: "PUT",
      headers: { "Content-Type": signed.headers["Content-Type"] },
      body: blob,
    });
  } catch (err) {
    // A thrown fetch here is almost always CORS — the browser refuses to reveal
    // more than "failed". It is also the single most likely R2 misconfiguration,
    // so it must degrade to the Supabase path rather than lose the upload.
    throw new R2UnavailableError(`R2 PUT ${signed.path} could not be sent: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    // Not R2RefusedError even on a 403: authorization already succeeded to get
    // this URL, so a 403 here means an expired or malformed signature — our bug,
    // and one the user should not pay for with a failed upload.
    throw new R2UnavailableError(`R2 PUT ${signed.path} failed (${response.status})`);
  }
}

export interface R2UploadOutcome {
  /** Paths that reached R2. */
  readonly uploaded: string[];
  /** Paths whose PUT failed — non-fatal for variants, fatal for an original. */
  readonly failed: string[];
}

/**
 * Authorize the whole set, then upload `first` before the rest.
 *
 * The ordering matters and is not incidental: `uploadWithVariants` treats the
 * original as fatal and its variants as best-effort, so uploading them all at
 * once would leave orphan variants behind whenever the original failed. One
 * presign call still covers the whole set, so the extra step costs no round trip.
 */
export async function uploadToR2(
  bucket: BucketKey,
  first: PreparedUpload,
  rest: readonly PreparedUpload[] = [],
): Promise<R2UploadOutcome> {
  const all = [first, ...rest];
  const signed = await signUploads(bucket, all);
  const byPath = new Map(signed.map((s) => [s.path, s]));

  const signedFirst = byPath.get(first.path);
  if (!signedFirst) throw new R2UnavailableError(`no signed URL returned for ${first.path}`);
  // The original goes first, so a failure here means no variants were attempted
  // and the Supabase fallback starts from a clean slate rather than leaving
  // orphan variants in R2.
  await putSigned(signedFirst, first.blob);

  const uploaded = [first.path];
  const failed: string[] = [];
  const results = await Promise.allSettled(
    rest.map(async (upload) => {
      const target = byPath.get(upload.path);
      if (!target) throw new Error(`no signed URL returned for ${upload.path}`);
      await putSigned(target, upload.blob);
      return upload.path;
    }),
  );
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") uploaded.push(result.value);
    else {
      failed.push(rest[index].path);
      console.warn(`[uploadToR2] ${BUCKETS[bucket].id}/${rest[index].path}:`, result.reason);
    }
  }

  return { uploaded, failed };
}

/**
 * Delete objects from R2.
 *
 * Deleting a key that is not there is a success — the client's cleanup paths
 * fire optimistically and can run twice, and during the dual-read window an
 * object may legitimately exist in only one of the two stores.
 */
export async function deleteFromR2(bucket: BucketKey, paths: string[]): Promise<void> {
  if (!paths.length) return;
  // Chunked to the function's own MAX_DELETE_PATHS. `deleteByPublicUrl` expands
  // each URL to five keys (original + four variants), so a multi-image cleanup
  // clears that ceiling easily, and the function rejects the whole batch rather
  // than truncating it.
  for (let i = 0; i < paths.length; i += MAX_DELETE_PATHS) {
    const chunk = paths.slice(i, i + MAX_DELETE_PATHS);
    const { error } = await supabase.functions.invoke("r2-delete", {
      body: { bucket: BUCKETS[bucket].id, paths: chunk },
    });
    if (error) {
      console.warn(`[deleteFromR2] ${BUCKETS[bucket].id}:`, error.message);
    }
  }
}
