// R2 configuration and the per-bucket rollout list (#577 stage 2).
//
// ONE R2 BUCKET, NOT FIFTEEN. Every object lives in a single R2 bucket under the
// key `<storageBucketId>/<path>` — `mini-models/<uuid>/model.stl`, not a
// `mini-models` R2 bucket. That is forced by the URL shape stage 1 already
// committed to: `https://cdn.dungeongrimoire.com/<bucket>/<path>`, whose pathname
// minus the leading slash *is* the key. Splitting per bucket would mean the Worker
// had to parse the first segment and pick a binding, and every new bucket would
// need a Worker redeploy — for no isolation benefit, since a single credential
// reaches all of them either way.
//
// ROLLOUT IS PER STORAGE BUCKET, via R2_BUCKET_IDS below. The issue's sequence is
// copy → dual-read → flip origin → drop fallback, one bucket at a time; this list
// is the "flip origin" step. A bucket only belongs here once its bytes are in R2.

/**
 * Storage buckets whose **writes** go to R2.
 *
 * WHY EVERY BUCKET, RATHER THAN ONE AT A TIME:
 * #577 sequences this as "copy → dual-read → flip origin", which reads as though
 * a bucket cannot flip until its bytes have been copied. That coupling does not
 * actually exist, because stage 1's Worker arrived early and already serves
 * both stores. Flipping a bucket's *writes* only decides where the next object
 * lands; every object written before the flip keeps resolving through the
 * Worker's Supabase fallback, indefinitely and with no rewritten rows.
 *
 * So the flip and the copy are independent:
 *   flip  — new writes go to R2. Safe now, for every bucket.
 *   copy  — historical bytes move, which is what stops paying Supabase egress
 *           on the long tail. Operational, run per bucket via `npm run r2:copy`,
 *           and re-runnable at any point after the flip.
 *
 * Doing the flip everywhere at once also avoids a split-brain the issue
 * explicitly set out to prevent: a registry where some buckets write to one
 * store and some to another is a two-path problem for every future change.
 *
 * The blast radius of getting this wrong is bounded by design — an upload that
 * cannot reach R2 falls back to Supabase Storage rather than failing (see
 * R2UnavailableError in src/lib/storage/r2.ts), so a misconfiguration degrades
 * to yesterday's behaviour instead of breaking uploads app-wide.
 *
 * `bug-reports` and `downtime-images` are absent because they are not in the
 * bucket registry at all — see src/lib/storage/buckets.ts.
 */
export const R2_BUCKET_IDS = [
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
  // Never needed a copy window at all, exactly as #577 planned: the bucket held
  // nothing but the admin-seeded `bases/` plinths when this shipped, and its
  // 50 MB objects are the ones Cloudflare's non-HTML clause actually points at
  // the Developer Platform (Workers + R2) to serve.
  "mini-models",
] as const;

export function isR2Bucket(bucketId: string): boolean {
  return (R2_BUCKET_IDS as readonly string[]).includes(bucketId);
}

/** `<storageBucketId>/<path>` — identical to the CDN URL's pathname, by design. */
export function r2ObjectKey(bucketId: string, path: string): string {
  return `${bucketId}/${path.replace(/^\/+/, "")}`;
}

export interface R2Config {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** `https://<accountId>.r2.cloudflarestorage.com` */
  readonly endpoint: string;
}

/**
 * Build the R2 config from environment, or return null when it is not fully set.
 *
 * Null is the load-bearing case, not an error: it is what lets this whole feature
 * deploy ahead of the Cloudflare-side setup and behave exactly as before, the same
 * way `VITE_ASSET_CDN_URL` being unset was a deliberate no-op in stage 1. Callers
 * fall back to Supabase Storage on null — never throw, never half-configure.
 *
 * `get` is injected rather than reading `Deno.env` directly so the same module
 * serves edge functions, the Node copy script and the tests.
 */
export function r2ConfigFrom(get: (key: string) => string | undefined): R2Config | null {
  const accountId = get("R2_ACCOUNT_ID")?.trim();
  const bucket = get("R2_BUCKET")?.trim();
  const accessKeyId = get("R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = get("R2_SECRET_ACCESS_KEY")?.trim();

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

/**
 * SigV4 credentials for R2. The region is the literal `auto` — R2 has no regions,
 * but the S3 protocol requires a region in the credential scope, and `auto` is
 * what Cloudflare documents.
 */
export function r2Credentials(config: R2Config) {
  return {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    service: "s3",
  } as const;
}
