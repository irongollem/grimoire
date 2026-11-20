import { computed } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { sharedWith } from "@/lib/canon/canonBackstory";
import { openBackstory } from "@/composables/canon/useBackstory";
import { usePlayerCanon, type PlayerBackstory } from "@/composables/canon/usePlayerCanon";
import { useParty } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import type { PartyMember } from "@/types/party.types";

/**
 * The character whose story "My story" tells: the one the player is playing, or the one a DM is previewing as.
 */
export function useMyMemberId() {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  return computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId));
}

/**
 * The player's own backstory (#1226 story 10, frame 14): their character, the passages told to them (theirs and the
 * DM's), and the three writes a player may make, all on passages they wrote. A player's write never queues an
 * embedding: the by-meaning lookup is the DM's, and its edge function refuses a player.
 */
export function useMyStory() {
  const campaign = useCampaignStore();
  const appUi = useAppUiStore();
  const qc = useQueryClient();
  const memberId = useMyMemberId();
  const { world, isLoading, error } = usePlayerCanon();
  const { data: party } = useParty();

  const member = computed<PartyMember | null>(() => (party.value ?? []).find((m) => m.id === memberId.value) ?? null);
  const backstory = computed<PlayerBackstory | null>(() => world.value?.backstories.find((b) => b.memberId === memberId.value) ?? null);
  /** A DM looking through a player's eyes reads, never writes: what they wrote would not be the player's. */
  const readOnly = computed(() => appUi.dmPreviewMode);

  const refresh = () => qc.invalidateQueries({ queryKey: [CANON_KEY] });

  const add = useMutation({
    mutationFn: async ({ shareWithParty }: { shareWithParty: boolean }) => {
      const cid = campaign.activeCampaignId;
      const own = memberId.value;
      const user = getCurrentUser();
      if (cid === null || own === null || !user) throw new Error("Add to my story called without a campaign, a character and a user");
      // The entry first: a player cannot write `canon_entries`, so the passage has nothing to hang off until it exists.
      const entryId = await openBackstory(own);
      const sortOrder = (backstory.value?.passages ?? []).reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
      const { error: insertError } = await supabase.from("canon_lore_passages").insert({
        campaign_id: cid,
        user_id: user.id,
        author_id: user.id,
        entry_id: entryId,
        title: "",
        body: null,
        sort_order: sortOrder,
        player_visible_to: sharedWith(own, (party.value ?? []).map((m) => m.id), shareWithParty),
      });
      if (insertError) throw insertError;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(toast.fromError(e)),
  });

  return { memberId, member, backstory, readOnly, isLoading, error, add };
}

/** A player's edit of one passage they wrote. RLS answers a write it refuses with no row, which is told from a save. */
export async function updateMyPassage(id: string, patch: { title: string; body: string | null }): Promise<void> {
  const { data, error } = await supabase.from("canon_lore_passages").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That passage is gone, or you may not change it.");
}

export function useRemoveMyPassage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("canon_lore_passages").delete().eq("id", id).select("id");
      if (error) throw error;
      if (data.length === 0) throw new Error("That passage is gone, or you may not remove it.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
