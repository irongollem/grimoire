import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { NPC_MEMORIES_KEY } from "@/lib/campaignLiveSync/registry";
import { recordDmNoteTouch } from "@/composables/notes/useDmNote";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { NpcMemory, NpcMemoryInsert, NpcMemoryUpdate, PlayerNpcMemory } from "@/types/npcMemory.types";

export { NPC_MEMORIES_KEY };

const DM_COLUMNS =
  "id, campaign_id, npc_id, user_id, session_id, kind, body, party_member_ids, player_visible_to, ai_provenance, secret_entity_type, secret_entity_id, secret_id, created_at, updated_at";

/** Everything an NPC remembers, oldest first. The DM policy lets the DM read every row. */
export function useNpcMemories(npcId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [NPC_MEMORIES_KEY, toValue(npcId)] as const),
    queryFn: async ({ queryKey: [, id] }): Promise<NpcMemory[]> => {
      if (!id) throw new Error("useNpcMemories fetched without an NPC");
      const { data, error } = await supabase
        .from("npc_memories")
        .select(DM_COLUMNS)
        .eq("npc_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as NpcMemory[];
    },
    enabled: () => !!toValue(npcId),
  });
}

/**
 * Files a memory. The campaign comes from the NPC (trigger) and the author from
 * the session (column default), so neither is sent. Writing a memory counts as
 * touching the NPC, so it joins the scratchpad's "This session" list.
 */
export function useCreateNpcMemory() {
  const qc = useQueryClient();
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ memory }: { memory: NpcMemoryInsert; npcLabel: string }): Promise<NpcMemory> => {
      const { data, error } = await supabase.from("npc_memories").insert(memory).select(DM_COLUMNS).single();
      if (error) throw error;
      return data as NpcMemory;
    },
    onSuccess: (row, { npcLabel }) => {
      void qc.invalidateQueries({ queryKey: [NPC_MEMORIES_KEY] });
      void recordDmNoteTouch(qc, {
        userId: auth.user?.id,
        campaignId: campaign.activeCampaignId,
        type: "npc",
        id: row.npc_id,
        label: npcLabel,
      });
    },
  });
}

export function useUpdateNpcMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: NpcMemoryUpdate }) => {
      const { error } = await supabase.from("npc_memories").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [NPC_MEMORIES_KEY] }),
  });
}

export function useDeleteNpcMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("npc_memories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [NPC_MEMORIES_KEY] }),
  });
}

/**
 * The memories shared with my character: the previewed member in DM preview,
 * the linked one otherwise. Through `get_player_npc_memories` (#1056), never
 * the table: the table is the DM's, since its columns name the entity a
 * disclosed [secret] lives in, and the function returns only what a player may
 * see of a line.
 */
export function useMyNpcMemories(npcId: MaybeRefOrGetter<string | null | undefined>) {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const partyMemberId = computed(() =>
    appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
  );
  return useQuery({
    queryKey: computed(() => [NPC_MEMORIES_KEY, "mine", toValue(npcId), partyMemberId.value] as const),
    queryFn: async ({ queryKey: [, , id, memberId] }): Promise<PlayerNpcMemory[]> => {
      if (!id || !memberId) throw new Error("useMyNpcMemories fetched without an NPC and a party member");
      const { data, error } = await supabase.rpc("get_player_npc_memories", {
        p_npc_id: id,
        p_party_member_id: memberId,
      });
      if (error) throw error;
      return data as PlayerNpcMemory[];
    },
    enabled: () => !!toValue(npcId) && !!partyMemberId.value,
  });
}
