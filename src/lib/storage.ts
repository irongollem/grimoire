/**
 * Centralised storage bucket registry + upload helpers.
 *
 * Every Supabase storage bucket the app uses is declared in `BUCKETS` below
 * with the same MIME / size / public-flag config that the matching SQL
 * migration enforces server-side. Routing all upload sites through this
 * module gives us:
 *
 *   1. One place to look for "what buckets exist and how are they configured"
 *   2. Compile-time guarantees that we don't typo a bucket id
 *   3. Client-side guards (size + MIME) that fail fast with a useful error
 *      instead of bouncing off the storage layer with a generic 400
 *   4. A single migration story when bucket policy changes
 *
 * **All image uploads are converted to WebP before reaching this module.**
 * AI generators decode their model output to a WebP blob via `b64ToBlob`;
 * user-driven uploads route through `useImageUpload` which calls
 * `toWebP()` first. As a result the three image buckets are restricted to
 * `image/webp` only — anything else is a bug. SVGs were dropped from the
 * allowlist when this happened (see migration 20260413000004).
 */

import { supabase, getCurrentUser } from "@/lib/supabase";
import { resizeToWebP } from "@/lib/mediaConvert";

// ── Config ───────────────────────────────────────────────────────────────

export interface BucketConfig {
  /** Bucket id as it exists in Supabase storage. */
  readonly id: string;
  /** Server-enforced cap (we mirror it client-side for early failure). */
  readonly maxBytes: number;
  /** Server-enforced MIME allowlist (we mirror it client-side). */
  readonly mimeTypes: readonly string[];
  /** True when objects are readable without a signed URL. */
  readonly public: boolean;
  /**
   * Whether uploads to this bucket should generate pre-sized variants.
   * Only entity-image buckets displayed through FocalImage need variants.
   * Scriptorium rich-text embeds (assetImages) and sounds do NOT.
   */
  readonly generateVariants: boolean;
}

const FIVE_MB   =  5 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;

const IMAGE_MIMES = ["image/webp", "image/jpeg"] as const;

const AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/flac",
] as const;

