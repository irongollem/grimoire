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
import { clearImageProvenance } from "./imageProvenance";
import { reportHandledError } from "@/lib/observability/sentry";
import { imageProvenanceStem } from "@edge-shared/provenance/key.ts";

/** Remove one or more objects by storage path. */
export async function deleteFromBucket(bucket: BucketKey, paths: string[]): Promise<void> {
  if (!paths.length) return;
  // Concurrently — the two stores are independent, and this runs on
  // user-facing delete actions where the latencies would otherwise add.
  await Promise.all([
    usesR2(bucket) ? deleteFromR2(bucket, paths) : Promise.resolve(),
    supabase.storage.from(BUCKETS[bucket].id).remove(paths),
  ]);
  await clearProvenanceRows(bucket, paths);
}

/**
 * Drop the image provenance rows (#935) of objects that were just deleted. The
 * registry is keyed by stem, so an original and its variants share one row:
 * de-duplicate on the stem and clear each once. Copies and duplicates share one
 * storage object, and callers only reach here once the object itself goes, so
 * the row goes with it. Non-fatal: the bytes are already gone, a stale row
 * points at nothing, and the backfill scan can prune it.
 */
async function clearProvenanceRows(bucket: BucketKey, paths: string[]): Promise<void> {
  // Audio and model buckets never hold registry rows.
  if (!(BUCKETS[bucket].mimeTypes as readonly string[]).some((m) => m.startsWith("image/"))) return;
  const byStem = new Map<string, string>();
  for (const path of paths) {
    const stem = imageProvenanceStem(path);
    if (!byStem.has(stem)) byStem.set(stem, path);
  }
  await Promise.all(
    [...byStem.values()].map(async (path) => {
      try {
        await clearImageProvenance(bucket, path);
      } catch (err) {
        console.warn(`[deleteFromBucket] image provenance for ${BUCKETS[bucket].id}/${path}:`, err);
        reportHandledError(err, "storage:clearImageProvenance", { bucket: BUCKETS[bucket].id, path });
      }
    }),
  );
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
