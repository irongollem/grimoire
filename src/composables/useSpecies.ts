import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { removeStorageImages } from "@/composables/useImageUpload";
import type { Species, SpeciesInsert, SpeciesUpdate } from "@/types/species.types";

const QUERY_KEY = "species";

async function fetchAllSpecies(): Promise<Species[]> {
  const { data, error } = await supabase
    .from("species")
    .select("*")
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

export function useAllSpecies() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchAllSpecies, staleTime: Infinity });
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

export function useSpecies(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchSpecies(id.value),
    enabled: () => !!id.value,
  });
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
