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
import { sniffImageFormat } from "@edge-shared/provenance/sniff.ts";
import { readXmpFromWebp, readXmpFromPng, readXmpFromJpeg, embedXmpInWebp } from "@edge-shared/provenance/embed.ts";
import { assetCdnUrl } from "@edge-shared/cdn-buckets.ts";

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
  /**
   * Whether this bucket's public URLs are served through the asset CDN
   * (`VITE_ASSET_CDN_URL`) rather than the Supabase origin. Per-bucket so
   * buckets can move one at a time behind a single seam — see #577.
   *
   * `false` is not "not done yet"; each `false` below is a deliberate call
   * with its reason recorded at the bucket.
   */
  readonly cdn: boolean;
}

const FIVE_MB   =  5 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;
const FIFTY_MB  = 50 * 1024 * 1024;

const IMAGE_MIMES = ["image/webp", "image/jpeg"] as const;

const MINI_MODEL_MIMES = [
  "model/gltf-binary",
  "model/stl",
  "application/octet-stream",
  "image/webp",
] as const;

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
    cdn: true,
  },
  assetImages: {
    id: "asset-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: false, // Scriptorium rich-text embeds — never displayed via FocalImage
    cdn: true,
  },
  spellImages: {
    id: "spell-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  puzzleImages: {
    id: "puzzle-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  itemImages: {
    id: "item-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  monsterImages: {
    id: "monster-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  trapImages: {
    id: "trap-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  locationImages: {
    id: "location-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  factionImages: {
    id: "faction-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  pantheonEmblems: {
    id: "pantheon-emblems",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  lootImages: {
    id: "loot-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: true,
    cdn: true,
  },
  sounds: {
    id: "sounds",
    maxBytes: TWENTY_MB,
    mimeTypes: AUDIO_MIMES,
    public: true,
    generateVariants: false,
    // CDN-fronted, and the bucket with the strongest case for it: usePlayerAudioStream
    // has every client pull its own copy during shared playback, so origin egress
    // multiplies by party size.
    //
    // Cloudflare's service terms let them limit "video or a disproportionate
    // percentage of pictures, audio files, or other large files" served without the
    // paid Developer Platform. That clause names pictures too, so it never justified
    // treating audio differently from the image buckets — and we serve through a
    // Worker, which is the sanctioned path. ~180 MB of library audio at a 20 MB
    // per-file cap is not disproportionate by any reading. mini-models is the real
    // "large files" case, and it stays off.
    cdn: true,
  },
  soundImages: {
    id: "sound-images",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: false, // Displayed as small thumbnails; no FocalImage variants needed
    cdn: true,
  },
  chronicle: {
    id: "chronicle",
    maxBytes: FIVE_MB,
    mimeTypes: IMAGE_MIMES,
    public: true,
    generateVariants: false, // Displayed as thumbnails via CSS; no FocalImage variants needed
    cdn: true,
  },
  miniModels: {
    id: "mini-models",
    maxBytes: FIFTY_MB,
    mimeTypes: MINI_MODEL_MIMES,
    public: true,
    generateVariants: false, // 3D models — no width variants
    // Skips stage 1 entirely and goes straight to R2 in stage 2 (#577): the
    // bucket is still empty, so routing it direct means no copy window and no
    // dual-read phase for our largest objects (50 MB cap).
    cdn: false,
  },
} as const satisfies Record<string, BucketConfig>;

export type BucketKey = keyof typeof BUCKETS;

const BUCKET_ENTRIES = Object.entries(BUCKETS) as [BucketKey, BucketConfig][];

/**
 * Origin of the asset CDN (e.g. `https://cdn.dungeongrimoire.com`), or null
 * when unset — in which case every bucket resolves against the Supabase
 * origin exactly as before. Deploying this file without the env var is a
 * deliberate no-op, so the code can land before the DNS zone exists.
 *
 * Null rather than `""`: "no CDN configured" is a real state we branch on,
 * not an absence to paper over.
 */
const ASSET_CDN_BASE: string | null = (() => {
  const raw = import.meta.env.VITE_ASSET_CDN_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
})();

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

  const storagePath = path ?? `${userId}/${crypto.randomUUID()}.${ext ?? "webp"}`;
  const { error } = await supabase.storage
    .from(cfg.id)
    .upload(storagePath, blob, { contentType: mime, upsert });
  if (error) {
    console.warn(`[uploadToBucket] ${cfg.id}/${storagePath}:`, error.message);
    return null;
  }

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

