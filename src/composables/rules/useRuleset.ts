import { computed } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { normalizeRuleset } from "@/types/ruleset.types";

/** The campaign-wide ruleset. Existing and unconfigured campaigns resolve to 2014. */
export function useRuleset() {
  const campaign = useCampaignStore();
  const ruleset = computed(() => normalizeRuleset(campaign.activeCampaign?.ruleset));

  return {
    ruleset,
    is2014: computed(() => ruleset.value === "2014"),
    is2024: computed(() => ruleset.value === "2024"),
  };
}
