import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { partyListQuery } from "@/composables/party/useParty";
import type { CanonLorePassage } from "@/types/canon.types";

/**
 * Changing one lore passage, and telling it to the party (#1226 story 5). Apart from the campaign-wide read in
 * `useCanonPassages` because the NPC, place and beat sheets tell a passage ("Canon here") without listing any:
 * kept together, the whole passages module rode onto every NPC sheet as a file of its own (#1222's gate, 20 Nov
 * 2026), one more request on a page whose budget counts them.
 */

/** A passage's own columns the DM changes. `ai_provenance` is never sent by an edit: the database marks it edited. */
export type CanonPassagePatch = Partial<
  Pick<CanonLorePassage, "title" | "body" | "sort_order" | "player_visible_to" | "told_at" | "told_session_id" | "location_id" | "npc_id" | "quest_beat_id">
>;

export async function updateCanonPassage(id: string, patch: CanonPassagePatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_lore_passages").update(patch).eq("id", id).select("id, entry_id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That passage is gone, or you may not change it.");
  // Only the heading and the text are embedded; telling it, placing it or reordering it leaves the vector as it was.
  if ("title" in patch || "body" in patch) for (const row of data) queueCanonEmbedding(row.entry_id);
}

export function useUpdateCanonPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CanonPassagePatch }) => updateCanonPassage(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/**
 * The patch Tell the party writes: the time, the session that is running (none when the DM has not started one) and
 * every party member. Taking it back clears all three, because a told session with no told time is refused.
 */
export function tellPatch(memberIds: readonly string[], sessionId: string | null, now: Date = new Date()): Pick<CanonLorePassage, "told_at" | "told_session_id" | "player_visible_to"> {
  return { told_at: now.toISOString(), told_session_id: sessionId, player_visible_to: [...memberIds] };
}

export const TAKE_BACK_PATCH: Pick<CanonLorePassage, "told_at" | "told_session_id" | "player_visible_to"> = {
  told_at: null,
  told_session_id: null,
  player_visible_to: [],
};

/**
 * Tell the party and Take back, shared by the passage in the lore entry and every "here" block at the table. Tell waits for the
 * party to load (reading it then if nothing has): telling it before would share the passage with nobody, silently.
 */
export function useTellPassage() {
  const { session } = useCampaignSession();
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const { mutate } = useUpdateCanonPassage();
  return {
    // The roster is read when the DM tells, not when the block mounts: a page that only lists passages asks for no party.
    // `to` names who hears it (a backstory passage is told to its character); without it the whole party does.
    async tell(passage: Pick<CanonLorePassage, "id">, to?: readonly string[]) {
      const ids = to ?? (await qc.fetchQuery(partyListQuery(campaign.activeCampaignId))).map((m) => m.id);
      mutate({ id: passage.id, patch: tellPatch(ids, session.value?.id ?? null) });
    },
    takeBack(passage: Pick<CanonLorePassage, "id">) {
      mutate({ id: passage.id, patch: TAKE_BACK_PATCH });
    },
  };
}
