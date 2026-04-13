import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ClassFeature, ClassFeatureInsert, ClassFeatureUpdate } from "@/types/feature.types";

export type ImportResult = { inserted: number; updated: number };

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

export function useImportSrdFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const { fetchSrdFeats } = await import("@/lib/open5eFeatImport");
      const feats = await fetchSrdFeats();
      const user = getCurrentUser();

      const allNames = feats.map((f) => f.name);
      type ExistingRow = { name: string; prerequisite: string | null; feature_type: string };
      const existing: ExistingRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < allNames.length; i += CHUNK) {
        const { data } = await supabase
          .from("class_features")
          .select("name, prerequisite, feature_type")
          .eq("open5e_import", true)
          .in("name", allNames.slice(i, i + CHUNK));
        existing.push(...((data ?? []) as ExistingRow[]));
      }
      const existingMap = new Map(existing.map((e) => [e.name, e]));

      const toInsert = feats.filter((f) => !existingMap.has(f.name));
      const INSERT_BATCH = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH).map((f) => ({ ...f, user_id: user!.id }));
        const { error } = await supabase.from("class_features").insert(batch);
        if (error) throw error;
      }

      // Update existing rows — refresh prerequisite, feature_type, and description
      // from Open5e; never touch user-edited tags, source override, or campaign_id.
      const toUpdate = feats.filter((f) => {
        const cur = existingMap.get(f.name);
        if (!cur) return false;
        return cur.prerequisite !== f.prerequisite || cur.feature_type !== f.feature_type;
      });
      const UPDATE_CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_CONCURRENCY).map((f) =>
            supabase
              .from("class_features")
              .update({ prerequisite: f.prerequisite, feature_type: f.feature_type })
              .eq("open5e_import", true)
              .eq("name", f.name),
          ),
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
