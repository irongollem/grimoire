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
 *
 * #918 completed the list from the schema (every `*_url` image, portrait,
 * emblem, map or audio column in `public`) rather than from memory, because a
 * campaign delete removes files from tables #917 never had to think about:
 * copy-to-campaign shares puzzle-room, faction and spell art, and a Hall of
 * Heroes card keeps the portrait of the character it remembers.
 */
export const IMAGE_REFERENCES = [
  ["monsters", ["image_url", "cutout_url"]],
  ["items", ["image_url", "mundane_image_url"]],
  ["traps", ["image_url"]],
  ["locations", ["image_url", "map_url", "map_layer_url"]],
  ["npcs", ["portrait_url", "cutout_url", "disguise_portrait_url"]],
  ["spells", ["image_url"]],
  ["species", ["image_url"]],
  ["backgrounds", ["image_url"]],
  ["puzzle_rooms", ["image_url"]],
  ["dungeon_features", ["image_url"]],
  ["factions", ["emblem_url"]],
  ["deities", ["portrait_url", "symbol_image_url"]],
  ["pantheons", ["emblem_url"]],
  ["companions", ["portrait_url"]],
  ["party_members", ["portrait_url"]],
  ["hall_of_heroes", ["portrait_url", "disguise_portrait_url", "card_art_url"]],
  ["campaigns", ["group_portrait_url"]],
  ["minis", ["stylized_image_url", "thumbnail_url"]],
  ["sounds", ["file_url", "thumbnail_url"]],
  ["sound_library", ["file_url"]],
  ["soundboard_broadcast", ["track_url", "thumbnail_url"]],
  ["library_monsters", ["image_url"]],
  ["library_items", ["image_url", "mundane_image_url"]],
  ["library_spells", ["image_url"]],
  ["library_species", ["image_url"]],
  ["library_backgrounds", ["image_url"]],
  ["library_monster_art", ["image_url", "cutout_url"]],
  ["library_monster_art_canonical", ["image_url", "cutout_url"]],
  ["library_spell_art", ["image_url"]],
  ["library_spell_art_canonical", ["image_url"]],
  ["library_art_defaults", ["image_url"]],
  // The Gallery's log: AI-generated art stays until its Gallery entry goes.
  ["image_generation_jobs", ["image_url"]],
] as const satisfies ReadonlyArray<readonly [string, readonly string[]]>;

/** URLs per `.in()` read, so a campaign's worth of files never outgrows a request line. */
const URL_CHUNK = 50;

/**
 * The subset of `urls` some row still holds.
 *
 * One `.in()` read per column per chunk, rather than one count per URL per
 * column: a campaign delete checks hundreds of files at once (#918), and the
 * per-URL form cost columns x files round trips. `.in()` quotes a value
 * holding PostgREST's reserved characters itself, which is what a hand-built
 * `.or()` string would have had to get right.
 */
async function referencedUrls(urls: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const [table, columns] of IMAGE_REFERENCES) {
    for (const column of columns) {
      for (let i = 0; i < urls.length; i += URL_CHUNK) {
        const chunk = urls.slice(i, i + URL_CHUNK).filter((url) => !found.has(url));
        if (!chunk.length) continue;
        const { data, error } = await supabase.from(table).select(column).in(column, chunk);
        // A failed read throws rather than reading as "unused": deleting is the
        // step that cannot be undone, so doubt resolves toward keeping.
        if (error) throw error;
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          const value = row[column];
          if (typeof value === "string") found.add(value);
        }
      }
    }
  }
  return found;
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

  const referenced = await referencedUrls(distinctUrls);
  const toDelete = distinctUrls.filter((url) => !referenced.has(url));
  if (toDelete.length) await deleteByPublicUrl(...toDelete);
}
