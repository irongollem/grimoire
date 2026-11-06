import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { Mini } from "@/types/mini.types";

const QUERY_KEY = "minis";

async function fetchMinis(campaignId: string): Promise<Mini[]> {
  const { data, error } = await supabase
    .from("minis")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Mini[];
}

/** Gallery list — every mini in the active campaign (owner + campaign members, per RLS). */
export function useMinis() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useMinis fetched without a campaign");
      return fetchMinis(cid);
    },
    enabled: () => !!campaignId.value,
  });
}

export function useDeleteMini() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (miniId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke("forge-mini", {
        body: { action: "delete", mini_id: miniId },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
