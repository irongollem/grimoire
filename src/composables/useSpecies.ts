import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { removeStorageImages } from "@/composables/useImageUpload";
import type { Species, SpeciesInsert, SpeciesUpdate } from "@/types/species.types";
import { useLibrarySourceSlugs } from "@/composables/useEnabledSources";
import { isUuid } from "@/lib/library/contentIdentity";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import { useRuleset } from "@/composables/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import { allowedSpecies } from "@/lib/campaignContentGating";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "species";
const LIBRARY_QUERY_KEY = "library-species";

async function fetchAllSpecies(ruleset: RulesetKey): Promise<Species[]> {
  const { data, error } = await supabase
    .from("species")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Species[];
}

async function fetchSpecies(id: string): Promise<Species> {
  const { data, error } = await supabase.from("species").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Species;
}

async function createSpecies(species: SpeciesInsert): Promise<Species> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("species")
    .insert({ ...species, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Species;
}

async function updateSpecies(id: string, update: SpeciesUpdate): Promise<Species> {
  const { data, error } = await supabase
    .from("species")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Species;
}

async function deleteSpecies(species: Species): Promise<void> {
  const { error } = await supabase.from("species").delete().eq("id", species.id);
  if (error) throw error;
  await removeStorageImages("asset-images", species.image_url);
}

async function fetchLibrarySpecies(enabledSlugs: string[], ruleset: RulesetKey): Promise<Species[]> {
  if (enabledSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("library_species")
    .select("*")
    .in("source", enabledSlugs)
    .eq("ruleset", ruleset)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    user_id: "",
    campaign_id: null,
    notes: null,
  })) as Species[];
}


/** Returns SRD species filtered by the campaign's enabled sources + the user's
 *  custom species, sorted by name. Dedupe: a custom row with matching source
 *  identity (or, for legacy rows, matching lowercase name) shadows the srd row. */
export function useAllSpecies() {
  const { ruleset } = useRuleset();
  const customQuery = useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value]),
    queryFn: () => fetchAllSpecies(ruleset.value),
    staleTime: Infinity,
  });
  const { slugs: enabledSlugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchLibrarySpecies(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed<Species[]>(() =>
    mergeLibraryWithCustom(libraryQuery.data.value ?? [], customQuery.data.value ?? []),
  );

  const isLoading = computed(
    () => customQuery.isLoading.value || sourcesLoading.value || libraryQuery.isLoading.value,
  );

  return { data, isLoading };
}

/** {@link useAllSpecies} narrowed to what the active campaign permits: the DM's
 *  `disabled_species_ids` blocklist and species exclusive to another campaign
 *  are dropped. **Every species picker must use `data`** — DM and player alike;
 *  the blocklist is a table rule, not DM-UI decoration (#566).
 *
 *  `all` is the ungated list, for resolving a species a character already has:
 *  disabling a species hides it from the pickers, it does not erase it from the
 *  characters who picked it first. */
export function useCampaignSpecies() {
  const { data: all, isLoading } = useAllSpecies();
  const campaign = useCampaignStore();
  const data = computed(() =>
    allowedSpecies(all.value, {
      campaignId: campaign.activeCampaignId,
      disabledIds: campaign.activeCampaign?.disabled_species_ids,
    }),
  );
  return { data, all, isLoading };
}

/** Returns a Map<species_id, species_name> for fast inline lookups. */
export function useSpeciesNameMap() {
  const { data } = useAllSpecies();
  return computed(() => {
    const m = new Map<string, string>();
    for (const s of data.value ?? []) m.set(s.id, s.name);
    return m;
  });
}

async function fetchResolvedSpecies(id: string): Promise<Species> {
  if (!isUuid(id)) {
    const { data, error } = await supabase
      .from("library_species")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return { ...data, user_id: "", campaign_id: null, notes: null } as Species;
  }
  return fetchSpecies(id);
}

/** Resolves against BOTH stores — a text id may be a custom species uuid or a
 *  shared library_species slug (party_members.species_id / disguise_species_id
 *  hold either, migration 20260724000003). Consumers (SpeciesDetail, player
 *  views) get transparent resolution with no signature change. */
export function useSpecies(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchResolvedSpecies(id.value),
    enabled: () => !!id.value,
  });
}

/** Trivial companion to {@link useSpecies}: whether `id` resolves against the
 *  shared library_species table rather than the user's custom species table. Lets
 *  UI gate a "Customize" affordance without a second query. */
export function useIsLibrarySpecies(id: Ref<string>) {
  return computed(() => !!id.value && !isUuid(id.value));
}

export function useCreateSpecies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpecies,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateSpecies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SpeciesUpdate }) =>
      updateSpecies(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteSpecies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecies,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Clone an SRD species into the user's own collection, so a DM can enrich the
 *  Open5e-sourced defaults (subraces, granted spells, shapeshifting, art) with
 *  homebrew content. Mirrors {@link useCloneLibraryMonster}: the clone carries the
 *  same source identity, so it shadows the shared row in every merged
 *  {@link useAllSpecies} list afterwards. */
export function useCloneLibrarySpecies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (librarySpecies: Species): Promise<Species> => {
      const {
        name, description, size, avg_height, avg_weight, speed,
        ability_score_increases, traits, languages, tags, source, subraces,
        image_url, focal_point, is_shapeshifter, natural_armor_ac, granted_spells,
        ruleset, conceptual_key, source_document_key, source_record_key,
        source_revision, source_license, provenance,
      } = librarySpecies;
      return createSpecies({
        name,
        description,
        notes: null,
        size,
        avg_height,
        avg_weight,
        speed,
        ability_score_increases,
        traits,
        languages,
        tags,
        source,
        subraces,
        image_url,
        focal_point,
        is_shapeshifter,
        natural_armor_ac,
        granted_spells,
        ruleset,
        conceptual_key,
        source_document_key,
        source_record_key,
        source_revision,
        source_license,
        provenance,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
