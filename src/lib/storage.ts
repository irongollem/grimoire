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

import { supabase } from "@/lib/supabase";

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
}

const TEN_MB    = 10 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;

const WEBP_ONLY = ["image/webp"] as const;

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
    maxBytes: TEN_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  assetImages: {
    id: "asset-images",
    maxBytes: TEN_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  spellImages: {
    id: "spell-images",
    maxBytes: TEN_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  puzzleImages: {
    id: "puzzle-images",
    maxBytes: TEN_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  sounds: {
    id: "sounds",
    maxBytes: TWENTY_MB,
    mimeTypes: AUDIO_MIMES,
    public: true,
  },
} as const satisfies Record<string, BucketConfig>;

export type BucketKey = keyof typeof BUCKETS;

// ── Upload / read / delete ────────────────────────────────────────────────

export interface UploadOptions {
  /** Override the auto-generated `<userId>/<uuid>.<ext>` path. */
  path?: string;
  /** File extension when generating a path; default "webp". */
  ext?: string;
  /** Override the MIME type sent in the upload (defaults to blob.type). */
  contentType?: string;
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
export async function uploadToBucket(
  bucket: BucketConfig,
  userId: string,
  blob: Blob,
  options: UploadOptions = {},
): Promise<string | null> {
  if (blob.size > bucket.maxBytes) {
    throw new Error(
      `${bucket.id}: file is ${(blob.size / 1024 / 1024).toFixed(1)} MB, max ${(bucket.maxBytes / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  const contentType = options.contentType ?? blob.type ?? "application/octet-stream";
  if (!bucket.mimeTypes.includes(contentType)) {
    throw new Error(
      `${bucket.id}: ${contentType} is not allowed (accepts ${bucket.mimeTypes.join(", ")})`,
    );
  }

  const path = options.path ?? `${userId}/${crypto.randomUUID()}.${options.ext ?? "webp"}`;
  const { error } = await supabase.storage
    .from(bucket.id)
    .upload(path, blob, { contentType });
  if (error) return null;

  if (!bucket.public) return path;
  return supabase.storage.from(bucket.id).getPublicUrl(path).data.publicUrl;
}

/** Get a public URL for an existing object (no fetch — pure URL builder). */
export function getPublicUrl(bucket: BucketConfig, path: string): string {
  return supabase.storage.from(bucket.id).getPublicUrl(path).data.publicUrl;
}

/** Remove one or more objects by storage path. */
export async function deleteFromBucket(
  bucket: BucketConfig,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  await supabase.storage.from(bucket.id).remove(paths);
}

/**
 * Remove objects from a bucket given their public URLs. Silently no-ops on
 * URLs that don't belong to this bucket — useful when cleaning up rich-text
 * documents that may reference external images alongside ours.
 */
export async function removeByPublicUrl(
  bucket: BucketConfig,
  ...urls: (string | null | undefined)[]
): Promise<void> {
  const marker = `/object/public/${bucket.id}/`;
  const paths = urls
    .filter((u): u is string => !!u && u.includes(marker))
    .map((u) => decodeURIComponent(u.slice(u.indexOf(marker) + marker.length)));
  await deleteFromBucket(bucket, paths);
}
