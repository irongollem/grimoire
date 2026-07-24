import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { removeStorageImages } from "@/composables/useImageUpload";
import type { Species, SpeciesInsert, SpeciesUpdate } from "@/types/species.types";
import { useEnabledSources } from "@/composables/useEnabledSources";
import { isUuid } from "@/lib/contentIdentity";
import { mergeSrdWithCustom } from "@/lib/srdShadow";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "species";
const SRD_QUERY_KEY = "srd-species";

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

async function fetchSrdSpecies(enabledSlugs: string[], ruleset: RulesetKey): Promise<Species[]> {
  if (enabledSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("srd_species")
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
  const enabledQuery = useEnabledSources();

  const enabledSlugs = computed(() =>
    enabledQuery.data.value?.map((e) => e.source_slug) ?? null,
  );

  const srdQuery = useQuery({
    queryKey: computed(() => [SRD_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchSrdSpecies(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed<Species[]>(() =>
    mergeSrdWithCustom(srdQuery.data.value ?? [], customQuery.data.value ?? []),
  );

  const isLoading = computed(
    () => customQuery.isLoading.value || enabledQuery.isLoading.value || srdQuery.isLoading.value,
  );

  return { data, isLoading };
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
      .from("srd_species")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return { ...data, user_id: "", campaign_id: null, notes: null } as Species;
  }
  return fetchSpecies(id);
}

/** Resolves against BOTH stores — a text id may be a custom species uuid or a
 *  shared srd_species slug (party_members.species_id / disguise_species_id
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
 *  shared srd_species table rather than the user's custom species table. Lets
 *  UI gate a "Customize" affordance without a second query. */
export function useIsSrdSpecies(id: Ref<string>) {
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
 *  homebrew content. Mirrors {@link useCloneSrdMonster}: the clone carries the
 *  same source identity, so it shadows the shared row in every merged
 *  {@link useAllSpecies} list afterwards. */
export function useCloneSrdSpecies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (srdSpecies: Species): Promise<Species> => {
      const {
        name, description, size, avg_height, avg_weight, speed,
        ability_score_increases, traits, languages, tags, source, subraces,
        image_url, focal_point, is_shapeshifter, natural_armor_ac, granted_spells,
        ruleset, conceptual_key, source_document_key, source_record_key,
        source_revision, source_license, provenance,
      } = srdSpecies;
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
