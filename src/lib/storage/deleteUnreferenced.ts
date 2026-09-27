/**
 * Delete storage objects for an entity's image columns, but only the ones
 * nothing else still points at (#917).
 *
 * `deleteByPublicUrl` is a plain, unconditional delete — other callers rely on
 * that, so its behaviour stays untouched. This module exists because a
 * monster/item/trap/location's image file is not always exclusively theirs:
 *
 *   - `copyToCampaign.ts`'s `buildCopyPlan` spreads a row's image columns
 *     unchanged into the copy, so a same-account campaign copy points at the
 *     SAME storage object as its source (see that file's comment). The
 *     same-scope "Customize"/"duplicate" clones (`useCloneLibraryMonster`,
 *     `MonsterDetail.duplicate()`, `ItemDetail.cloneItem()`) share a file the
 *     same way.
 *   - A monster promoted from an NPC, and a customized library clone, share
 *     the NPC's portrait or the library's art the same way (see
 *     IMAGE_REFERENCES below).
 *   - AI-generated entity art is ALSO logged as a Gallery row
 *     (`useEntityImageGeneration.ts` → `logImageGeneration` →
 *     `public.image_generation_jobs.image_url`), so deleting the entity behind
 *     a piece of generated art must not delete the file the Gallery still
 *     shows.
 *
 * So a delete-time cleanup must check "does anything else of mine still use
 * this file" before removing it. Reads are RLS-scoped to what the caller can
 * see, which is exactly the right scope for that question — this is about one
 * account's own rows sharing a file, not a cross-account concern.
 *
 * Call this AFTER the owning row has been deleted, so that row no longer
 * counts as a reference to its own file.
 */

import { supabase } from "@/lib/supabase";
import { deleteByPublicUrl } from "./remove";

/**
 * Every column in the app that can hold an entity image, and so every place a
 * file can still be in use. Deliberately every table rather than the deleted
 * entity's own: files cross entities. A monster promoted from an NPC takes the
 * NPC's portrait AND cutout (`NpcDetail.vue`'s promote, #917 story 4); a
 * customized clone of a library monster takes the library's own art, which
 * for an admin is the shared canonical file under `srd/`, and a DM's
 * library-art override. Checking only the deleted row's table missed all
 * three.
 */
export const IMAGE_REFERENCES = [
  ["monsters", ["image_url", "cutout_url"]],
  ["items", ["image_url", "mundane_image_url"]],
  ["traps", ["image_url"]],
  ["locations", ["image_url", "map_url", "map_layer_url"]],
  ["npcs", ["portrait_url", "cutout_url", "disguise_portrait_url"]],
  ["library_monsters", ["image_url"]],
  ["library_items", ["image_url", "mundane_image_url"]],
  ["library_monster_art", ["image_url", "cutout_url"]],
  ["library_monster_art_canonical", ["image_url", "cutout_url"]],
  ["library_art_defaults", ["image_url"]],
  // The Gallery's log: AI-generated art stays until its Gallery entry goes.
  ["image_generation_jobs", ["image_url"]],
] as const satisfies ReadonlyArray<readonly [string, readonly string[]]>;

async function isStillReferenced(url: string): Promise<boolean> {
  // One .eq(column, url) query per column rather than a hand-built .or(...)
  // filter string: a storage URL can contain characters (commas, parens)
  // that PostgREST's .or() syntax would need escaping for, and getting that
  // escaping wrong fails silently rather than loudly.
  for (const [table, columns] of IMAGE_REFERENCES) {
    for (const column of columns) {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, url);
      if (error) throw error;
      // An unknown count keeps the file: deleting is the step that cannot be
      // undone, so doubt resolves toward keeping.
      if (count === null || count > 0) return true;
    }
  }
  return false;
}

export interface DeleteUnreferencedOptions {
  /** The URLs the just-deleted row held in its own image columns. Duplicates
   *  and nulls are fine: each distinct URL is checked exactly once. */
  urls: readonly (string | null | undefined)[];
}

/**
 * Delete every URL in `urls` that nothing else still references, via
 * {@link deleteByPublicUrl}. A URL any row in {@link IMAGE_REFERENCES} still
 * holds (another entity, a copy, library art, a Gallery entry) is left in
 * storage untouched.
 */
export async function deleteUnreferencedByPublicUrl(opts: DeleteUnreferencedOptions): Promise<void> {
  const distinctUrls = [...new Set(opts.urls.filter((u): u is string => !!u))];
  if (!distinctUrls.length) return;

  const referenced = await Promise.all(distinctUrls.map((url) => isStillReferenced(url)));
  const toDelete = distinctUrls.filter((_, i) => !referenced[i]);
  if (toDelete.length) await deleteByPublicUrl(...toDelete);
}
