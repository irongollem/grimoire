/**
 * Enumerate a user's own objects in a bucket, across both stores (#577 stage 2).
 *
 * `supabase.storage.from(...).list(...)` sees only Supabase Storage; the
 * `r2-list` edge function sees only R2. During the migration window a user's
 * uploads are split across the two (old objects in Supabase until copied, new
 * ones in R2), so anything that browses "my uploaded files" — the art picker —
 * must merge both listings or silently omit whichever half it cannot see.
 */

import { supabase } from "@/lib/supabase";
import { BUCKETS, type BucketKey } from "./buckets";
import { usesR2 } from "./r2";

async function listFromSupabase(bucket: BucketKey, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKETS[bucket].id).list(prefix, { limit: 1000 });
  if (error) {
    console.warn(`[listOwnedPaths] ${BUCKETS[bucket].id}/${prefix}:`, error.message);
    return [];
  }
  return (data ?? [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => `${prefix}/${f.name}`);
}

async function listFromR2(bucket: BucketKey, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke<{ paths: string[] }>("r2-list", {
    body: { bucket: BUCKETS[bucket].id, prefix },
  });
  if (error || !data?.paths) {
    // Unprovisioned R2 (503) or a transient failure — the Supabase listing is
    // the complete answer in the former case and the best available one in the
    // latter. Enumeration degrading beats the picker erroring out.
    return [];
  }
  return data.paths;
}

/**
 * Every storage path under `<userId>/` in `bucket`, merged across both stores.
 *
 * Paths, not names: `<userId>/<file>` — the shape `getPublicUrl` and
 * `parsePublicUrl` speak. An object present in both stores (copied, then not
 * yet deleted from Supabase) appears once.
 */
export async function listOwnedPaths(bucket: BucketKey, userId: string): Promise<string[]> {
  const [fromSupabase, fromR2] = await Promise.all([
    listFromSupabase(bucket, userId),
    usesR2(bucket) ? listFromR2(bucket, userId) : Promise.resolve([]),
  ]);
  return [...new Set([...fromSupabase, ...fromR2])];
}
