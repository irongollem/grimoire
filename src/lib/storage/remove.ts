/**
 * Delete paths for stored objects.
 *
 * During a bucket's migration window its objects can legitimately exist in
 * Supabase Storage, in R2, or in both — the copy runs while writes are still
 * landing. So a delete for an R2-backed bucket goes to **both** stores. Deleting
 * a key that is not there is a no-op in each, which makes the belt-and-braces
 * free; deleting from only one would leave the object still being served by the
 * Worker's dual-read, which is the exact failure #577 flags for
 * `removeByPublicUrl`.
 */

import { supabase } from "@/lib/supabase";
import { BUCKETS, pathsWithVariants, type BucketKey } from "./buckets";
import { parsePublicUrl, type ParsedPublicUrl } from "./urls";
import { usesR2, deleteFromR2 } from "./r2";

/** Remove one or more objects by storage path. */
export async function deleteFromBucket(bucket: BucketKey, paths: string[]): Promise<void> {
  if (!paths.length) return;
  // Concurrently — the two stores are independent, and this runs on
  // user-facing delete actions where the latencies would otherwise add.
  await Promise.all([
    usesR2(bucket) ? deleteFromR2(bucket, paths) : Promise.resolve(),
    supabase.storage.from(BUCKETS[bucket].id).remove(paths),
  ]);
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
