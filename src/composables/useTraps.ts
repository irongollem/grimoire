import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Trap, TrapInsert, TrapUpdate } from "@/types/trap.types";
import { deleteByPublicUrl } from "@/lib/storage";
import { TRAP_TEMPLATES } from "@/data/trapTemplates";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";

const QUERY_KEY = "traps";

async function fetchTraps(): Promise<Trap[]> {
  const { data, error } = await supabase
    .from("traps")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Trap[];
}

async function fetchTrap(id: string): Promise<Trap | null> {
  const { data, error } = await supabase.from("traps").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Trap | null;
}

async function createTrap(trap: TrapInsert): Promise<Trap> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("traps")
    .insert({ ...trap, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Trap;
}

async function updateTrap(id: string, update: TrapUpdate): Promise<Trap> {
  const { data, error } = await supabase.from("traps").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as Trap;
}

async function deleteTrap(trap: Trap): Promise<void> {
  const { error } = await supabase.from("traps").delete().eq("id", trap.id);
  if (error) throw error;
  await deleteByPublicUrl(trap.image_url);
}

export function useTraps() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchTraps });
}

export function useTrap(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchTrap(resolved.value),
    enabled: () => !!resolved.value,
  });
}

export function useCreateTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTrap,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: TrapUpdate }) => updateTrap(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteTrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTrap,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Bulk-insert template traps that don't already exist (matched by name). Returns inserted count. */
export function usePopulateTraps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: fetchError } = await supabase
        .from("traps")
        .select("id, name");
      if (fetchError) throw fetchError;

      const existingByName = new Map(
        (existing ?? []).map((t: { id: string; name: string }) => [t.name.toLowerCase(), t.id]),
      );

      const toInsert = TRAP_TEMPLATES
        .filter((t) => !existingByName.has(t.name.toLowerCase()))
        .map((t) => ({ ...t, user_id: user.id, image_url: null, image_focal_point: null }));

      const toUpdate = TRAP_TEMPLATES
        .filter((t) => existingByName.has(t.name.toLowerCase()))
        .map((t) => ({ id: existingByName.get(t.name.toLowerCase())!, damage_entries: t.damage_entries }));

      const results = await Promise.all([
        toInsert.length
          ? supabase.from("traps").insert(toInsert)
          : Promise.resolve({ error: null }),
        ...toUpdate.map(({ id, damage_entries }) =>
          supabase.from("traps").update({ damage_entries }).eq("id", id),
        ),
      ]);

      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
