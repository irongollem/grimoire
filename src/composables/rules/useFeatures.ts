import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ClassFeature, ClassFeatureInsert, ClassFeatureUpdate } from "@/types/feature.types";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "class_features";

async function fetchAll(ruleset: RulesetKey): Promise<ClassFeature[]> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as ClassFeature[];
}

/** Every feat the caller can read, in every edition: the Codex Feats tab filters by edition itself. */
async function fetchAllFeats(): Promise<ClassFeature[]> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
    .eq("kind", "feat")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as ClassFeature[];
}

async function fetchOne(id: string): Promise<ClassFeature> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function createFeature(input: ClassFeatureInsert): Promise<ClassFeature> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("class_features")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function updateFeature(id: string, update: ClassFeatureUpdate): Promise<ClassFeature> {
  const { data, error } = await supabase
    .from("class_features")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function deleteFeature(id: string): Promise<void> {
  const { error } = await supabase.from("class_features").delete().eq("id", id);
  if (error) throw error;
}

/** Full list — used for EntityCombobox in the archetypes editor. staleTime Infinity since features change rarely. */
export function useAllFeatures() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAll(rs),
    staleTime: Infinity,
  });
}

/** The Codex Feats tab. Not scoped to the table's ruleset, so its edition filter has both to choose from. */
export function useAllFeats() {
  return useQuery({
    queryKey: [QUERY_KEY, "feats"] as const,
    queryFn: fetchAllFeats,
    staleTime: Infinity,
  });
}

async function fetchByIds(ids: readonly string[]): Promise<ClassFeature[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("class_features").select("*").in("id", [...ids]);
  if (error) throw error;
  return data as ClassFeature[];
}

/**
 * Features by STORED id, with no ruleset filter: a subclass or class table
 * references its features by id, and a reference outlives the edition scoping
 * of `useAllFeatures` (a legacy 2014 subclass levelled by a 2024 character
 * would otherwise resolve to nothing). Ids that match no readable row are
 * absent from the result.
 */
export function useFeaturesByIds(ids: Ref<readonly string[]>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-ids", [...ids.value].sort()] as const),
    queryFn: ({ queryKey: [, , wanted] }) => fetchByIds(wanted),
    enabled: () => ids.value.length > 0,
    staleTime: Infinity,
  });
}

export function useFeature(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, fid] }) => fetchOne(fid),
    enabled: () => !!id.value,
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ClassFeatureUpdate }) =>
      updateFeature(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
