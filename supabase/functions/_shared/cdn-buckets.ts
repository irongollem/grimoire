// Asset-CDN URL construction, shared by the browser client and Edge Functions
// (#577 stage 1).
//
// Lives here rather than in src/lib/ because the import only works in one
// direction: the app can reach `_shared` through the `@edge-shared` alias
// (vite/vitest/tsconfig), while Deno-hosted functions cannot resolve `@/`.
//
// Deliberately free of Deno and Vite globals — `cdnBase` is passed in by the
// caller that owns the environment — so both runtimes and the unit tests can
// import it unchanged.
//
// `CDN_BUCKET_IDS` is mirrored by the per-bucket `cdn` flag in
// src/lib/storage.ts, which carries the reasoning for each bucket's inclusion.
// The two are held in sync by a test in src/lib/storage.test.ts that fails on
// any divergence — update both, or that test will say so.

export const CDN_BUCKET_IDS = [
  "npc-portraits",
  "asset-images",
  "spell-images",
  "puzzle-images",
  "item-images",
  "monster-images",
  "trap-images",
  "location-images",
  "faction-images",
  "pantheon-emblems",
  "loot-images",
  "sound-images",
  "chronicle",
  "sounds",
] as const;

// Excluded on purpose, with the reason recorded at the bucket in
// src/lib/storage.ts: `mini-models` (genuinely large files, and it goes straight
// to R2 in stage 2 while the bucket is still empty). `bug-reports` and
// `downtime-images` are not in the registry at all — see that file.

export function isCdnBucket(bucketId: string): boolean {
  return (CDN_BUCKET_IDS as readonly string[]).includes(bucketId);
}

/**
 * Percent-encode a storage path for a URL while keeping `/` separators intact,
 * so the CDN shape round-trips through the app's `parsePublicUrl`.
 */
export function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Build the CDN URL for an object, or null when the CDN is unconfigured or
 * this bucket is not fronted by it — in which case the caller should fall
 * back to the Supabase origin URL.
 *
 * Shape is `<cdnBase>/<bucket>/<path>`: Supabase's `/storage/v1/object/public`
 * prefix is dropped so the path doubles as the stage-2 R2 object key, making
 * that cutover an origin swap rather than a rewrite of stored URLs.
 */
export function assetCdnUrl(bucketId: string, path: string, cdnBase: string | null): string | null {
  if (!cdnBase || !isCdnBucket(bucketId)) return null;
  return `${cdnBase.replace(/\/+$/, "")}/${bucketId}/${encodeStoragePath(path)}`;
}
