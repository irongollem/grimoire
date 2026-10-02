import type { SupabaseClient } from "@supabase/supabase-js";
import { imageProvenanceStem } from "./key.ts";
import type { AiProvenance } from "./types.ts";

/**
 * Record an AI image's provenance in the `image_provenance` registry (#935),
 * keyed by storage bucket id and the object path's stem so the original and its
 * size variants share one row. Upserts: a fixed path that is overwritten (a
 * re-styled mini) must replace the earlier row. Throws on a database error and
 * leaves it to the caller to decide what that means.
 */
export async function registerImageProvenance(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  userId: string,
  prov: AiProvenance,
): Promise<void> {
  const { error } = await admin
    .from("image_provenance")
    .upsert(
      { bucket, stem: imageProvenanceStem(path), user_id: userId, provenance: prov },
      { onConflict: "bucket,stem" },
    );
  if (error) throw error;
}
