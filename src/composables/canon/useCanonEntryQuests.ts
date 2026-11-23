import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { CanonEntryQuest } from "@/types/canon.types";

/**
 * The quests a canon entry matters in (#1255 items 12 and 13): where the party meets a force, the quest built to
 * uncover a secret, the one that turns on a truth, tells a lore entry or pays off a backstory. The campaign's links are
 * read once, with the forces' data (`useCanonForceData().quests`); this file writes them. Every write rings the doorbell.
 */

/** The campaign's links, scoped in the query: RLS only bounds who may read. */
export async function fetchCanonEntryQuests(campaignId: string): Promise<CanonEntryQuest[]> {
  const { data, error } = await supabase.from("canon_entry_quests").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true });
  if (error) throw error;
  return data as CanonEntryQuest[];
}

export async function createEntryQuests(inputs: readonly { campaign_id: string; entry_id: string; quest_id: string }[]): Promise<void> {
  if (inputs.length === 0) return;
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  // Ignoring a duplicate is how "linked once" holds when two tabs add the same quest; the table's unique index is the guard.
  const { error } = await supabase
    .from("canon_entry_quests")
    .upsert(inputs.map((i) => ({ ...i, user_id: user.id })), { onConflict: "entry_id,quest_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function deleteEntryQuest(id: string): Promise<void> {
  const { error } = await supabase.from("canon_entry_quests").delete().eq("id", id);
  if (error) throw error;
}

/** One write on the links: it refreshes the canon and tells the DM when it fails. */
function useLinkWrite<A>(write: (arg: A) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export const useCreateEntryQuests = () => useLinkWrite(createEntryQuests);
export const useDeleteEntryQuest = () => useLinkWrite(deleteEntryQuest);
