import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ClassFeature, ClassFeatureInsert, ClassFeatureUpdate } from "@/types/feature.types";

const QUERY_KEY = "class_features";

async function fetchAll(): Promise<ClassFeature[]> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
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
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchAll, staleTime: Infinity });
}

export function useFeature(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
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
