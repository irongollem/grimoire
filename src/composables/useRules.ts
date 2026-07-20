import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { SrdRule, Rule, RuleInsert, RuleUpdate } from "@/types/rule.types";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

// ── SRD Rules ─────────────────────────────────────────────────────────────────

const SRD_KEY = "srd_rules";

async function fetchSrdRules(ruleset: RulesetKey): Promise<SrdRule[]> {
  const { data, error } = await supabase
    .from("srd_rules")
    .select("*")
    .eq("ruleset", ruleset)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as SrdRule[];
}

export function useSrdRules() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [SRD_KEY, ruleset.value]),
    queryFn: () => fetchSrdRules(ruleset.value),
    staleTime: Infinity,
  });
}

// ── Custom Rules ──────────────────────────────────────────────────────────────

const CUSTOM_KEY = "rules";

async function fetchRules(campaignId: string, ruleset: RulesetKey): Promise<Rule[]> {
  const { data, error } = await supabase
    .from("rules")
    .select("*")
    .eq("campaign_id", campaignId)
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("title", { ascending: true });
  if (error) throw error;
  return data as Rule[];
}

async function fetchRule(id: string): Promise<Rule> {
  const { data, error } = await supabase.from("rules").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Rule;
}

async function createRule(rule: RuleInsert & { campaign_id: string }): Promise<Rule> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("rules")
    .insert({ ...rule, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

async function updateRule(id: string, update: RuleUpdate): Promise<Rule> {
  const { data, error } = await supabase
    .from("rules")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from("rules").delete().eq("id", id);
  if (error) throw error;
}

export function useRules() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [CUSTOM_KEY, campaignId.value, ruleset.value]),
    queryFn: () => fetchRules(campaignId.value!, ruleset.value),
    enabled: () => !!campaignId.value,
    staleTime: Infinity,
  });
}

/** Player-facing: returns player-visible rules from the campaign DM (via RLS). */
export function usePlayerVisibleRules() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [CUSTOM_KEY, "player-visible", ruleset.value]),
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase
        .from("rules")
        .select("*")
        .eq("is_player_visible", true)
        .or(`ruleset.is.null,ruleset.eq.${ruleset.value}`)
        .order("title", { ascending: true });
      if (error) throw error;
      return data as Rule[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useRule(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => [CUSTOM_KEY, toValue(id)]),
    queryFn: () => fetchRule(toValue(id)),
    enabled: () => !!toValue(id),
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (rule: RuleInsert) =>
      createRule({ ...rule, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY, campaign.activeCampaignId] }),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: RuleUpdate }) => updateRule(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY, campaign.activeCampaignId] });
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY, id] });
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [CUSTOM_KEY, campaign.activeCampaignId] }),
  });
}
