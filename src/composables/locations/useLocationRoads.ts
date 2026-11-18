import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { LOCATION_ROADS_KEY } from "@/lib/campaignLiveSync/registry";
import type { DistanceUnit, Going, Road } from "@/lib/travel/roads";

const COLUMNS = "id, from_location_id, to_location_id, distance, unit, name, going";

/**
 * Every road of the active campaign (#1222). One read for the whole campaign, not one per place: the way between
 * two places needs all of them, and a campaign has tens of roads. Scoped to the campaign in the query itself; RLS
 * is a ceiling, not a filter. Refreshed by the campaign's live sync when a road is added, changed or removed.
 */
export function useLocationRoads() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [LOCATION_ROADS_KEY, campaignId.value] as const),
    queryFn: async ({ queryKey: [, id] }): Promise<Road[]> => {
      if (!id) throw new Error("useLocationRoads read without a campaign");
      const { data, error } = await supabase.from("location_roads").select(COLUMNS).eq("campaign_id", id);
      if (error) throw error;
      // `distance` is numeric, which PostgREST returns as a number here; anything else is not a road.
      return (data ?? []).map((row) => ({ ...row, distance: Number(row.distance) })) as Road[];
    },
    enabled: () => !!campaignId.value,
  });
}

export interface NewRoad {
  fromLocationId: string;
  toLocationId: string;
  distance: number;
  unit: DistanceUnit;
  name: string;
  going: Going;
}

/** Adds a road between two places of the active campaign. */
export function useAddLocationRoad() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (road: NewRoad): Promise<void> => {
      const user = getCurrentUser();
      const campaignId = campaign.activeCampaignId;
      if (!user || !campaignId) throw new Error("Not signed in to a campaign");
      const { error } = await supabase.from("location_roads").insert({
        campaign_id: campaignId,
        user_id: user.id,
        from_location_id: road.fromLocationId,
        to_location_id: road.toLocationId,
        distance: road.distance,
        unit: road.unit,
        name: road.name.trim(),
        going: road.going,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LOCATION_ROADS_KEY] }),
  });
}

/** Removes a road. Named by its id within the active campaign. */
export function useDeleteLocationRoad() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roadId: string): Promise<void> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No campaign");
      const { error } = await supabase.from("location_roads").delete().eq("id", roadId).eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LOCATION_ROADS_KEY] }),
  });
}
