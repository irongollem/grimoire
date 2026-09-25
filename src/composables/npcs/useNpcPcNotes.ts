import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
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
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("*")
        .eq("npc_id", id)
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
    queryKey: computed(() => [QUERY_KEY, "all", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (!cid) throw new Error("useAllNpcPcNotes fetched without a campaign");
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("id, npc_id, party_member_id, relationship_type, notes")
        .eq("campaign_id", cid)
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
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    // campaignId is part of the key (not just used inside queryFn) because
    // this query is otherwise indistinguishable across campaigns for the same
    // party member id, so a refetch after switching campaigns would overwrite
    // the previous campaign's cached entry with the new campaign's data.
    queryKey: computed(() => [QUERY_KEY, "by-party-member", idRef.value, campaignId.value] as const),
    queryFn: async ({ queryKey: [, , partyMemberIdKey, cid] }) => {
      if (!cid) throw new Error("useNpcPcNotesByPartyMember fetched without a campaign");
      const { data, error } = await supabase
        .from("npc_pc_notes")
        .select("npc_id")
        .eq("campaign_id", cid)
        .eq("party_member_id", partyMemberIdKey);
      if (error) throw error;
      return new Set((data as { npc_id: string }[]).map((r) => r.npc_id));
    },
    enabled: () => !!idRef.value && !!campaignId.value,
  });
}

// ── Player: fetch my note for a specific NPC ─────────────────────────────────
// Under the DM policy this query can return every party member's note for the
// NPC, so it must be scoped to the previewed/linked party member — otherwise
// .maybeSingle() errors with 2+ notes and returns the wrong one with exactly 1.

export function useMyNpcPcNote(npcId: string | Ref<string>) {
  const idRef = isRef(npcId) ? npcId : ref(npcId);
  const auth = useAuthStore();
  const ui = useUiStore();
  const partyMemberId = computed(() =>
    ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
  );
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "mine", idRef.value, partyMemberId.value] as const),
    queryFn: async ({ queryKey: [, , npcIdKey, partyMemberIdKey] }) => {
      if (!partyMemberIdKey) throw new Error("useMyNpcPcNote fetched without a party member");
      const { data } = await supabase
        .from("npc_pc_notes")
        .select("notes")
        .eq("npc_id", npcIdKey)
        .eq("party_member_id", partyMemberIdKey)
        .maybeSingle();
      return data?.notes ?? null;
    },
    enabled: () => !!idRef.value && !!partyMemberId.value,
  });
}
