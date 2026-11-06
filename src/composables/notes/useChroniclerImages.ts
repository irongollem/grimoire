import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { ChroniclerImage } from "@/types/chronicler.types";

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
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
