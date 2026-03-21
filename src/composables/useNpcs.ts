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
  const user = await getCurrentUser();
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
      return data as import("@/types/npc.types").Npc[];
    },
    enabled: () => !!idRef.value,
  });
}

export function useNpc(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchNpc(id),
    enabled: !!id,
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
