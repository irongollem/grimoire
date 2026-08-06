/**
 * Upload paths — Supabase Storage, or R2 for the buckets that have moved (#577).
 *
 * Which store an upload lands in is decided once, in `usesR2`, and nowhere else.
 * Callers of `uploadToBucket` / `uploadWithVariants` are unchanged by the move
 * and get back the same public URL either way.
 */

import { supabase, getCurrentUser } from "@/lib/supabase";
import { resizeToWebP } from "@/lib/mediaConvert";
import { sniffImageFormat } from "@edge-shared/provenance/sniff.ts";
import { readXmpFromWebp, readXmpFromPng, readXmpFromJpeg, embedXmpInWebp } from "@edge-shared/provenance/embed.ts";
import { BUCKETS, VARIANT_WIDTHS, variantPath, type BucketKey } from "./buckets";
import { getPublicUrl, parsePublicUrl } from "./urls";
import { usesR2, uploadToR2, uploadAllToR2, R2UnavailableError, type PreparedUpload } from "./r2";

export interface UploadParams {
  bucket: BucketKey;
  blob: Blob;
  /**
   * Required when `path` is not provided — used to construct the
   * auto-generated `<userId>/<uuid>.<ext>` storage path.
   */
  userId?: string;
  /** Explicit storage path; skips auto-generation and makes `userId` optional. */
  path?: string;
  /** File extension for auto-generated path; default "webp". */
  ext?: string;
  /** MIME type sent in the upload; defaults to blob.type. */
  contentType?: string;
  /** When true, overwrite an existing object at the same path. */
  upsert?: boolean;
}

/**
 * Validate a blob against its bucket's config, returning the MIME to send.
 * Throws — a rejected upload should fail fast with a clear message rather than
 * bouncing off the storage layer with a generic 400.
 */
