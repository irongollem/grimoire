/**
 * The files a campaign delete leaves behind, so they can go with it (#918).
 *
 * `delete_campaign_with_homebrew` removes rows: some by `ON DELETE CASCADE`,
 * some itself when the DM chose to delete their campaign-scoped homebrew. No
 * cascade reaches storage, so every image those rows held stayed in the bucket
 * for good, counted against the account and reachable from nowhere.
 *
 * The URLs are read *before* the delete (afterwards the rows are gone) and
 * handed to `deleteUnreferencedByPublicUrl` *after* it, which keeps any file
 * something else still uses: a same-account copy in another campaign shares
 * its source's files, and so does Gallery art.
 *
 * Rows the delete leaves alone are not here. NPCs, items, spells, notes and
 * party members are `ON DELETE SET NULL`: they survive as homebrew and keep
 * their files. Every read is the caller's own rows (`user_id`), because that
 * is the only storage they may delete, and because RLS is a ceiling, not a
 * filter: a DM can read other members' rows in their campaign.
 *
 * A demo campaign returns nothing. Its copy points at the template author's
 * files by design (`context/features/demo-campaign.md`), and the author's rows
 * are invisible to the reference check, so it would read them as unused.
 */

import { supabase } from "@/lib/supabase";
import { IMAGE_REFERENCES } from "@/lib/storage/deleteUnreferenced";
import type { HomebrewDisposition } from "@/lib/campaign/campaignHomebrewDisposition";

/** Campaign-scoped tables the cascade empties, whatever the disposition. */
export const CASCADED_TABLES = [
  "locations", "deities", "pantheons", "factions", "companions", "minis", "sounds", "image_generation_jobs",
] as const;

/**
 * The homebrew the RPC deletes when the DM picks "delete" (the image-bearing
 * subset of `HOMEBREW_TABLES`); "promote" moves it to their global library,
 * where it keeps its files.
 */
export const DISPOSED_TABLES = ["monsters", "traps", "puzzle_rooms", "dungeon_features"] as const;

type ImageTable = (typeof IMAGE_REFERENCES)[number][0];

/** Each table's image columns, read from {@link IMAGE_REFERENCES} rather than restated. */
function imageColumns(tables: readonly ImageTable[]): (readonly [string, readonly string[]])[] {
  return IMAGE_REFERENCES.filter(([table]) => tables.includes(table));
}

async function readUrls(table: string, columns: readonly string[], campaignId: string, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(table)
    .select(columns.join(","))
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) throw error;
  const urls: string[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    for (const column of columns) {
      const value = row[column];
      if (typeof value === "string" && value) urls.push(value);
    }
  }
  return urls;
}

/**
 * Every file URL the caller's rows in this campaign hold that the delete will
 * orphan, given the disposition. Throws on a failed read, so the caller can
 * refuse to delete rather than delete and leak.
 */
export async function campaignFileUrls(
  campaignId: string,
  userId: string,
  disposition: HomebrewDisposition,
): Promise<string[]> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("group_portrait_url, demo_source")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign || campaign.demo_source) return [];
  const tables = imageColumns(disposition === "delete" ? [...CASCADED_TABLES, ...DISPOSED_TABLES] : CASCADED_TABLES);
  const perTable = await Promise.all(tables.map(([table, columns]) => readUrls(table, columns, campaignId, userId)));
  const urls = perTable.flat();
  if (campaign.group_portrait_url) urls.push(campaign.group_portrait_url);
  return urls;
}