export const BUCKETS = {
  npcPortraits: {
    id: "npc-portraits",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  assetImages: {
    id: "asset-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: false, // Scriptorium rich-text embeds — never displayed via FocalImage
  },
  spellImages: {
    id: "spell-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  puzzleImages: {
    id: "puzzle-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  itemImages: {
    id: "item-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  monsterImages: {
    id: "monster-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  trapImages: {
    id: "trap-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  locationImages: {
    id: "location-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
  },
  sounds: {
    id: "sounds",
    maxBytes: TWENTY_MB,
    mimeTypes: AUDIO_MIMES,
    public: true,
    generateVariants: false,
  },
  chronicle: {
    id: "chronicle",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: false, // Displayed as thumbnails via CSS; no FocalImage variants needed
  },
} as const satisfies Record<string, BucketConfig>;

export type BucketKey = keyof typeof BUCKETS;

// ── Variant widths ────────────────────────────────────────────────────────

/**
 * The 4 fixed render widths used by FocalImage. Variants are pre-generated at
 * upload time so the Supabase transform API is never needed at display time.
 */
export const VARIANT_WIDTHS = [200, 300, 400, 600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/**
 * Derive the storage path for a pre-generated size variant from the original
 * object path.
 *
 * Example:
 *   variantPath("abc/img.webp", 400) → "abc/img_w400.webp"
 */
export function variantPath(originalPath: string, width: VariantWidth): string {
  // Variants are always .webp regardless of the original's extension (png/jpeg/webp).
  const lastDot = originalPath.lastIndexOf(".");
  const stem = lastDot === -1 ? originalPath : originalPath.slice(0, lastDot);
  return `${stem}_w${width}.webp`;
}

// ── Upload / read / delete ────────────────────────────────────────────────

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
 * Upload a blob to a bucket and return the public URL.
 *
 * Validates size + MIME against the bucket's config before calling Supabase
 * so a rejected upload fails fast with a clear message instead of a generic
 * storage 400. Throws on validation failure; returns null on Supabase error.
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

  const storagePath = path ?? `${userId}/${crypto.randomUUID()}.${ext ?? "webp"}`;
  const { error } = await supabase.storage
    .from(cfg.id)
    .upload(storagePath, blob, { contentType: mime, upsert });
  if (error) {
    console.warn(`[uploadToBucket] ${cfg.id}/${storagePath}:`, error.message);
    return null;
  }

  if (!cfg.public) return storagePath;
  return supabase.storage.from(cfg.id).getPublicUrl(storagePath).data.publicUrl;
}

export interface UploadWithVariantsParams {
  bucket: BucketKey;
  blob: Blob;
  userId: string;
}

/**
 * Upload an image and pre-generate all 4 size variants in parallel.
 *
 * The original is stored at the canonical path (returned as the public URL and
 * saved in the DB). Variants are stored alongside it at e.g. `{uuid}_w400.webp`.
 * Variant upload failures are non-fatal — FocalImage falls back to the original
 * via @error.
 */
export async function uploadWithVariants({
  bucket,
  blob,
  userId,
}: UploadWithVariantsParams): Promise<string | null> {
  const ext = blob.type === "image/jpeg" ? "jpeg" : "webp";
  const originalPath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const originalUrl = await uploadToBucket({ bucket, blob, path: originalPath, contentType: blob.type });
  if (!originalUrl) return null;

  await Promise.allSettled(
    VARIANT_WIDTHS.map(async (width) => {
      const variantBlob = await resizeToWebP(blob, width, 0.8);
      await uploadToBucket({ bucket, blob: variantBlob, path: variantPath(originalPath, width) });
    }),
  );

  return originalUrl;
}

/** Get a public URL for an existing object (no fetch — pure URL builder). */
export function getPublicUrl(bucket: BucketKey, path: string): string {
  return supabase.storage.from(BUCKETS[bucket].id).getPublicUrl(path).data.publicUrl;
}

/** Remove one or more objects by storage path. */
export async function deleteFromBucket(bucket: BucketKey, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await supabase.storage.from(BUCKETS[bucket].id).remove(paths);
}

/** Expand a list of storage paths to include all pre-generated variant paths. */
function pathsWithVariants(paths: string[]): string[] {
  return paths.flatMap((p) => [p, ...VARIANT_WIDTHS.map((w) => variantPath(p, w))]);
}

/**
 * Remove objects from a bucket given their public URLs. Silently no-ops on
 * URLs that don't belong to this bucket — useful when cleaning up rich-text
 * documents that may reference external images alongside ours.
 */
export async function removeByPublicUrl(
  bucket: BucketKey,
  ...urls: (string | null | undefined)[]
): Promise<void> {
  const bucketId = BUCKETS[bucket].id;
  const marker = `/object/public/${bucketId}/`;
  const paths = urls
    .filter((u): u is string => !!u && u.includes(marker))
    .map((u) => decodeURIComponent(u.slice(u.indexOf(marker) + marker.length)));
  await deleteFromBucket(bucket, pathsWithVariants(paths));
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

  try {
    // Identify which bucket owns this URL.
    // Limit to image buckets only — audio (sounds) has no visual variants.
    let bucketKey: BucketKey | null = null;
    let storagePath: string | null = null;
    for (const [key, cfg] of Object.entries(BUCKETS) as [BucketKey, BucketConfig][]) {
      const isImageBucket = (cfg.mimeTypes as readonly string[]).some((m) => m.startsWith("image/"));
      if (!isImageBucket) continue;
      const marker = `/object/public/${cfg.id}/`;
      if (originalUrl.includes(marker)) {
        bucketKey = key;
        storagePath = decodeURIComponent(originalUrl.slice(originalUrl.indexOf(marker) + marker.length));
        break;
      }
    }
    if (!bucketKey || !storagePath) return;

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

    // Generate and upload all variants. Do NOT upsert — several image buckets
    // (asset-images in particular) have no UPDATE storage policy, and
    // INSERT ... ON CONFLICT DO UPDATE requires both INSERT and UPDATE to pass RLS
    // even for new rows. The variants don't exist yet so plain INSERT is correct.
    const path = storagePath;
    const bucket = bucketKey;
    const results = await Promise.allSettled(
      VARIANT_WIDTHS.map(async (width) => {
        const variantBlob = await resizeToWebP(blob, width, 0.8);
        const url = await uploadToBucket({ bucket, blob: variantBlob, path: variantPath(path, width) });
        if (!url) throw new Error(`upload returned null for width ${width}`);
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

/**
 * Delete storage objects given their public URLs, auto-detecting the bucket
 * from the URL itself. Works across all registered buckets — safe to call
 * when a record may have URLs in different buckets (e.g. after a bucket rename).
 */
export async function deleteByPublicUrl(...urls: (string | null | undefined)[]): Promise<void> {
  for (const [key, cfg] of Object.entries(BUCKETS) as [BucketKey, BucketConfig][]) {
    const marker = `/object/public/${cfg.id}/`;
    const paths = urls
      .filter((u): u is string => !!u && u.includes(marker))
      .map((u) => decodeURIComponent(u.slice(u.indexOf(marker) + marker.length)));
    if (paths.length) await deleteFromBucket(key, pathsWithVariants(paths));
  }
}
