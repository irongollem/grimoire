import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { edgeErrorMessage } from "@/lib/edgeError";
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

async function fetchMini(id: string): Promise<Mini> {
  const { data, error } = await supabase.from("minis").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Mini;
}

/** Gallery list — every mini in the active campaign (owner + campaign members, per RLS). */
export function useMinis() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchMinis(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/** Single mini — used by the forge wizard (resume) and the gallery preview modal. */
export function useMini(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchMini(idRef.value),
    enabled: () => !!idRef.value,
  });
  return query;
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
