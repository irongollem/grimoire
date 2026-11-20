import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { LOCATION_ROADS_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { usePreviewMemberId } from "@/composables/kinship/usePlayerKin";
import type { DistanceUnit, Going, Road } from "@/lib/travel/roads";

interface PlayerRoadRow {
  id: string;
  from_location_id: string;
  to_location_id: string;
  distance: number | string;
  unit: DistanceUnit;
  name: string;
  going: Going;
  terrain: string | null;
}

/**
 * The roads a player knows (`get_player_roads`, #1222): a road is known when both of its places are shown to
 * them. The DM's encounter table never travels, so `roll_table_id` is null. A DM previewing a player passes the
 * previewed member, as the other player reads do. Filed under the roads root, so the `location_roads` ring
 * refreshes it with the DM's own read.
 */
export function usePlayerLocationRoads() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const previewMemberId = usePreviewMemberId();
  return useQuery({
    queryKey: computed(() => [LOCATION_ROADS_KEY, "player", campaignId.value, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , cid, previewId] }): Promise<Road[]> => {
      if (cid === null) throw new Error("usePlayerLocationRoads fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_roads", { p_campaign_id: cid, p_preview_member_id: previewId });
      if (error) throw error;
      return (data as PlayerRoadRow[]).map((row) => ({
        id: row.id,
        from_location_id: row.from_location_id,
        to_location_id: row.to_location_id,
        distance: Number(row.distance),
        unit: row.unit,
        name: row.name,
        going: row.going,
        terrain: typeof row.terrain === "string" ? row.terrain : "road",
        roll_table_id: null,
      }));
    },
    enabled: computed(() => !!campaignId.value),
  });
}
