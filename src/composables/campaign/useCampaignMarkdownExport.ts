/**
 * "Export as Markdown" (#932, story 2) — the Backup tab's second export. Does
 * the fetching (campaign-scoped, RLS as the signed-in DM — no service role,
 * no new RPCs) and zips the result; `markdownVault.ts` does the actual rows
 * -> files conversion and is the thing to read for what each entity carries.
 *
 * Deliberately not grown into `useCampaignBackup.ts` (1100+ lines already) —
 * this is a different export with a different shape (a browsable vault, not
 * a restorable snapshot) and no shared logic beyond "select by campaign_id".
 */
import { strToU8, zipSync } from "fflate";
import { useMutation } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { buildMarkdownVault, collectMentionedMonsterIds } from "@/lib/campaignExport/markdownVault";
import type { Faction } from "@/types/faction.types";
import type { Location } from "@/types/location.types";
import type { Npc } from "@/types/npc.types";
import type { Note } from "@/types/notes.types";
import type { PartyMember } from "@/types/party.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import type { CampaignSession } from "@/types/session.types";

/** Every read is scoped to the campaign and runs as the signed-in DM, so RLS decides what leaves. */
async function fetchCampaignRows(campaignId: string) {
  const [campaign, npcs, locations, factions, quests, partyMembers, notes, sessions] = await Promise.all([
    supabase.from("campaigns").select("name").eq("id", campaignId).single(),
    supabase.from("npcs").select("*").eq("campaign_id", campaignId),
    supabase.from("locations").select("*").eq("campaign_id", campaignId),
    supabase.from("factions").select("*").eq("campaign_id", campaignId),
    supabase.from("quests").select("*").eq("campaign_id", campaignId),
    supabase.from("party_members").select("*").eq("campaign_id", campaignId),
    supabase.from("notes").select("*").eq("campaign_id", campaignId),
    supabase.from("campaign_sessions").select("*").eq("campaign_id", campaignId),
  ]);
  for (const result of [campaign, npcs, locations, factions, quests, partyMembers, notes, sessions]) {
    if (result.error) throw result.error;
  }
  if (!campaign.data) throw new Error("Campaign not found");
  return {
    campaignName: campaign.data.name,
    npcs: npcs.data as Npc[],
    locations: locations.data as Location[],
    factions: factions.data as Faction[],
    quests: quests.data as Quest[],
    partyMembers: partyMembers.data as PartyMember[],
    notes: notes.data as Note[],
    sessions: sessions.data as CampaignSession[],
  };
}

/**
 * Monster mentions have no vault file/folder of their own (#932 story 3 also
 * dropped the `label` a mention used to carry), so their display name has to
 * come from a fetched map instead — built here, for exactly the ids
 * mentioned anywhere in this export, never the whole shared library. Checks
 * both the user's own `monsters` table and the shared `library_monsters`
 * table, since a mentioned id can be either.
 */
async function fetchMonsterNames(ids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (!ids.length) return names;
  const [userRes, libRes] = await Promise.all([
    supabase.from("monsters").select("id, name").in("id", ids),
    supabase.from("library_monsters").select("id, name").in("id", ids),
  ]);
  if (userRes.error) throw userRes.error;
  if (libRes.error) throw libRes.error;
  for (const row of userRes.data ?? []) names[row.id] = row.name;
  for (const row of libRes.data ?? []) names[row.id] = row.name;
  return names;
}

async function buildVault(campaignId: string): Promise<{ campaignName: string; files: Record<string, string> }> {
  const { campaignName, npcs, locations, factions, quests, partyMembers, notes, sessions } = await fetchCampaignRows(campaignId);

  // quest_objectives has no campaign_id of its own — scoped through the
  // quests just fetched, same as `useCampaignBackup.ts`'s qByIds.
  const questIds = quests.map((q) => q.id);
  let questObjectives: QuestObjective[] = [];
  if (questIds.length) {
    const { data, error } = await supabase.from("quest_objectives").select("*").in("quest_id", questIds);
    if (error) throw error;
    questObjectives = (data ?? []) as QuestObjective[];
  }

  const monsterNames = await fetchMonsterNames(
    collectMentionedMonsterIds({ npcs, locations, factions, partyMembers, notes }),
  );

  const files = buildMarkdownVault({
    campaignName,
    exportedAt: new Date(),
    npcs,
    locations,
    factions,
    quests,
    questObjectives,
    partyMembers,
    notes,
    sessions,
    monsterNames,
  });
  return { campaignName, files };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "campaign";
}

/**
 * Triggers the browser download of the zipped vault. The anchor is appended
 * and the object URL revoked on a later tick, not the same one — see the
 * identical note on `downloadJson` (`useDataExport.ts`): `a.click()` only
 * queues the download, and revoking immediately can starve it for a
 * multi-megabyte file while this function still returns normally.
 */
function downloadVaultZip(files: Record<string, string>, campaignName: string): void {
  const zipInput: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) zipInput[path] = strToU8(content);
  const zipped = zipSync(zipInput);
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(campaignName)}-markdown.zip`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function useExportCampaignMarkdown() {
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { campaignName, files } = await buildVault(campaignId);
      downloadVaultZip(files, campaignName);
    },
  });
}
