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
// src/lib/storage/buckets.ts, which carries the reasoning for each bucket's
// inclusion. The two are held in sync by a test in
// src/lib/storage/buckets.test.ts that fails on any divergence.

import { isR2Bucket, R2_BUCKET_IDS } from "./r2/config.ts";

/**
 * Buckets served through the asset CDN — every R2-backed bucket, definitionally:
 * an R2 object is reachable only through the Worker, so "R2-backed" and
 * "CDN-fronted" are the same statement. Derived rather than hand-typed for the
 * same reason R2_BUCKET_IDS is (see r2/config.ts); the per-bucket `cdn` flag in
 * src/lib/storage/buckets.ts mirrors this with the reasoning attached, held in
 * sync by src/lib/storage/buckets.test.ts.
 */
export const CDN_BUCKET_IDS: readonly string[] = R2_BUCKET_IDS;

// Not in the registry at all, so a registry-driven migration will miss it:
// `downtime-images` (src/data/downtimeArt.ts). See src/lib/storage/buckets.ts.
// `bug-reports` used to belong on that list; it is retired and empty as of
// 20260809000002 — bug-report screenshots live on the bug_reports row now, so
// nothing writes a storage object there to miss.

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
 * When the CDN is unconfigured, the Supabase origin URL is returned (with a
 * warning for R2-listed buckets) rather than throwing — see the comment at the
 * fallback for why that is the correct answer in every environment that can
 * actually reach it.
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
    // Warn, do not throw. An earlier revision threw here, written when
    // mini-models was the only R2 bucket and the state was unreachable if the
    // runbook order was followed. Once every bucket became R2-listed, the throw
    // fired for ALL of them in any environment without ASSET_CDN_URL — local
    // `functions serve`, a fresh staging project — failing every generator
    // after its upload had already succeeded. The origin URL is the correct
    // answer there: uploadWithRetry gates R2 writes on the same env var, so in
    // exactly the environments that reach this branch the bytes ARE in Supabase
    // Storage, and remain there for every bucket until #617 deletes the copies.
    console.warn(
      `publicAssetUrl: ${bucketId} is R2-listed but no asset CDN is configured — ` +
        "falling back to the Supabase origin URL (correct while the Supabase copies exist; see #617)",
    );
  }
  return supabasePublicUrl();
}
