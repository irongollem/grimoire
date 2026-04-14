import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { CampaignRule } from "@/types/rule.types";

const KEY = "campaign_rules";

async function fetchCampaignRules(campaignId: string): Promise<CampaignRule[]> {
  const { data, error } = await supabase
    .from("campaign_rules")
    .select("*")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return data as CampaignRule[];
}

async function upsertCampaignRule(rule: Omit<CampaignRule, "updated_at">): Promise<CampaignRule> {
  const { data, error } = await supabase
    .from("campaign_rules")
    .upsert(rule, { onConflict: "campaign_id,rule_key" })
    .select()
    .single();
  if (error) throw error;
  return data as CampaignRule;
}

/** Returns all built-in optional rule toggles for the active campaign. */
export function useOptionalRules() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [KEY, campaignId.value]),
    queryFn: () => fetchCampaignRules(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/** Returns true if a built-in rule is enabled for the active campaign. */
export function useIsRuleEnabled(ruleKey: string) {
  const { data } = useOptionalRules();
  return computed(() =>
    data.value?.find((r) => r.rule_key === ruleKey)?.enabled ?? false,
  );
}

/** Toggle a built-in optional rule on/off. */
export function useToggleOptionalRule() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ ruleKey, enabled }: { ruleKey: string; enabled: boolean }) =>
      upsertCampaignRule({
        campaign_id: campaign.activeCampaignId!,
        rule_key: ruleKey,
        enabled,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [KEY, campaign.activeCampaignId] }),
  });
}
