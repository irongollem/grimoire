/**
 * "Every storage object belonging to this user", in both stores.
 *
 * Extracted from delete-account (#631) when the GDPR export (#632) needed the
 * same answer. The two rights are the same question asked twice — Art. 15 is
 * "what do you hold about me", Art. 17 is "stop holding it" — so the export
 * must enumerate exactly what deletion would purge. Two implementations of
 * "find the user's files" would drift, and the drift is silent in both
 * directions: an export that misses a bucket under-reports, and a purge that
 * misses one strands objects that no per-user listing path can ever reach again
 * (see context/compliance/data-subject-rights.md §3).
 *
 * Listing is therefore defined once, here, and both callers consume it.
 *
 * The `{userId}/` prefix is load-bearing — it is the only thing that makes a
 * file findable by owner. Any user-generated object stored outside it is
 * invisible to both rights; that hole is what #634's bug-report screenshots
 * were (§4a).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listAllFilePaths, type StorageEntry } from "./storage-purge.ts";
import { r2ObjectKey, R2_BUCKET_IDS, type R2Config } from "./r2/config.ts";
import { listObjects } from "./r2/client.ts";

/** Supabase Storage's `list()` defaults to 100 rows; page explicitly so a folder with more doesn't lose its tail. */
const LIST_PAGE_SIZE = 1000;

/** One store's worth of a user's objects: bucket-relative paths, grouped by bucket. */
export interface BucketObjects {
  readonly bucket: string;
  readonly paths: readonly string[];
}

export interface StorageInventory {
  readonly supabase: readonly BucketObjects[];
  readonly r2: readonly BucketObjects[];
  /**
   * Per-bucket failures, formatted for logging. Callers decide what a partial
   * answer means: deletion must refuse to proceed on any error, while the
   * export reports what it could not enumerate rather than failing outright.
   */
  readonly errors: readonly string[];
}

async function listFolderPaginated(
  client: SupabaseClient,
  bucketId: string,
  prefix: string,
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(bucketId).list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(error.message);
    const page = (data ?? []) as StorageEntry[];
    entries.push(...page);
    if (page.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }
  return entries;
}

/**
 * `userId`'s objects in every *currently registered* Supabase bucket
 * (`listBuckets()`), not just the ones this repo's BUCKETS registry knows
 * about — a bucket the app no longer writes to can still hold older objects.
 */
export async function listSupabaseUserObjects(
  admin: SupabaseClient,
  userId: string,
): Promise<{ buckets: BucketObjects[]; errors: string[] }> {
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
  if (bucketsError) return { buckets: [], errors: [`listBuckets: ${bucketsError.message}`] };

  // Buckets are walked concurrently. Each walk is itself serial and recursive —
  // `mini-models/{userId}/{miniId}/` is several round-trips deep — so doing ~15
  // registry buckets one after another put hundreds of sequential requests on a
  // user-facing path with an edge-function wall clock, on top of the
  // whole-database export. Wall time is now roughly the slowest single bucket
  // rather than the sum of all of them.
  const settled = await Promise.all(
    (buckets ?? []).map(async (bucket): Promise<BucketObjects | string> => {
      try {
        const paths = await listAllFilePaths(
          (prefix) => listFolderPaginated(admin, bucket.id, prefix),
          userId,
        );
        return { bucket: bucket.id, paths };
      } catch (err) {
        return `${bucket.id}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }),
  );

  const result: BucketObjects[] = [];
  const errors: string[] = [];
  for (const entry of settled) {
    if (typeof entry === "string") errors.push(entry);
    else if (entry.paths.length > 0) result.push(entry);
  }
  return { buckets: result, errors };
}

/**
 * `userId`'s objects in every R2-backed bucket. Paths are returned
 * bucket-relative (the `<bucketId>/` key prefix stripped) so both stores speak
 * the same vocabulary and a caller can compare them.
 */
export async function listR2UserObjects(
  config: R2Config,
  userId: string,
): Promise<{ buckets: BucketObjects[]; errors: string[] }> {
  const result: BucketObjects[] = [];
  const errors: string[] = [];
  for (const bucketId of R2_BUCKET_IDS) {
    try {
      const keyPrefix = r2ObjectKey(bucketId, "");
      const keys = await listObjects(config, r2ObjectKey(bucketId, `${userId}/`));
      if (keys.length > 0) {
        result.push({
          bucket: bucketId,
          paths: keys.map((key) => {
            // Throwing rather than returning the key unchanged. delete-account
            // re-applies the prefix with r2ObjectKey(bucket, path), so a key
            // that fell through here would become `mini-models/mini-models/…`
            // and be issued as a DELETE for an object that does not exist —
            // which R2 answers 204, so the purge would report success while
            // leaving the user's files in place. A listing that violates its
            // own prefix means the assumption is broken; the caller records
            // this bucket as an error instead of silently mis-purging it.
            if (!key.startsWith(keyPrefix)) {
              throw new Error(`key ${key} does not start with expected prefix ${keyPrefix}`);
            }
            return key.slice(keyPrefix.length);
          }),
        });
      }
    } catch (err) {
      errors.push(`r2:${bucketId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { buckets: result, errors };
}

/**
 * Both stores at once. A missing R2 config is not an error — it means this
 * environment has not been provisioned for R2 (see `r2ConfigFrom`), so every
 * object is still in Supabase Storage and the first listing already covers it.
 */
export async function listUserStorage(
  admin: SupabaseClient,
  userId: string,
  r2Config: R2Config | null,
): Promise<StorageInventory> {
  const [supabase, r2] = await Promise.all([
    listSupabaseUserObjects(admin, userId),
    r2Config ? listR2UserObjects(r2Config, userId) : Promise.resolve({ buckets: [], errors: [] }),
  ]);
  return {
    supabase: supabase.buckets,
    r2: r2.buckets,
    errors: [...supabase.errors, ...r2.errors],
  };
}

/** Total object count across both stores — the export's headline number. */
export function totalObjectCount(inventory: StorageInventory): number {
  const count = (buckets: readonly BucketObjects[]) =>
    buckets.reduce((sum, b) => sum + b.paths.length, 0);
  return count(inventory.supabase) + count(inventory.r2);
}
