import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PlayerSessionLabel } from "@/types/session.types";

/**
 * Every session of the campaign, as players may label it: id, number, title and
 * dates, never the DM's row. Refreshed by the `campaign_sessions` doorbell.
 */
export function usePlayerSessions() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => ["player-sessions", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<PlayerSessionLabel[]> => {
      if (cid === null) throw new Error("usePlayerSessions fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_sessions", { p_campaign_id: cid });
      if (error) throw error;
      return data as PlayerSessionLabel[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}
