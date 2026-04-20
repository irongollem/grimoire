import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { ChroniclerImage, ChroniclerImageInsert } from "@/types/chronicler.types";

function queryKey(campaignId: string | null) {
  return ["chroniclerImages", campaignId];
}

export function useChroniclerImages() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => queryKey(activeCampaignId.value)),
    enabled: computed(() => !!activeCampaignId.value),
    queryFn: async (): Promise<ChroniclerImage[]> => {
      const { data, error } = await supabase
        .from("chronicler_images")
        .select("*")
        .eq("campaign_id", activeCampaignId.value!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateChroniclerImage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async (insert: ChroniclerImageInsert): Promise<ChroniclerImage> => {
      const { data, error } = await supabase
        .from("chronicler_images")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKey(activeCampaignId.value) });
    },
  });
}

export function useDeleteChroniclerImage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("chronicler_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKey(activeCampaignId.value) });
    },
  });
}
