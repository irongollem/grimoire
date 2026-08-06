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
// R2_BUCKET_IDS below is the write flip. It covers every registry bucket at
// once — see its doc comment for why the flip does not wait for the byte copy.

import { STORAGE_WRITE_POLICY } from "../storage-policy.ts";

/**
 * Storage buckets whose **writes** go to R2 — every bucket in the write policy.
 *
 * Derived, not hand-typed. This used to be a fifteen-item literal held equal to
 * `STORAGE_WRITE_POLICY` by a test; the review of stage 2 pointed out that a
 * list provably equal to another list is just the other list. One registry
 * (the write policy, which carries each bucket's rules and reasoning) now feeds
 * this, `CDN_BUCKET_IDS`, and the edge functions alike — onboarding bucket #16
 * means one policy entry plus the client BUCKETS record, nothing else.
 *
 * WHY EVERY BUCKET, RATHER THAN ONE AT A TIME:
 * #577 sequences this as "copy → dual-read → flip origin", which reads as though
 * a bucket cannot flip until its bytes have been copied. That coupling does not
 * exist: stage 1's Worker arrived early and already serves both stores. Flipping
 * a bucket's *writes* only decides where the next object lands; every object
 * written before the flip keeps resolving through the Worker's Supabase
 * fallback, indefinitely and with no rewritten rows. A registry where some
 * buckets write to one store and some to another is the split-brain the issue
 * set out to avoid — and the blast radius of the flip is bounded, because an
 * upload that cannot reach R2 falls back to Supabase Storage (see
 * R2UnavailableError in src/lib/storage/r2.ts).
 *
 * `bug-reports` and `downtime-images` are absent because they are outside the
 * bucket registry entirely — see src/lib/storage/buckets.ts.
 */
export const R2_BUCKET_IDS: readonly string[] = STORAGE_WRITE_POLICY.map((p) => p.id);

export function isR2Bucket(bucketId: string): boolean {
  return R2_BUCKET_IDS.includes(bucketId);
}

/**
 * The one predicate for "should a write to this bucket go to R2 right now":
 * the bucket is R2-backed AND an asset CDN origin is configured. The second
 * clause is load-bearing — an R2 object is reachable only through the Worker,
 * so writing to R2 with no CDN hostname would store bytes no buildable URL
 * points at. Both runtimes call this with their own env's CDN value (the
 * browser's compile-time VITE_ASSET_CDN_URL, the edge functions' ASSET_CDN_URL)
 * so the rule itself cannot drift between them.
 */
export function r2WritesEnabled(bucketId: string, cdnBase: string | null | undefined): boolean {
  return isR2Bucket(bucketId) && !!cdnBase?.trim();
}

/**
 * Objects are immutable — art changes by getting a new UUID, never by mutating
 * a key — so a month at the edge and in browsers is safe. One definition,
 * imported by the server upload path and the copy script; the Worker
 * (a separate JS runtime with no shared import path) carries the same value
 * as its own constant.
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=2678400, immutable";

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
