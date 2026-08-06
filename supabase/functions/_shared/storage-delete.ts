/**
 * Server-side "delete everything under this prefix", across both stores
 * (#577 stage 2).
 *
 * Entity cleanup in this codebase is expressed as a prefix — `mini-models` holds
 * a mini's every format under `{userId}/{miniId}/` — and neither store has a
 * prefix delete, so the keys must be enumerated first. During a bucket's copy
 * window an object can be in Supabase Storage, in R2, or in both, so both are
 * listed and both are deleted. Listing only one is how a delete silently
 * succeeds while leaving the bytes (and the user's storage quota) behind.
 *
 * A missing key is a success in both stores, which is what makes the
 * belt-and-braces free.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2ConfigFrom, r2ObjectKey, isR2Bucket } from "./r2/config.ts";
import { listObjects, deleteObjects } from "./r2/client.ts";

/**
 * Delete every object under `prefix` in `bucket`, from whichever store holds it.
 *
 * `prefix` is a folder path without a trailing slash — `"<userId>/<miniId>"`.
 * Returns the number of objects deleted, counting an object present in both
 * stores once.
 */
export async function deleteByPrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  const paths = new Set<string>();

  const { data: supabaseObjects, error: listError } = await admin.storage.from(bucket).list(prefix);
  if (listError) {
    console.error(`deleteByPrefix: listing ${bucket}/${prefix} failed`, listError);
  }
  for (const object of supabaseObjects ?? []) paths.add(`${prefix}/${object.name}`);

  const r2 = isR2Bucket(bucket) ? r2ConfigFrom((key) => Deno.env.get(key)) : null;
  if (r2) {
    try {
      // R2 listing is recursive by nature — a key is a flat string — so this also
      // catches anything nested deeper than Supabase's single-level list returns.
      const keyPrefix = r2ObjectKey(bucket, `${prefix}/`);
      for (const key of await listObjects(r2, keyPrefix)) {
        paths.add(key.slice(`${bucket}/`.length));
      }
    } catch (err) {
      // Deliberately not swallowed into a "deleted 0" success: if R2 cannot be
      // listed we do not know what is there, and reporting a clean delete would
      // orphan those objects permanently with nothing left pointing at them.
      throw new Error(`deleteByPrefix: listing r2 ${bucket}/${prefix} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (paths.size === 0) return 0;
  const all = [...paths];

  if (r2) {
    await deleteObjects(r2, all.map((path) => r2ObjectKey(bucket, path)));
  }
  const { error: removeError } = await admin.storage.from(bucket).remove(all);
  if (removeError) {
    console.error(`deleteByPrefix: removing ${bucket}/${prefix} from storage failed`, removeError);
  }

  return all.length;
}
