import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Encounter, EncounterInsert, EncounterUpdate } from "@/types/encounter.types";
import type { Ref } from "vue";
import { isRef } from "vue";

const QUERY_KEY = "encounters";

async function fetchEncounters(): Promise<Encounter[]> {
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Encounter[];
}

async function fetchEncounter(id: string): Promise<Encounter> {
  const { data, error } = await supabase.from("encounters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Encounter;
}

async function createEncounter(encounter: EncounterInsert): Promise<Encounter> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("encounters")
    .insert({ ...encounter, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Encounter;
}

async function updateEncounter(id: string, update: EncounterUpdate): Promise<Encounter> {
  const { data, error } = await supabase
    .from("encounters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Encounter;
}

async function deleteEncounter(id: string): Promise<void> {
  const { error } = await supabase.from("encounters").delete().eq("id", id);
  if (error) throw error;
}

export function useEncounters() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchEncounters });
}

export function useEncounter(id: string | Ref<string>) {
  const resolvedId = isRef(id) ? id : { value: id };
  return useQuery({
    queryKey: [QUERY_KEY, resolvedId],
    queryFn: () => fetchEncounter(isRef(id) ? id.value : id),
    enabled: () => !!(isRef(id) ? id.value : id),
  });
}

export function useCreateEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEncounter,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: EncounterUpdate }) =>
      updateEncounter(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEncounter,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
