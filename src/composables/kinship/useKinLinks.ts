import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { KIN_LINKS_KEY } from "@/lib/campaignLiveSync/registry";
import type { KinLink, KinLinkInsert, KinLinkUpdate } from "@/types/kinship.types";

// Defined beside the live-sync registry, which cannot import from composables.
export { KIN_LINKS_KEY };

/** Every kin link of the active campaign; the tree, the House lineage and the sorting review all read from this one list. */
export function useKinLinks() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [KIN_LINKS_KEY, campaignId.value] as const),
    queryFn: async ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useKinLinks fetched without a campaign");
      const { data, error } = await supabase
        .from("kin_links")
        .select("*")
        .eq("campaign_id", cid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as KinLink[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

export function useCreateKinLink() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (input: KinLinkInsert): Promise<KinLink> => {
      const campaignId = campaign.activeCampaignId;
      if (campaignId === null) throw new Error("useCreateKinLink called without a campaign");
      const user = getCurrentUser();
      if (!user) throw new Error("useCreateKinLink called while signed out");
      const { data, error } = await supabase
        .from("kin_links")
        .insert({ ...input, campaign_id: campaignId, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as KinLink;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KIN_LINKS_KEY] }),
  });
}

export function useUpdateKinLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: KinLinkUpdate }): Promise<KinLink> => {
      const { data, error } = await supabase.from("kin_links").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as KinLink;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KIN_LINKS_KEY] }),
  });
}

export function useDeleteKinLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("kin_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KIN_LINKS_KEY] }),
  });
}
