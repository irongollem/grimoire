/**
 * Ask Grimoire (#1253) is offered where a DM could run a generator from its own page: the DM lens, in a campaign
 * with AI switched on (`isAiEnabled` also says no to a child account). Every entry point (the sidebar and top-bar
 * buttons, the search row, `mod+j`, the panel itself) asks this one rule, so they cannot disagree.
 */
import { computed, type ComputedRef } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";

export function useCanAsk(): ComputedRef<boolean> {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  return computed(() => auth.currentRole === "dm" && campaign.isAiEnabled);
}
