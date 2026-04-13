import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { CustomClass, CustomClassInsert, CustomClassUpdate, SystemClass } from "@/levelup/customTypes";
import { fetchOpen5eBaseClasses, baseClassToInsert } from "@/lib/open5eClassImport";

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
  return useQuery({
    queryKey: ["system_classes"],
    queryFn: async (): Promise<SystemClass[]> => {
      const { data, error } = await supabase
        .from("system_classes")
        .select("*")
        .order("class_name", { ascending: true });
      if (error) throw error;
      return data as SystemClass[];
    },
    staleTime: Infinity,
  });
}

export interface ClassImportResult { inserted: number; skipped: number }

export function useImportOpen5eClasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ClassImportResult> => {
      const user = getCurrentUser();
      const previews = await fetchOpen5eBaseClasses();

      // Load existing names to deduplicate
      const { data: existing } = await supabase
        .from("custom_classes")
        .select("class_name")
        .eq("user_id", user!.id);
      const existingNames = new Set((existing ?? []).map(r => r.class_name));

      const toInsert = previews
        .filter(p => !existingNames.has(p.name))
        .map(p => ({ ...baseClassToInsert(p), user_id: user!.id }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("custom_classes").insert(toInsert);
        if (error) throw error;
      }

      return { inserted: toInsert.length, skipped: previews.length - toInsert.length };
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
