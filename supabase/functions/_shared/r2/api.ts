// Request parsing + authorization for the two R2 storage edge functions
// (#577 stage 2).
//
// Kept apart from the function handlers so the security-relevant half — what the
// body is allowed to contain, and which paths a given caller may touch — is a
// pure function with no Deno, no network and no Supabase client, and can be
// tested exhaustively. The handlers are then thin enough to read in one go.

import { authorizePath, authorizeUpload, type AuthzResult } from "../storage-policy.ts";
import { isR2Bucket } from "./config.ts";

/**
 * An upload request carries at most one original plus its four width variants
 * (`VARIANT_WIDTHS` in src/lib/storage.ts). The cap is deliberately just above
 * that: a presign is cheap, but an unbounded array turns one authenticated
 * request into unbounded signing work.
 */
export const MAX_UPLOAD_OBJECTS = 8;

/**
 * A delete request covers an entity's images plus their variants — five keys per
 * URL, and `deleteByPublicUrl` may be handed several URLs at once.
 */
export const MAX_DELETE_PATHS = 64;

/** Short enough that a leaked URL is not a standing grant; long enough for a 50 MB mini on a slow line. */
export const UPLOAD_URL_TTL_SECONDS = 900;

export interface RequestedUpload {
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
}

export interface SignUploadRequest {
  readonly bucket: string;
  readonly objects: readonly RequestedUpload[];
}

export interface DeleteRequest {
  readonly bucket: string;
  readonly paths: readonly string[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): Parsed<never> => ({ ok: false, error });

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * Validate the bucket name is one this function is willing to act on at all.
 *
 * `isR2Bucket` rather than "is a known bucket": a bucket whose bytes still live
 * in Supabase must keep going through Supabase Storage and its RLS. Signing an
 * R2 PUT for it would write an object no read path looks at, and — worse — the
 * client would then persist a URL pointing at bytes that do not exist.
 */
function parseBucket(raw: unknown): Parsed<string> {
  if (typeof raw !== "string" || !raw) return fail("bucket is required");
  if (!isR2Bucket(raw)) return fail(`bucket "${raw}" is not served from R2`);
  return { ok: true, value: raw };
}

export function parseSignUploadRequest(body: unknown): Parsed<SignUploadRequest> {
  const record = asRecord(body);
  if (!record) return fail("body must be a JSON object");

  const bucket = parseBucket(record.bucket);
  if (!bucket.ok) return bucket;

  const raw = record.objects;
  if (!Array.isArray(raw) || raw.length === 0) return fail("objects must be a non-empty array");
  if (raw.length > MAX_UPLOAD_OBJECTS) return fail(`at most ${MAX_UPLOAD_OBJECTS} objects per request`);

  const objects: RequestedUpload[] = [];
  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) return fail("each object must be a JSON object");
    const { path, contentType, size } = item;
    if (typeof path !== "string" || !path) return fail("object.path is required");
    if (typeof contentType !== "string" || !contentType) return fail("object.contentType is required");
    if (typeof size !== "number") return fail("object.size must be a number");
    objects.push({ path, contentType, size });
  }

  // Duplicate paths in one request would produce two signatures for one key —
  // harmless but always a caller bug, and cheap to refuse.
  const paths = new Set(objects.map((o) => o.path));
  if (paths.size !== objects.length) return fail("duplicate paths in one request");

  return { ok: true, value: { bucket: bucket.value, objects } };
}

export function parseDeleteRequest(body: unknown): Parsed<DeleteRequest> {
  const record = asRecord(body);
  if (!record) return fail("body must be a JSON object");

  const bucket = parseBucket(record.bucket);
  if (!bucket.ok) return bucket;

  const raw = record.paths;
  if (!Array.isArray(raw) || raw.length === 0) return fail("paths must be a non-empty array");
  if (raw.length > MAX_DELETE_PATHS) return fail(`at most ${MAX_DELETE_PATHS} paths per request`);
  if (!raw.every((p): p is string => typeof p === "string" && !!p)) {
    return fail("paths must be non-empty strings");
  }

  return { ok: true, value: { bucket: bucket.value, paths: [...new Set(raw)] } };
}

export interface Caller {
  readonly userId: string;
  readonly isAdmin: boolean;
}

/**
 * Authorize every requested upload, all-or-nothing.
 *
 * All-or-nothing on purpose: a partial success would leave an original uploaded
 * with some variants refused (or vice versa), which is worse than a clean refusal
 * — the client would persist a URL whose variants silently 404 forever.
 */
export function authorizeUploads(
  request: SignUploadRequest,
  caller: Caller,
): AuthzResult {
  for (const object of request.objects) {
    const result = authorizeUpload({
      bucketId: request.bucket,
      path: object.path,
      userId: caller.userId,
      isAdmin: caller.isAdmin,
      contentType: object.contentType,
      size: object.size,
    });
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

/** Same all-or-nothing rule for deletes: one unauthorized path fails the batch. */
export function authorizeDeletes(request: DeleteRequest, caller: Caller): AuthzResult {
  for (const path of request.paths) {
    const result = authorizePath({
      bucketId: request.bucket,
      path,
      userId: caller.userId,
      isAdmin: caller.isAdmin,
    });
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
