import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  CustomSubclass,
  CustomSubclassInsert,
  CustomSubclassUpdate,
} from "@/levelup/customTypes";
import { fetchOpen5eSubclasses, subclassToInsert } from "@/lib/open5eClassImport";

const QUERY_KEY = "custom_subclasses";

async function fetchAll(): Promise<CustomSubclass[]> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .order("class_name", { ascending: true })
    .order("subclass_name", { ascending: true });
  if (error) throw error;
  return data as CustomSubclass[];
}

async function fetchOne(id: string): Promise<CustomSubclass> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function fetchByClassAndSubclass(
  className: string,
  subclassName: string,
): Promise<CustomSubclass | null> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .eq("class_name", className)
    .eq("subclass_name", subclassName)
    .maybeSingle();
  if (error) throw error;
  return data as CustomSubclass | null;
}

async function createCustomSubclass(input: CustomSubclassInsert): Promise<CustomSubclass> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("custom_subclasses")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function updateCustomSubclass(
  id: string,
  update: CustomSubclassUpdate,
): Promise<CustomSubclass> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function deleteCustomSubclass(id: string): Promise<void> {
  const { error } = await supabase.from("custom_subclasses").delete().eq("id", id);
  if (error) throw error;
}

export function useAllCustomSubclasses() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchAll, staleTime: Infinity });
}

export function useCustomSubclass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
    enabled: () => !!id.value,
  });
}

export function useCustomSubclassByClassAndSubclass(
  className: Ref<string>,
  subclassName: Ref<string>,
) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-class", className.value, subclassName.value]),
    queryFn: () => fetchByClassAndSubclass(className.value, subclassName.value),
    enabled: () => !!className.value && !!subclassName.value,
    staleTime: Infinity,
  });
}

export function useCreateCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomSubclass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CustomSubclassUpdate }) =>
      updateCustomSubclass(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export interface SubclassImportResult { inserted: number; skipped: number }

export function useImportOpen5eSubclasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SubclassImportResult> => {
      const user = getCurrentUser();
      const previews = await fetchOpen5eSubclasses();

      const { data: existing } = await supabase
        .from("custom_subclasses")
        .select("class_name, subclass_name")
        .eq("user_id", user!.id);
      const existingKeys = new Set(
        (existing ?? []).map(r => `${r.class_name}::${r.subclass_name}`),
      );

      const toInsert = previews
        .filter(p => !existingKeys.has(`${p.parentClassName}::${p.name}`))
        .map(p => ({ ...subclassToInsert(p), user_id: user!.id }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("custom_subclasses").insert(toInsert);
        if (error) throw error;
      }

      return { inserted: toInsert.length, skipped: previews.length - toInsert.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomSubclass,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
