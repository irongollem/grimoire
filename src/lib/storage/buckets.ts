/**
 * The storage bucket registry.
 *
 * Every Supabase storage bucket the app uses is declared in `BUCKETS` below.
 *
 * This registry is the **source of truth**, not a copy of one. It used to say
 * these values mirror "the matching SQL migration" — that was never wholly
 * true and is now the wrong way round. Ten of the fifteen buckets were created
 * by hand in the dashboard with no migration to mirror, and production has
 * since drifted from what is declared here: `chronicle` has no size or MIME
 * limit there, and `sounds` allows a different audio list. Nothing tests this
 * file against production, so do not read it as describing it.
 *
 * What these values *do* govern is real: they are the client-side guard, and
 * `STORAGE_WRITE_POLICY` (supabase/functions/_shared/storage-policy.ts) mirrors
 * them to enforce the same limits on the R2 write path, which is where object
 * writes actually go since #577. A test holds those two together. The Supabase
 * bucket config now only binds the R2-unavailable fallback, on buckets slated
 * for removal once R2 is proven — which is why the drift above is recorded
 * rather than reconciled.
 *
 * Routing all upload sites through this module gives us:
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
   *
   * There is deliberately **no** matching `r2` flag for stage 2's "which
   * buckets store their bytes in R2". That list lives once, in `R2_BUCKET_IDS`
   * (supabase/functions/_shared/r2/config.ts), with its reasoning, and is read
   * here via `isR2Bucket`. The `cdn` flag is duplicated against
   * `CDN_BUCKET_IDS` only because it predates that arrangement, and a test
   * holds the two together; do not "restore consistency" by adding a third
   * hand-maintained copy of the R2 list.
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
    // per-file cap is not disproportionate by any reading.
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
    // Skipped stage 1 and went straight to R2 in stage 2 (#577), while the bucket
    // held nothing but the admin-seeded `bases/` plinths — so no copy window and
    // no dual-read phase for our largest objects (50 MB cap). It is CDN-fronted
    // *because* it is R2-backed: an R2 object is reachable only through the
    // Worker, so the two are the same statement for this bucket.
    cdn: true,
  },
} as const satisfies Record<string, BucketConfig>;

export type BucketKey = keyof typeof BUCKETS;

export const BUCKET_ENTRIES = Object.entries(BUCKETS) as [BucketKey, BucketConfig][];

/**
 * Origin of the asset CDN (e.g. `https://cdn.dungeongrimoire.com`), or null
 * when unset — in which case every bucket resolves against the Supabase
 * origin exactly as before. Deploying this file without the env var is a
 * deliberate no-op, so the code can land before the DNS zone exists.
 *
 * Null rather than `""`: "no CDN configured" is a real state we branch on,
 * not an absence to paper over.
 */
export const ASSET_CDN_BASE: string | null = (() => {
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

/** Expand a list of storage paths to include all pre-generated variant paths. */
export function pathsWithVariants(paths: string[]): string[] {
  return paths.flatMap((p) => [p, ...VARIANT_WIDTHS.map((w) => variantPath(p, w))]);
}
