import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import type { NpcSet, NpcSetInsert, NpcSetUpdate } from "@/types/npc.types";

const QUERY_KEY = "npc_sets";

async function fetchNpcSets(campaignId: string): Promise<NpcSet[]> {
  const { data, error } = await supabase
    .from("npc_sets")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as NpcSet[];
}

export function useNpcSets() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchNpcSets(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCreateNpcSet() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  const toast = useToast();
  return useMutation({
    mutationFn: async (set: NpcSetInsert): Promise<NpcSet> => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("npc_sets")
        .insert({ ...set, campaign_id: campaign.activeCampaignId!, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as NpcSet;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useUpdateNpcSet() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: NpcSetUpdate }): Promise<NpcSet> => {
      const { data, error } = await supabase
        .from("npc_sets")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as NpcSet;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useDeleteNpcSet() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  const toast = useToast();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("npc_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
