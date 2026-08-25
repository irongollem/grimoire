/**
 * Client-side mirror of the document importer's (#353) upload limits.
 *
 * Same idiom as `src/lib/storage/buckets.ts`: the server is authoritative —
 * the `import-documents` bucket enforces the byte cap and MIME allowlist
 * (migration 20260824204224), and the edge function enforces the Pro/free
 * page cap via `isUserPro` (supabase/functions/_shared/plan.ts) — and this
 * file exists only so the wizard can fail fast with a specific, useful error
 * instead of bouncing off the storage layer or burning a paid extraction call
 * on a document it was always going to reject.
 *
 * ── Why there is a page cap at all ────────────────────────────────────────
 *
 * Two real reasons, not one arbitrary guardrail:
 *
 *   1. Cost. A generator prompt is a sentence; a document is 1–3 orders of
 *      magnitude more input tokens, and the extractor runs one pass per
 *      entity kind. Uncapped page counts turn an unpredictable line item into
 *      an unbounded one.
 *   2. The EU sui generis database right (Directive 96/9/EC). It protects a
 *      compiled database — a bestiary, a gazetteer — against extraction of a
 *      *substantial part*, independent of copyright in the individual
 *      entries. A handful of statblocks pulled from a chapter is a DM
 *      prepping a session; an entire rulebook run through the importer is
 *      systematic extraction of the database itself. The page cap is what
 *      keeps every import on the first side of that line.
 *
 * The Pro/free split (50 vs 10 pages) is a product tier on top of that
 * ceiling, not a substitute for it — Pro does not get to bulk-import whole
 * books either.
 */

/** Page cap for a free-plan upload. */
export const FREE_PAGE_LIMIT = 10;

/** Page cap for a Pro-equivalent upload (pro/tester/admin — see `isUserPro`). */
export const PRO_PAGE_LIMIT = 50;

/** The page cap that applies to a given plan tier. */
export function pageLimitFor(isPro: boolean): number {
  return isPro ? PRO_PAGE_LIMIT : FREE_PAGE_LIMIT;
}

/**
 * Mirrors the `import-documents` bucket's per-object `file_size_limit`
 * (migration 20260824204224): 25 MB, enough for a chapter-sized PDF or any
 * single page photo. This one is a real database constraint — the upload is
 * rejected by Storage itself, not merely by this file — so it moves only in
 * step with a migration.
 */
export const MAX_UPLOAD_BYTES = 26214400;

/**
 * Cap on the *combined* size of one import, which is a different question from
 * the per-object limit above and deliberately a different number.
 *
 * Storage's limit is per object, so without this a batch of page photos is
 * unbounded — the extractor base64s every part into a single provider request,
 * and 50 untouched camera originals is a few hundred megabytes of it.
 *
 * 40 MB is sized against what actually gets uploaded, which is the *downscaled*
 * batch (`downscale.ts`): a page photo lands at roughly 250–500 KB, so the free
 * tier's 10 pages is about 5 MB and Pro's 50 is about 25 MB. The headroom above
 * that covers denser scans without letting an untouched batch through.
 *
 * Reusing the 25 MB per-object figure here — the obvious move, since both are
 * "the upload limit" — quietly made the page caps unreachable: at 2–5 MB a raw
 * photo, even ten of them blew past it, so the free tier could not fill its own
 * page allowance. Keep the two numbers separate.
 *
 * `MAX_IMPORT_BYTES` in `supabase/functions/import-extract/index.ts` is the
 * server-side half of this and must hold the same value; the client cannot be
 * trusted with a bound on what the server downloads.
 */
export const MAX_IMPORT_BYTES = 41943040;

/**
 * Validates the combined size of every object in one import. Called *after*
 * downscaling, in `useCreateDocumentImport` — run against camera originals it
 * rejects batches that fit comfortably once reduced.
 */
export function validateTotalUploadBytes(byteSize: number): UploadValidationResult {
  if (byteSize > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `The combined upload is ${(byteSize / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_IMPORT_BYTES / (1024 * 1024)} MB per import.`,
    };
  }
  return { ok: true };
}

/** Mirrors the `import-documents` bucket's `allowed_mime_types`. */
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/** Everything the pre-flight check needs to know about a pending upload. */
export interface UploadCandidate {
  pageCount: number;
  byteSize: number;
  mimeType: string;
  isPro: boolean;
}

export type UploadValidationFailureReason = "too_many_pages" | "too_large" | "unsupported_type";

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; reason: UploadValidationFailureReason; message: string };

/**
 * Pre-flight validation for a document upload, run before the object ever
 * reaches storage or the extractor.
 *
 * Returns a discriminated result rather than a boolean because the wizard has
 * to react differently per failure: "too_many_pages" on a free plan is an
 * upsell ("upgrade to Pro"), the same reason on a Pro account is a hard
 * ceiling, and "unsupported_type" is a plain user error. Collapsing those
 * into `false` would leave the UI unable to tell them apart.
 */
export function validateUpload(candidate: UploadCandidate): UploadValidationResult {
  // Widen the tuple to `readonly string[]` rather than casting the incoming
  // value to `AcceptedMimeType` — the whole point of this line is that we do
  // not yet know it is one, and a cast that asserts otherwise would be a lie
  // the next reader has to unpick.
  const accepted: readonly string[] = ACCEPTED_MIME_TYPES;
  if (!accepted.includes(candidate.mimeType)) {
    return {
      ok: false,
      reason: "unsupported_type",
      message: `${candidate.mimeType} isn't supported. Upload a PDF or a JPEG/PNG/WebP photo.`,
    };
  }

  if (candidate.byteSize > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `File is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const limit = pageLimitFor(candidate.isPro);
  if (candidate.pageCount > limit) {
    return {
      ok: false,
      reason: "too_many_pages",
      message: candidate.isPro
        ? `That document has ${candidate.pageCount} pages. The limit is ${limit} pages per import.`
        : `That document has ${candidate.pageCount} pages. Free accounts are limited to ${limit} pages per import — upgrade to Pro for up to ${PRO_PAGE_LIMIT}.`,
    };
  }

  return { ok: true };
}
