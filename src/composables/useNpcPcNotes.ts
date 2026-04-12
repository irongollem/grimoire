import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { NpcPcNote, NpcPcNoteUpsert, NpcRelationshipType } from "@/types/npc.types";

const QUERY_KEY = "npc_pc_notes";

async function performUpsert(payload: NpcPcNoteUpsert) {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("npc_pc_notes")
    .upsert({ ...payload, user_id: user!.id }, { onConflict: "npc_id,party_member_id" });
  if (error) throw error;
}

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

// ── DM: upsert a note for one party member (npcId fixed at hook call time) ───

export function useUpsertNpcPcNote(npcId: string) {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ partyMemberId, relationshipType, notes }: { partyMemberId: string; relationshipType: NpcRelationshipType; notes: string }) =>
      performUpsert({ campaign_id: campaign.activeCampaignId!, npc_id: npcId, party_member_id: partyMemberId, relationship_type: relationshipType, notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, npcId] }),
  });
}

// ── DM: upsert from graph (both IDs supplied at call time) ───────────────────

export function useUpsertNpcPcNoteDirect() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ npcId, partyMemberId, relationshipType, notes }: { npcId: string; partyMemberId: string; relationshipType: NpcRelationshipType; notes: string }) =>
      performUpsert({ campaign_id: campaign.activeCampaignId!, npc_id: npcId, party_member_id: partyMemberId, relationship_type: relationshipType, notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── DM: delete a note ────────────────────────────────────────────────────────
// Pass npcId to scope cache invalidation to one NPC; omit to invalidate all.

export function useDeleteNpcPcNote(npcId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("npc_pc_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: npcId ? [QUERY_KEY, npcId] : [QUERY_KEY] }),
  });
}

// ── DM: fetch ALL npc_pc_notes for the campaign (used by relationship graph) ──

export function useAllNpcPcNotes() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "all", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("id, npc_id, party_member_id, relationship_type, notes")
        .eq("campaign_id", campaignId.value!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as { id: string; npc_id: string; party_member_id: string; relationship_type: NpcRelationshipType; notes: string }[];
    },
    enabled: () => !!campaignId.value,
  });
}

// ── DM: fetch all NPC IDs connected to a specific party member ───────────────

export function useNpcPcNotesByPartyMember(partyMemberId: string | Ref<string>) {
  const idRef = isRef(partyMemberId) ? partyMemberId : ref(partyMemberId);
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-party-member", idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("npc_id")
        .eq("campaign_id", campaign.activeCampaignId!)
        .eq("party_member_id", idRef.value);
      if (error) throw error;
      return new Set((data as { npc_id: string }[]).map((r) => r.npc_id));
    },
    enabled: () => !!idRef.value && !!campaign.activeCampaignId,
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