function validate(bucket: BucketKey, blob: Blob, contentType?: string): string {
  const cfg = BUCKETS[bucket];
  if (blob.size === 0) {
    throw new Error(`${cfg.id}: file is empty (0 bytes) — nothing to upload`);
  }
  if (blob.size > cfg.maxBytes) {
    throw new Error(
      `${cfg.id}: file is ${(blob.size / 1024 / 1024).toFixed(1)} MB, max ${(cfg.maxBytes / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  const mime = contentType ?? blob.type ?? "application/octet-stream";
  if (!(cfg.mimeTypes as readonly string[]).includes(mime)) {
    throw new Error(
      `${cfg.id}: ${mime} is not allowed (accepts ${cfg.mimeTypes.join(", ")})`,
    );
  }
  return mime;
}

async function uploadToSupabase(
  bucket: BucketKey,
  path: string,
  blob: Blob,
  mime: string,
  upsert: boolean,
): Promise<boolean> {
  const cfg = BUCKETS[bucket];
  const { error } = await supabase.storage.from(cfg.id).upload(path, blob, { contentType: mime, upsert });
  if (error) {
    console.warn(`[uploadToBucket] ${cfg.id}/${path}:`, error.message);
    return false;
  }
  return true;
}

/**
 * Upload a blob to a bucket and return the public URL.
 *
 * Throws on validation failure; returns null on storage error.
 *
 * For non-public buckets the storage path is returned in place of a URL —
 * callers can resolve a signed URL separately.
 */
export async function uploadToBucket({
  bucket,
  blob,
  userId,
  path,
  ext,
  contentType,
  upsert = false,
}: UploadParams): Promise<string | null> {
  const cfg = BUCKETS[bucket];
  const mime = validate(bucket, blob, contentType);
  const storagePath = path ?? `${userId}/${crypto.randomUUID()}.${ext ?? "webp"}`;

  let stored = false;
  if (usesR2(bucket)) {
    try {
      await uploadToR2(bucket, { path: storagePath, blob, contentType: mime });
      stored = true;
    } catch (err) {
      // Only "R2 isn't provisioned" falls through to Supabase. A refusal is a
      // real answer — Supabase's policies would give the same one — so retrying
      // there would just replace a clear error with a vague one.
      if (!(err instanceof R2UnavailableError)) {
        console.warn(`[uploadToBucket] ${cfg.id}/${storagePath}:`, err);
        return null;
      }
      stored = await uploadToSupabase(bucket, storagePath, blob, mime, upsert);
    }
  } else {
    stored = await uploadToSupabase(bucket, storagePath, blob, mime, upsert);
  }
  if (!stored) return null;

  if (!cfg.public) return storagePath;
  // Via getPublicUrl, not the raw client call, so uploads and reads share one
  // seam — otherwise a CDN-fronted bucket would be read from the CDN but keep
  // persisting origin URLs.
  return getPublicUrl(bucket, storagePath);
}

export interface UploadWithVariantsParams {
  bucket: BucketKey;
  blob: Blob;
  userId: string;
  /** Override the storage folder prefix. Defaults to `userId`. Use e.g. "srd" for canonical admin-managed art. */
  folderPrefix?: string;
}

/**
 * Reads an XMP packet out of `blob`'s bytes, if any — format is sniffed from
 * magic bytes (never `blob.type`, which b64-derived AI-generated blobs
 * routinely mislabel; see `sniffImageFormat`'s own doc). Returns null for an
 * unrecognised format, no embedded packet, or a parse failure — the read
 * functions already treat all three as "nothing to report."
 */
export async function readEmbeddedXmp(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  switch (sniffImageFormat(bytes)) {
    case "image/webp": return readXmpFromWebp(bytes);
    case "image/png":  return readXmpFromPng(bytes);
    case "image/jpeg": return readXmpFromJpeg(bytes);
    default:           return null;
  }
}

/**
 * Re-embeds `xmpPacket` (as read from the original via `readEmbeddedXmp`)
 * into a freshly-resized variant blob. `resizeToWebP` always canvas-encodes
 * its output — canvas never preserves embedded metadata — so a variant of a
 * marked original otherwise silently loses the mark. Variants are always
 * webp regardless of the original's format (`resizeToWebP`'s own contract),
 * so `embedXmpInWebp` is always the right embedder here. A null `xmpPacket`
 * (nothing to inherit — e.g. a plain user photo upload) leaves the variant
 * untouched; a malformed variant blob (shouldn't happen — see above) falls
 * back to the unmarked variant rather than failing the upload.
 */
export async function inheritXmpIntoVariant(variantBlob: Blob, xmpPacket: string | null): Promise<Blob> {
  if (!xmpPacket) return variantBlob;
  try {
    const bytes = new Uint8Array(await variantBlob.arrayBuffer());
    // Re-wrapped in a fresh Uint8Array: embed.ts's bare `Uint8Array` return
    // annotation widens to `Uint8Array<ArrayBufferLike>`, which BlobPart
    // rejects — the ArrayLike<number> constructor overload always yields
    // an ArrayBuffer-backed array regardless of the source's type parameter.
    return new Blob([new Uint8Array(embedXmpInWebp(bytes, xmpPacket))], { type: variantBlob.type });
  } catch {
    return variantBlob;
  }
}

/** Build the four resized, provenance-preserving variant blobs for an original. */
async function buildVariants(
  blob: Blob,
  originalPath: string,
  xmpPacket: string | null,
): Promise<PreparedUpload[]> {
  return Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const resized = await resizeToWebP(blob, width, 0.8);
      return {
        path: variantPath(originalPath, width),
        blob: await inheritXmpIntoVariant(resized, xmpPacket),
        contentType: "image/webp",
      };
    }),
  );
}

/**
 * Upload an image and pre-generate all 4 size variants.
 *
 * The original is stored at the canonical path (returned as the public URL and
 * saved in the DB). Variants are stored alongside it at e.g. `{uuid}_w400.webp`.
 * Variant upload failures are non-fatal — FocalImage falls back to the original
 * via @error.
 *
 * If the original carries an XMP provenance packet (EU AI Act Art 50(2) —
 * AI-generated originals are marked before they ever reach this function),
 * every variant inherits the same packet — otherwise only the original stays
 * disclosed and every resized copy silently loses the mark.
 */
export async function uploadWithVariants({
  bucket,
  blob,
  userId,
  folderPrefix,
}: UploadWithVariantsParams): Promise<string | null> {
  const ext = blob.type === "image/jpeg" ? "jpeg" : "webp";
  const originalPath = `${folderPrefix ?? userId}/${crypto.randomUUID()}.${ext}`;
  const mime = validate(bucket, blob, blob.type);

  // Variants are resized exactly once, whichever store ends up holding them.
  // The R2 fallback below reuses this array — an earlier revision rebuilt it,
  // paying a second full resizeToWebP pass in precisely the degraded case.
  const xmpPacket = await readEmbeddedXmp(blob);
  const variants = await buildVariants(blob, originalPath, xmpPacket);

  if (usesR2(bucket)) {
    try {
      // One authorization + presign call covers the original and all four
      // variants; uploadToR2 still writes the original first, so a failed
      // original never leaves orphan variants behind.
      await uploadToR2(bucket, { path: originalPath, blob, contentType: mime }, variants);
      return getPublicUrl(bucket, originalPath);
    } catch (err) {
      if (!(err instanceof R2UnavailableError)) {
        console.warn(`[uploadWithVariants] ${BUCKETS[bucket].id}/${originalPath}:`, err);
        return null;
      }
      // Fall through to Supabase below — via the direct helper, NOT
      // uploadToBucket, whose own usesR2 branch would re-attempt the R2 flow
      // we just watched fail and double every round trip in an outage.
    }
  }

  const stored = await uploadToSupabase(bucket, originalPath, blob, mime, false);
  if (!stored) return null;

  await Promise.allSettled(
    variants.map((variant) => uploadToSupabase(bucket, variant.path, variant.blob, "image/webp", false)),
  );

  return getPublicUrl(bucket, originalPath);
}

// ── Variant backfill ──────────────────────────────────────────────────────

// Tracks URLs already attempted this session so we don't retry on every render.
const _backfillAttempted = new Set<string>();

/**
 * Re-generate and upload missing size variants for an existing image.
 *
 * Called by FocalImage when a variant URL returns 4xx. Fire-and-forget: the
 * caller should not await this. Failures are swallowed — the image continues
 * to display at full resolution via the fallback. Permission errors are
 * expected when the current user didn't upload the original; the variants
 * will be filled in the next time the owner loads the image.
 */
export async function backfillVariants(originalUrl: string): Promise<void> {
  if (_backfillAttempted.has(originalUrl)) return;
  _backfillAttempted.add(originalUrl);

  // Defensive: refuse to backfill from a URL that already looks like a variant.
  // Without this, an `_w200.png` variant URL would yield `_w200_w200.webp` etc.,
  // permanently bloating storage with recursive variant chains.
  if (/_w\d+(?=[._])/.test(originalUrl)) return;

  try {
    // Identify which bucket owns this URL.
    // Limit to image buckets only — audio (sounds) has no visual variants.
    const parsed = parsePublicUrl(originalUrl);
    if (!parsed) return;
    const isImageBucket = (BUCKETS[parsed.bucket].mimeTypes as readonly string[]).some((m) =>
      m.startsWith("image/"),
    );
    if (!isImageBucket) return;
    const { bucket, path: storagePath } = parsed;

    // Only upload if the current user owns this path (first segment = userId).
    // Players loading DM-owned images would get RLS 400s — skip silently.
    const userId = getCurrentUser()?.id;
    if (!userId || !storagePath.startsWith(userId + "/")) return;

    // Download the original.
    const resp = await fetch(originalUrl);
    if (!resp.ok) {
      console.warn(`[backfillVariants] failed to fetch original (${resp.status}):`, originalUrl);
      return;
    }
    const blob = await resp.blob();
    // Same original → every variant should carry the same disclosure mark, if any.
    const xmpPacket = await readEmbeddedXmp(blob);
    const variants = await buildVariants(blob, storagePath, xmpPacket);

    if (usesR2(bucket)) {
      // uploadAllToR2, not uploadToR2: these four are peers, and the review
      // caught two bugs in the earlier shape — the fatal-first contract let one
      // transient failure abort the other three, and an R2UnavailableError
      // skipped the Supabase fallback both sibling paths implement.
      try {
        const outcome = await uploadAllToR2(bucket, variants);
        if (outcome.failed.length) {
          console.warn(`[backfillVariants] ${outcome.failed.length}/${variants.length} variant uploads failed for`, originalUrl);
        }
        return;
      } catch (err) {
        if (!(err instanceof R2UnavailableError)) throw err;
        // R2 down or unconfigured — backfill into Supabase Storage instead,
        // exactly as the pre-R2 code did; the Worker serves either store.
      }
    }

    // Generate and upload all variants. Do NOT upsert — several image buckets
    // (asset-images in particular) have no UPDATE storage policy, and
    // INSERT ... ON CONFLICT DO UPDATE requires both INSERT and UPDATE to pass RLS
    // even for new rows. The variants don't exist yet so plain INSERT is correct.
    const results = await Promise.allSettled(
      variants.map(async (variant) => {
        const url = await uploadToBucket({ bucket, blob: variant.blob, path: variant.path });
        if (!url) throw new Error(`upload returned null for ${variant.path}`);
      }),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length) {
      console.warn(`[backfillVariants] ${failures.length}/${results.length} variant uploads failed for`, originalUrl, failures.map((f) => f.reason));
    }
  } catch (err) {
    console.warn("[backfillVariants] unexpected error for", originalUrl, err);
  }
}
