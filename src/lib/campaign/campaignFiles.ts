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
 *
 * Three more tables cascade with the campaign and hold files that are not
 * public URLs (#963):
 *
 * - `ai_generation_jobs.artifact_url` is read with the URLs above. A generated
 *   track is uploaded to `sounds` and the `sounds` row points at the very same
 *   object, so it is not per-row: it goes through the reference check like
 *   every other URL, and a same-account copy of the sound keeps it. (The path
 *   column, `artifact_storage_path`, is the same object and is not read.)
 * - `document_imports.source_paths` are paths in the private `import-documents`
 *   bucket, owned by that one row, so {@link campaignImportSourcePaths} hands
 *   them back for a direct delete. An import still in review when the campaign
 *   goes is the only case that reaches here; the rest are already removed.
 * - `minis` model files (`glb_path`, `stl_path`, `extra_paths`) live in the
 *   service-managed `mini-models` bucket, which no client may delete from
 *   (`r2-delete` refuses every path in it). {@link deleteCampaignMinis} hands
 *   the campaign to `forge-mini`'s `delete_campaign` action instead, which
 *   removes each mini the way deleting one does: files, credit hold, row. It
 *   has to run *before* the delete, because the row is the only thing that
 *   names a mini's folder, and a failure refuses the delete rather than
 *   leaking the files.
 */

import { supabase } from "@/lib/supabase";
import { IMAGE_REFERENCES } from "@/lib/storage/deleteUnreferenced";
import { IMPORT_DOCUMENTS_BUCKET } from "@/lib/documentImport/limits";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
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

/** The caller's campaign row, or null when it is absent or a demo (whose files are the template author's). */
async function ownDeletableCampaign(campaignId: string, userId: string): Promise<{ group_portrait_url: string | null } | null> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("group_portrait_url, demo_source")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign || campaign.demo_source) return null;
  return campaign;
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
  const campaign = await ownDeletableCampaign(campaignId, userId);
  if (!campaign) return [];
  const tables = imageColumns(disposition === "delete" ? [...CASCADED_TABLES, ...DISPOSED_TABLES] : CASCADED_TABLES);
  const perTable = await Promise.all([
    ...tables.map(([table, columns]) => readUrls(table, columns, campaignId, userId)),
    readUrls("ai_generation_jobs", ["artifact_url"], campaignId, userId),
  ]);
  const urls = perTable.flat();
  if (campaign.group_portrait_url) urls.push(campaign.group_portrait_url);
  return urls;
}

/**
 * Storage paths of the caller's document imports in this campaign, for the
 * delete to remove from `import-documents` afterwards (#963). Throws on a failed
 * read, like {@link campaignFileUrls}. A demo campaign returns nothing.
 */
export async function campaignImportSourcePaths(campaignId: string, userId: string): Promise<string[]> {
  if (!(await ownDeletableCampaign(campaignId, userId))) return [];
  const { data, error } = await supabase
    .from("document_imports")
    .select("source_paths")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).flatMap((row) => row.source_paths.filter((path: string) => !!path));
}

/** Remove import pages by path. Throws on a storage error so the caller can report it. */
export async function deleteImportSourcePaths(paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(IMPORT_DOCUMENTS_BUCKET).remove([...paths]);
  if (error) throw error;
}

/**
 * Removes every mini in the campaign, whoever made it, through `forge-mini`
 * (#963). Counted first, because the DM reads every mini in their campaign and
 * almost no campaign has one: the edge function is only asked when there is
 * something to delete. Throws on any failure, so the caller can refuse to
 * delete the campaign.
 */
export async function deleteCampaignMinis(campaignId: string): Promise<void> {
  const { count, error } = await supabase
    .from("minis")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) throw error;
  if (!count) return;
  const { error: invokeError } = await supabase.functions.invoke("forge-mini", {
    body: { action: "delete_campaign", campaign_id: campaignId },
  });
  if (invokeError) throw new Error(await edgeErrorMessage(invokeError));
}
