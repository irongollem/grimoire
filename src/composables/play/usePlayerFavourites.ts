import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

const QUERY_KEY = "player_favourites";

async function fetchFavouriteIds(campaignId: string, entityType: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("player_favourites")
    .select("entity_id")
    .eq("campaign_id", campaignId)
    .eq("entity_type", entityType);
  if (error) throw error;
  return data.map((r) => r.entity_id as string);
}

export function usePlayerFavourites(entityType: string) {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const campaignId = computed(() => campaign.activeCampaignId);

  const { data } = useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, entityType]),
    queryFn: () => fetchFavouriteIds(campaignId.value!, entityType),
    enabled: () => !!campaignId.value,
  });

  const favouriteIds = computed(() => new Set(data.value ?? []));

  const { mutate: toggleFavourite } = useMutation({
    mutationFn: async (entityId: string) => {
      const cid = campaignId.value!;
      if (favouriteIds.value.has(entityId)) {
        const { error } = await supabase
          .from("player_favourites")
          .delete()
          .eq("campaign_id", cid)
          .eq("entity_type", entityType)
          .eq("entity_id", entityId);
        if (error) throw error;
      } else {
        const user = getCurrentUser();
        const { error } = await supabase
          .from("player_favourites")
          .insert({ user_id: user!.id, campaign_id: cid, entity_type: entityType, entity_id: entityId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaignId.value, entityType] });
    },
  });

  return { favouriteIds, toggleFavourite };
}
