import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { CustomClass, CustomClassInsert, CustomClassUpdate, SystemClass } from "@/levelup/customTypes";
import { fetchOpen5eBaseClasses, baseClassToInsert } from "@/lib/open5eClassImport";
import { ensureClassFeatures, collectFeatureNames } from "@/lib/classFeatureSync";
import { useRuleset } from "@/composables/useRuleset";

const QUERY_KEY = "custom_classes";

async function fetchAll(): Promise<CustomClass[]> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .order("class_name", { ascending: true });
  if (error) throw error;
  return data as CustomClass[];
}

async function fetchOne(id: string): Promise<CustomClass> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function fetchByName(className: string): Promise<CustomClass | null> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .eq("class_name", className)
    .maybeSingle();
  if (error) throw error;
  return data as CustomClass | null;
}

async function createCustomClass(input: CustomClassInsert): Promise<CustomClass> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("custom_classes")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function updateCustomClass(id: string, update: CustomClassUpdate): Promise<CustomClass> {
  const { data, error } = await supabase
    .from("custom_classes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function deleteCustomClass(id: string): Promise<void> {
  const { error } = await supabase.from("custom_classes").delete().eq("id", id);
  if (error) throw error;
}

export function useAllCustomClasses() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchAll, staleTime: Infinity });
}

export function useCustomClass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
    enabled: () => !!id.value,
  });
}

export function useCustomClassByName(className: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-name", className.value]),
    queryFn: () => fetchByName(className.value),
    enabled: () => !!className.value,
    staleTime: Infinity,
  });
}

export function useCreateCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CustomClassUpdate }) =>
      updateCustomClass(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useAllSystemClasses() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => ["system_classes", ruleset.value]),
    queryFn: async (): Promise<SystemClass[]> => {
      const { data, error } = await supabase
        .from("system_classes")
        .select("*")
        .eq("ruleset", ruleset.value)
        .order("class_name", { ascending: true });
      if (error) throw error;
      return data as SystemClass[];
    },
    staleTime: Infinity,
  });
}

export interface ClassImportResult { inserted: number; updated: number }

export function useImportOpen5eClasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ClassImportResult> => {
      const user = getCurrentUser();

      // Load Open5e base classes and existing system class names in parallel
      const [previews, systemResult, existingResult] = await Promise.all([
        fetchOpen5eBaseClasses(),
        supabase.from("system_classes").select("class_name"),
        supabase.from("custom_classes").select("id, class_name").eq("user_id", user!.id),
      ]);

      // Filter out any class whose name matches an existing system class
      const systemNames = new Set((systemResult.data ?? []).map(r => r.class_name));
      const filtered = previews.filter(p => !systemNames.has(p.name));

      // Clean up any previously imported custom_classes that duplicate system classes
      const staleIds = (existingResult.data ?? [])
        .filter(r => systemNames.has(r.class_name))
        .map(r => r.id);
      if (staleIds.length > 0) {
        await supabase.from("custom_classes").delete().in("id", staleIds);
      }

      // Ensure all referenced class features exist in class_features table
      const featureNameToId = await ensureClassFeatures(collectFeatureNames(filtered));

      function resolveFeatures(p: typeof filtered[number]): Record<string, string[]> {
        const features: Record<string, string[]> = {};
        for (const [level, names] of Object.entries(p.featureNamesByLevel)) {
          const uuids = names
            .map(n => featureNameToId.get(n.toLowerCase()))
            .filter((id): id is string => !!id);
          if (uuids.length) features[level] = uuids;
        }
        return features;
      }

      const existingMap = new Map((existingResult.data ?? []).map(r => [r.class_name, r.id]));
      const toInsert = filtered.filter(p => !existingMap.has(p.name));
      const toUpdate = filtered.filter(p => existingMap.has(p.name));

      if (toInsert.length > 0) {
        const rows = toInsert.map(p => ({ ...baseClassToInsert(p), features: resolveFeatures(p), user_id: user!.id }));
        const { error } = await supabase.from("custom_classes").insert(rows);
        if (error) throw error;
      }

      for (const p of toUpdate) {
        const id = existingMap.get(p.name)!;
        const { error } = await supabase
          .from("custom_classes")
          .update({ features: resolveFeatures(p), saving_throws: p.savingThrows })
          .eq("id", id);
        if (error) throw error;
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Reactive lookup: returns the custom class (user-defined) or system class (SRD)
 * matching the given class name, or null if not found.
 * Custom classes take priority over system classes so user overrides win.
 */
export function useClassByName(className: Ref<string>) {
  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  return computed(() => {
    const name = className.value;
    if (!name) return null;
    return (customClasses.value ?? []).find(c => c.class_name === name)
      ?? (systemClasses.value ?? []).find(c => c.class_name === name)
      ?? null;
  });
}

export function useDeleteCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomClass,
    onSuccess: (_data, id) => {
      // Remove the detail entry immediately so the still-mounted editor doesn't
      // re-fetch a now-deleted row (causing 406s). Invalidate only the list.
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEY, "by-name"] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
