import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Npc, NpcInsert, NpcUpdate } from "@/types/npc.types";

const QUERY_KEY = "npcs";

async function fetchNpcs(campaignId: string): Promise<Npc[]> {
  const { data, error } = await supabase
    .from("npcs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Npc[];
}

async function fetchNpc(id: string): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Npc;
}

async function createNpc(npc: NpcInsert): Promise<Npc> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("npcs")
    .insert({ ...npc, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Npc;
}

async function updateNpc(id: string, update: NpcUpdate): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as Npc;
}

async function deleteNpc(id: string): Promise<void> {
  const { error } = await supabase.from("npcs").delete().eq("id", id);
  if (error) throw error;
}

export function useNpcs() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchNpcs(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useNpcsByLocation(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-location", idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npcs")
        .select("*")
        .eq("location_id", idRef.value)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Npc[];
    },
    enabled: () => !!idRef.value,
  });
}

/** Fetch NPCs across multiple location IDs (for "who's here" with descendants). */
export function useNpcsByLocations(locationIds: Ref<string[]>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-locations", locationIds.value]),
    queryFn: async () => {
      if (!locationIds.value.length) return [];
      const { data, error } = await supabase
        .from("npcs")
        .select("*")
        .in("location_id", locationIds.value)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Npc[];
    },
    enabled: () => locationIds.value.length > 0,
  });
}

export function useNpc(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchNpc(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateNpc() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (npc: Omit<NpcInsert, "campaign_id">) =>
      createNpc({ ...npc, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateNpc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NpcUpdate }) => updateNpc(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteNpc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNpc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

// ── Player portal: shared NPCs ────────────────────────────────────────────────

export function useSharedNpcs() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "shared", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npcs")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .not("player_visible_to", "is", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Npc[];
    },
    enabled: () => !!campaignId.value,
  });
}

// ── Player personal notes on an NPC ──────────────────────────────────────────

const NOTES_KEY = "npc_player_notes";

export function useNpcPlayerNotes(npcId: string) {
  return useQuery({
    queryKey: [NOTES_KEY, npcId],
    queryFn: async () => {
      const { data } = await supabase
        .from("npc_player_notes")
        .select("notes")
        .eq("npc_id", npcId)
        .maybeSingle();
      return data?.notes ?? "";
    },
    enabled: !!npcId,
  });
}

export function useUpsertNpcPlayerNotes(npcId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("npc_player_notes")
        .upsert({ npc_id: npcId, user_id: user!.id, notes }, { onConflict: "npc_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTES_KEY, npcId] }),
  });
}

