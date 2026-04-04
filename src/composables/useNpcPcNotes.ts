import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { NpcPcNote, NpcPcNoteUpsert } from "@/types/npc.types";

const QUERY_KEY = "npc_pc_notes";

// ── DM: fetch all PC notes for an NPC ────────────────────────────────────────

export function useNpcPcNotes(npcId: string | Ref<string>) {
  const idRef = isRef(npcId) ? npcId : ref(npcId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("*")
        .eq("npc_id", idRef.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as NpcPcNote[];
    },
    enabled: () => !!idRef.value,
  });
}

// ── DM: upsert a note for one party member ───────────────────────────────────

export function useUpsertNpcPcNote(npcId: string) {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ partyMemberId, notes }: { partyMemberId: string; notes: string }) => {
      const user = getCurrentUser();
      const payload: NpcPcNoteUpsert = {
        campaign_id: campaign.activeCampaignId!,
        npc_id: npcId,
        party_member_id: partyMemberId,
        notes,
      };
      const { error } = await supabase
        .from("npc_pc_notes")
        .upsert({ ...payload, user_id: user!.id }, { onConflict: "npc_id,party_member_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, npcId] }),
  });
}

// ── DM: delete a note ────────────────────────────────────────────────────────

export function useDeleteNpcPcNote(npcId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("npc_pc_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, npcId] }),
  });
}

// ── Player: fetch my note for a specific NPC ─────────────────────────────────

export function useMyNpcPcNote(npcId: string | Ref<string>) {
  const idRef = isRef(npcId) ? npcId : ref(npcId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "mine", idRef.value]),
    queryFn: async () => {
      const { data } = await supabase
        .from("npc_pc_notes")
        .select("notes")
        .eq("npc_id", idRef.value)
        .maybeSingle();
      return data?.notes ?? null;
    },
    enabled: () => !!idRef.value,
  });
}
