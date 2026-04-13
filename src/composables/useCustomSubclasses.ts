import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  CustomSubclass,
  CustomSubclassInsert,
  CustomSubclassUpdate,
} from "@/levelup/customTypes";

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

export function useDeleteCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomSubclass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
