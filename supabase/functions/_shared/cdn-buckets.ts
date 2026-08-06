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

import { isR2Bucket } from "./r2/config.ts";

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
  // Joined the CDN in stage 2, when it moved to R2 (#577). It had to: an R2
  // object is reachable only through the Worker, so "R2-backed" and "served from
  // cdn." are the same statement. The stage-1 reason for holding it back — the
  // Cloudflare clause about bulk non-HTML content — is answered rather than
  // ignored, because that clause points you at the Developer Platform, and
  // Workers + R2 *is* the Developer Platform.
  "mini-models",
] as const;

// Not in the registry at all, so a registry-driven migration will miss them:
// `bug-reports` (create-bug-report edge function) and `downtime-images`
// (src/data/downtimeArt.ts). See src/lib/storage.ts.

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

/**
 * The public URL for an object, choosing between the CDN and the Supabase origin.
 *
 * Every caller that persists a URL should go through this rather than reaching
 * for `getPublicUrl` directly — that is how `generate-music` ended up writing
 * origin URLs for `sounds` after stage 1 shipped, quietly keeping the noisiest
 * bucket in the registry off the CDN for every newly generated track.
 *
 * Throws when a bucket whose bytes live in R2 has no CDN base configured. That
 * combination cannot produce a working URL — an R2 object is reachable only
 * through the Worker — and the alternative to throwing is persisting a URL that
 * 404s forever. Unreachable if the runbook order is followed (CDN first, then
 * R2), and `uploadWithRetry` refuses to write to R2 in that state for the same
 * reason.
 */
export function publicAssetUrl(
  bucketId: string,
  path: string,
  cdnBase: string | null,
  supabasePublicUrl: () => string,
): string {
  const cdn = assetCdnUrl(bucketId, path, cdnBase);
  if (cdn) return cdn;
  if (isR2Bucket(bucketId)) {
    throw new Error(
      `${bucketId} is served from R2 but no asset CDN is configured — refusing to build an unreachable URL`,
    );
  }
  return supabasePublicUrl();
}
