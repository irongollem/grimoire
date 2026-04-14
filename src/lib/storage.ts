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

const THREE_MB  =  3 * 1024 * 1024;
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
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  assetImages: {
    id: "asset-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  spellImages: {
    id: "spell-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  puzzleImages: {
    id: "puzzle-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  itemImages: {
    id: "item-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  monsterImages: {
    id: "monster-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  trapImages: {
    id: "trap-images",
    maxBytes: THREE_MB,
    mimeTypes: WEBP_ONLY,
    public: true,
  },
  locationImages: {
    id: "location-images",
    maxBytes: THREE_MB,
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
    .upload(storagePath, blob, { contentType: mime });
  if (error) return null;

  if (!cfg.public) return storagePath;
  return supabase.storage.from(cfg.id).getPublicUrl(storagePath).data.publicUrl;
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
  await deleteFromBucket(bucket, paths);
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
    if (paths.length) await deleteFromBucket(key, paths);
  }
}
