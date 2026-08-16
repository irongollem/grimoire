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

/**
 * The SRD baseline a user reads when they belong to no campaign. Without a
 * campaign `useRuleset` resolves to 2014, so this is the edition that matches;
 * a 2024 slug here would be inert anyway, since every library fetch filters on
 * `ruleset` server-side.
 */
const STANDALONE_LIBRARY_SLUGS: string[] = ["srd-2014"];

/**
 * Which library sources a shared-content query should read: the active
 * campaign's enabled sources, or the SRD baseline when there is no campaign.
 *
 * **`null` means "not known yet" and is load-bearing.** Callers gate their
 * library query on `enabled: () => slugs.value !== null`; returning `[]` while
 * the enabled-source rows are still in flight would fire a query that matches
 * nothing and cache the empty result.
 *
 * The standalone branch exists because `useEnabledSources` is *disabled*
 * without a campaign, so its data stays `undefined` forever and the slug list
 * would sit at `null` permanently — every shared-content surface silently
 * empty. That is not hypothetical: it left campaign-less players with no
 * spells at all, which combined with the level-up wizard's mandatory spell
 * picks produced a level-up that could never be confirmed (#736, #737).
 *
 * Use this rather than re-deriving the computed. Six call sites had their own
 * copy; exactly one of them remembered the standalone case, and the surfaces
 * behind the other five were empty for anyone without a campaign.
 */
export function useLibrarySourceSlugs() {
  const campaign = useCampaignStore();
  const enabledQuery = useEnabledSources();
  const slugs = computed<string[] | null>(() =>
    resolveLibrarySlugs(campaign.activeCampaignId, enabledQuery.data.value),
  );
  return { slugs, isLoading: enabledQuery.isLoading };
}

/** The decision behind {@link useLibrarySourceSlugs}, free of Vue and the
 *  store so the standalone rule can be asserted directly. Exported for testing. */
export function resolveLibrarySlugs(
  activeCampaignId: string | null,
  enabled: Pick<EnabledSource, "source_slug">[] | undefined,
): string[] | null {
  if (!activeCampaignId) return STANDALONE_LIBRARY_SLUGS;
  return enabled?.map((e) => e.source_slug) ?? null;
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
