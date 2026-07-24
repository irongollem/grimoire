import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/useRuleset";

const ENABLED_KEY          = "enabled-sources";
const AVAILABLE_KEY        = "available-srd-sources";
const AVAILABLE_SPELL_KEY  = "available-srd-spell-sources";
const AVAILABLE_ITEM_KEY   = "available-srd-item-sources";
const AVAILABLE_SPECIES_KEY = "available-srd-species-sources";

export interface EnabledSource {
  id: string;
  campaign_id: string;
  source_slug: string;
  source_title: string | null;
  enabled_at: string;
}

export interface AvailableSrdSource {
  source: string;       // slug, e.g. "wotc-srd"
  source_title: string | null;
  count: number;
}

async function fetchEnabledSources(campaignId: string): Promise<EnabledSource[]> {
  const { data, error } = await supabase
    .from("campaign_enabled_sources")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("source_title", { ascending: true });
  if (error) throw error;
  return data as EnabledSource[];
}

async function fetchAvailableSrdSources(ruleset: "2014" | "2024"): Promise<AvailableSrdSource[]> {
  const { data, error } = await supabase.rpc("get_srd_monster_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableSrdSource[];
}

async function enableSource(campaignId: string, source_slug: string, source_title: string | null): Promise<void> {
  const { error } = await supabase
    .from("campaign_enabled_sources")
    .insert({ campaign_id: campaignId, source_slug, source_title });
  if (error) throw error;
}

async function disableSource(campaignId: string, source_slug: string): Promise<void> {
  const { error } = await supabase
    .from("campaign_enabled_sources")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("source_slug", source_slug);
  if (error) throw error;
}

export function useEnabledSources() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [ENABLED_KEY, campaignId.value]),
    queryFn: () => fetchEnabledSources(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useAvailableSrdSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_KEY, ruleset.value]),
    queryFn: () => fetchAvailableSrdSources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableSrdSpellSources(ruleset: "2014" | "2024"): Promise<AvailableSrdSource[]> {
  const { data, error } = await supabase.rpc("get_srd_spell_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableSrdSource[];
}

export function useAvailableSrdSpellSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPELL_KEY, ruleset.value]),
    queryFn: () => fetchAvailableSrdSpellSources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableSrdItemSources(ruleset: "2014" | "2024"): Promise<AvailableSrdSource[]> {
  const { data, error } = await supabase.rpc("get_srd_item_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableSrdSource[];
}

export function useAvailableSrdItemSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_ITEM_KEY, ruleset.value]),
    queryFn: () => fetchAvailableSrdItemSources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableSrdSpeciesSources(ruleset: "2014" | "2024"): Promise<AvailableSrdSource[]> {
  const { data, error } = await supabase.rpc("get_srd_species_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableSrdSource[];
}

export function useAvailableSrdSpeciesSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPECIES_KEY, ruleset.value]),
    queryFn: () => fetchAvailableSrdSpeciesSources(ruleset.value),
    staleTime: Infinity,
  });
}

export function useEnableSource() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source_slug, source_title }: { source_slug: string; source_title: string | null }) =>
      enableSource(campaign.activeCampaignId!, source_slug, source_title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ENABLED_KEY] });
      queryClient.invalidateQueries({ queryKey: ["srd-monsters"] });
      queryClient.invalidateQueries({ queryKey: ["srd-spells"] });
      queryClient.invalidateQueries({ queryKey: ["srd-items"] });
      queryClient.invalidateQueries({ queryKey: ["srd-species"] });
    },
  });
}

export function useDisableSource() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source_slug: string) =>
      disableSource(campaign.activeCampaignId!, source_slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ENABLED_KEY] });
      queryClient.invalidateQueries({ queryKey: ["srd-monsters"] });
      queryClient.invalidateQueries({ queryKey: ["srd-spells"] });
      queryClient.invalidateQueries({ queryKey: ["srd-items"] });
      queryClient.invalidateQueries({ queryKey: ["srd-species"] });
    },
  });
}
