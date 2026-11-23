import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { BEATS_KEY } from "@/lib/campaignLiveSync/registry";

export interface BeatQuest {
  id: string;
  quest_id: string;
}

/** Which quest each beat of the campaign belongs to: one read, scoped by campaign, so Tonight can keep the beats of active quests. */
export async function fetchBeatQuests(campaignId: string): Promise<BeatQuest[]> {
  const { data, error } = await supabase.from("quest_beats").select("id, quest_id").eq("campaign_id", campaignId);
  if (error) throw error;
  return data;
}

/** Refreshed with the beats doorbell. `enabled` lets a page ask only while it needs the answer. */
export function useCampaignBeatQuests(enabled: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "campaign-beat-quests", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCampaignBeatQuests fetched without a campaign");
      return fetchBeatQuests(cid);
    },
    enabled: () => !!campaignId.value && enabled(),
  });
}