/**
 * Upload an image and pre-generate all 4 size variants in parallel.
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

  const [originalUrl, xmpPacket] = await Promise.all([
    uploadToBucket({ bucket, blob, path: originalPath, contentType: blob.type }),
    readEmbeddedXmp(blob),
  ]);
  if (!originalUrl) return null;

  await Promise.allSettled(
    VARIANT_WIDTHS.map(async (width) => {
      const resized = await resizeToWebP(blob, width, 0.8);
      const variantBlob = await inheritXmpIntoVariant(resized, xmpPacket);
      await uploadToBucket({ bucket, blob: variantBlob, path: variantPath(originalPath, width) });
    }),
  );

  return originalUrl;
}

// ── Public URL construction + parsing ─────────────────────────────────────

/**
 * Get a public URL for an existing object (no fetch — pure URL builder).
 *
 * Two shapes exist, and both are permanently supported by `parsePublicUrl`:
 *
 *   origin: `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`
 *   CDN:    `https://cdn.example.com/<bucket>/<path>`
 *
 * The CDN shape drops Supabase's routing prefix deliberately. `<bucket>/<path>`
 * is exactly the R2 object key we want in stage 2, so the stage-2 cutover is an
 * origin swap with no stored-URL rewrite (#577). Stage 1 reinstates the prefix
 * at the edge with a Cloudflare URL-rewrite rule.
 */
export function getPublicUrl(bucket: BucketKey, path: string): string {
  const cfg = BUCKETS[bucket];
  return (
    assetCdnUrl(cfg.id, path, ASSET_CDN_BASE) ??
    supabase.storage.from(cfg.id).getPublicUrl(path).data.publicUrl
  );
}

export interface ParsedPublicUrl {
  readonly bucket: BucketKey;
  readonly path: string;
}

/** Path portion of a URL, with any query string and fragment removed. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // Not absolute — still strip `?v=…` cache-busters by hand so a relative or
    // malformed value degrades to a best-effort parse rather than to garbage.
    return url.split(/[?#]/)[0];
  }
}

/**
 * Resolve a stored public URL back to its bucket + storage path, accepting
 * **either** URL shape regardless of how this client is configured.
 *
 * Host-agnostic on purpose. Rows written before the CDN existed, rows written
 * by Edge Functions, and rows written after a stage-2 origin swap all coexist
 * indefinitely; a parser keyed on the current hostname would stop matching the
 * others and deletes would start silently no-oping — the failure mode #577
 * calls out for `removeByPublicUrl`.
 *
 * Returns null when the URL belongs to no registered bucket (external images
 * pasted into rich text, `downtime-images`, `bug-reports`).
 */
/**
 * True when `url` points at an object in `bucket`, in either URL shape.
 *
 * Prefer this over `url.startsWith(<some base>)` or `url.includes("/object/public/…")`:
 * those match only the origin shape, so they quietly turn into "always false"
 * the day the bucket moves to the CDN — taking whatever they gate (a cleanup
 * sweep, an edit affordance, a validity check) with them.
 */
export function isBucketUrl(bucket: BucketKey, url: string | null | undefined): url is string {
  return !!url && parsePublicUrl(url)?.bucket === bucket;
}

export function parsePublicUrl(url: string): ParsedPublicUrl | null {
  const pathname = pathnameOf(url);

  // Origin shape — the bucket id follows Supabase's routing prefix.
  for (const [key, cfg] of BUCKET_ENTRIES) {
    const marker = `/object/public/${cfg.id}/`;
    const at = pathname.indexOf(marker);
    if (at !== -1) {
      return { bucket: key, path: decodeURIComponent(pathname.slice(at + marker.length)) };
    }
  }

  // CDN shape — the bucket id is the first path segment.
  const rest = pathname.replace(/^\/+/, "");
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const bucketId = rest.slice(0, slash);
  const entry = BUCKET_ENTRIES.find(([, cfg]) => cfg.id === bucketId);
  if (!entry) return null;
  return { bucket: entry[0], path: decodeURIComponent(rest.slice(slash + 1)) };
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
  const paths = urls
    .filter((u): u is string => !!u)
    .map(parsePublicUrl)
    .filter((r): r is ParsedPublicUrl => r?.bucket === bucket)
    .map((r) => r.path);
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
    const { bucket: bucketKey, path: storagePath } = parsed;

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

    // Generate and upload all variants. Do NOT upsert — several image buckets
    // (asset-images in particular) have no UPDATE storage policy, and
    // INSERT ... ON CONFLICT DO UPDATE requires both INSERT and UPDATE to pass RLS
    // even for new rows. The variants don't exist yet so plain INSERT is correct.
    const path = storagePath;
    const bucket = bucketKey;
    const results = await Promise.allSettled(
      VARIANT_WIDTHS.map(async (width) => {
        const resized = await resizeToWebP(blob, width, 0.8);
        const variantBlob = await inheritXmpIntoVariant(resized, xmpPacket);
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
  const byBucket = new Map<BucketKey, string[]>();
  for (const url of urls) {
    if (!url) continue;
    const parsed = parsePublicUrl(url);
    if (!parsed) continue;
    const paths = byBucket.get(parsed.bucket);
    if (paths) paths.push(parsed.path);
    else byBucket.set(parsed.bucket, [parsed.path]);
  }
  for (const [bucket, paths] of byBucket) {
    await deleteFromBucket(bucket, pathsWithVariants(paths));
  }
}

