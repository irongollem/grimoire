import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { DungeonFeature, DungeonFeatureInsert, DungeonFeatureUpdate } from "@/types/dungeonFeature.types";
import { DUNGEON_FEATURE_TEMPLATES } from "@/data/dungeonFeatureTemplates";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";

const QUERY_KEY = "dungeon-features";

async function fetchDungeonFeatures(): Promise<DungeonFeature[]> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as DungeonFeature[];
}

async function fetchDungeonFeature(id: string): Promise<DungeonFeature | null> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as DungeonFeature | null;
}

async function createDungeonFeature(feature: DungeonFeatureInsert): Promise<DungeonFeature> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("dungeon_features")
    .insert({ ...feature, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as DungeonFeature;
}

async function updateDungeonFeature(id: string, update: DungeonFeatureUpdate): Promise<DungeonFeature> {
  const { data, error } = await supabase
    .from("dungeon_features")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DungeonFeature;
}

async function deleteDungeonFeature(id: string): Promise<void> {
  const { error } = await supabase.from("dungeon_features").delete().eq("id", id);
  if (error) throw error;
}

export function useDungeonFeatures() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDungeonFeatures });
}

export function useDungeonFeature(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchDungeonFeature(resolved.value),
    enabled: () => !!resolved.value,
  });
}

export function useCreateDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDungeonFeature,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: DungeonFeatureUpdate }) =>
      updateDungeonFeature(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteDungeonFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDungeonFeature,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Bulk-insert template features that don't already exist (matched by name). Returns inserted count. */
export function usePopulateDungeonFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: fetchError } = await supabase
        .from("dungeon_features")
        .select("name");
      if (fetchError) throw fetchError;

      const existingNames = new Set(
        (existing ?? []).map((f: { name: string }) => f.name.toLowerCase()),
      );

      const toInsert = DUNGEON_FEATURE_TEMPLATES
        .filter((f) => !existingNames.has(f.name.toLowerCase()))
        .map((f) => ({ ...f, user_id: user.id, image_url: null, image_focal_point: null }));

      if (!toInsert.length) return 0;

      const { error } = await supabase.from("dungeon_features").insert(toInsert);
      if (error) throw error;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
