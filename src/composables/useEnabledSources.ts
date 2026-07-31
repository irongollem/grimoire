import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/useRuleset";

const ENABLED_KEY          = "enabled-sources";
const AVAILABLE_KEY        = "available-library-sources";
const AVAILABLE_SPELL_KEY  = "available-library-spell-sources";
const AVAILABLE_ITEM_KEY   = "available-library-item-sources";
const AVAILABLE_SPECIES_KEY = "available-library-species-sources";

export interface EnabledSource {
  id: string;
  campaign_id: string;
  source_slug: string;
  source_title: string | null;
  enabled_at: string;
}

export interface AvailableLibrarySource {
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

async function fetchAvailableLibrarySources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_monster_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
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

export function useAvailableLibrarySources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_KEY, ruleset.value]),
    queryFn: () => fetchAvailableLibrarySources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibrarySpellSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_spell_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibrarySpellSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPELL_KEY, ruleset.value]),
    queryFn: () => fetchAvailableLibrarySpellSources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibraryItemSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_item_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibraryItemSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_ITEM_KEY, ruleset.value]),
    queryFn: () => fetchAvailableLibraryItemSources(ruleset.value),
    staleTime: Infinity,
  });
}

async function fetchAvailableLibrarySpeciesSources(ruleset: "2014" | "2024"): Promise<AvailableLibrarySource[]> {
  const { data, error } = await supabase.rpc("get_library_species_sources", { p_ruleset: ruleset });
  if (error) throw error;
  return (data ?? []) as AvailableLibrarySource[];
}

export function useAvailableLibrarySpeciesSources() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [AVAILABLE_SPECIES_KEY, ruleset.value]),
    queryFn: () => fetchAvailableLibrarySpeciesSources(ruleset.value),
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
      queryClient.invalidateQueries({ queryKey: ["library-monsters"] });
      queryClient.invalidateQueries({ queryKey: ["library-spells"] });
      queryClient.invalidateQueries({ queryKey: ["library-items"] });
      queryClient.invalidateQueries({ queryKey: ["library-species"] });
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
      queryClient.invalidateQueries({ queryKey: ["library-monsters"] });
      queryClient.invalidateQueries({ queryKey: ["library-spells"] });
      queryClient.invalidateQueries({ queryKey: ["library-items"] });
      queryClient.invalidateQueries({ queryKey: ["library-species"] });
    },
  });
}
