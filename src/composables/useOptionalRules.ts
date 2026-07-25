import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { CampaignRule, RuleConfig } from "@/types/rule.types";
import { getOptionalRule } from "@/rules/optionalRules";

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

/** Merge a rule's stored config over its registry defaults, so callers always
 *  get every declared field even when a row is missing or only partly set. */
export function resolveRuleConfig(
  campaignRows: CampaignRule[] | undefined,
  ruleKey: string,
): RuleConfig {
  const fields = getOptionalRule(ruleKey)?.config ?? [];
  const stored = (campaignRows ?? []).find((r) => r.rule_key === ruleKey)?.config ?? {};
  const out: RuleConfig = {};
  for (const field of fields) {
    const value = stored[field.key];
    out[field.key] = typeof value === "number" ? value : field.default;
  }
  return out;
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

/** Returns true if a built-in rule is enabled for the active campaign.
 *  Respects `defaultEnabled` — if no row exists and the rule defaults to on, returns true. */
export function useIsRuleEnabled(ruleKey: string) {
  const { data } = useOptionalRules();
  return computed(() => isRuleEffectivelyEnabled(data.value, ruleKey));
}

/** Checks whether a rule key is effectively enabled given loaded campaign rows.
 *  Falls back to the rule's `defaultEnabled` when no DB row exists. */
export function isRuleEffectivelyEnabled(
  campaignRows: CampaignRule[] | undefined,
  ruleKey: string,
): boolean {
  const row = (campaignRows ?? []).find((r) => r.rule_key === ruleKey);
  if (row) return row.enabled;
  return getOptionalRule(ruleKey)?.defaultEnabled ?? false;
}

/** Upsert a built-in optional rule's `enabled` flag and/or `config`. Used both to
 *  toggle a rule on/off (caller passes the preserved existing config, if any, so
 *  flipping the switch never wipes the DM's tuned values) and to persist tuned
 *  config values (caller passes the current `enabled` flag so saving config never
 *  toggles the rule). */
export function useUpsertCampaignRule() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ ruleKey, enabled, config = null }: { ruleKey: string; enabled: boolean; config?: RuleConfig | null }) =>
      upsertCampaignRule({
        campaign_id: campaign.activeCampaignId!,
        rule_key: ruleKey,
        enabled,
        config,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [KEY, campaign.activeCampaignId] }),
  });
}
