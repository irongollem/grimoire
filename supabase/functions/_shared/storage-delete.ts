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
  const r2 = isR2Bucket(bucket) ? r2ConfigFrom((key) => Deno.env.get(key)) : null;

  // Both stores listed concurrently — they are independent, and this runs on a
  // user-facing delete request. A listing failure in EITHER store throws, for
  // the same reason in both: "we could not see what is there" reported as a
  // clean delete orphans those objects permanently, with the row that named
  // them about to be deleted by the caller. (An earlier revision applied this
  // rule to R2 only and downgraded the Supabase failure to a console.error —
  // the review caught the asymmetry.)
  const [supabaseListing, r2Keys] = await Promise.all([
    admin.storage.from(bucket).list(prefix),
    r2
      ? listObjects(r2, r2ObjectKey(bucket, `${prefix}/`)).catch((err) => {
          throw new Error(
            `deleteByPrefix: listing r2 ${bucket}/${prefix} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
      : Promise.resolve([] as string[]),
  ]);
  if (supabaseListing.error) {
    throw new Error(`deleteByPrefix: listing ${bucket}/${prefix} failed: ${supabaseListing.error.message}`);
  }

  const paths = new Set<string>();
  for (const object of supabaseListing.data ?? []) paths.add(`${prefix}/${object.name}`);
  // R2 listing is recursive by nature — a key is a flat string — so this also
  // catches anything nested deeper than Supabase's single-level list returns.
  for (const key of r2Keys) paths.add(key.slice(`${bucket}/`.length));

  if (paths.size === 0) return 0;
  const all = [...paths];

  // Deletes run concurrently too. A failure in either store throws so the
  // caller keeps the DB row and the user retries — a missing key is a success
  // in both stores, which is what makes the retry clean.
  const [, removeResult] = await Promise.all([
    r2 ? deleteObjects(r2, all.map((path) => r2ObjectKey(bucket, path))) : Promise.resolve(),
    admin.storage.from(bucket).remove(all),
  ]);
  if (removeResult.error) {
    throw new Error(`deleteByPrefix: removing ${bucket}/${prefix} from storage failed: ${removeResult.error.message}`);
  }

  return all.length;
}
