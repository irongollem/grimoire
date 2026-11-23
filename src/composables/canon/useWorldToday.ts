import { computed } from "vue";
import { campaignToday } from "@/lib/canon/canonForces";
import { useCampaignStore } from "@/stores/campaign";

/** The campaign's current date in the world, for what is due by it; null when the campaign keeps no calendar. */
export function useWorldToday() {
  const campaign = useCampaignStore();
  return computed(() => campaignToday(campaign.activeCampaign ?? null));
}
