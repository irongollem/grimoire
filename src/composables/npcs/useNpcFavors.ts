import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { NpcFavor, NpcFavorInsert } from "@/types/quest.types";

const QUERY_KEY = "npc_favors";

function asRef(value: string | Ref<string>): Ref<string> {
  return isRef(value) ? value : ref(value);
}

async function fetchNpcFavors(npcId: string): Promise<NpcFavor[]> {
  const { data, error } = await supabase
    .from("npc_favors")
    .select("*")
    .eq("npc_id", npcId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NpcFavor[];
}

/** What an NPC owes the party (#853), oldest first — the NPC sheet's own
 *  favours panel. Unsettled and settled rows both come back; the panel
 *  decides how to show the difference (`settled_at`), since a settled favour
 *  is still part of the NPC's history. */
export function useNpcFavors(npcId: string | Ref<string>) {
  const id = asRef(npcId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchNpcFavors(id.value),
    enabled: () => !!id.value,
  });
}

export async function createNpcFavor(favor: NpcFavorInsert): Promise<NpcFavor> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("npc_favors")
    .insert({ ...favor, created_by: favor.created_by ?? user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as NpcFavor;
}

export function useCreateNpcFavor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNpcFavor,
    onSuccess: (_favor, input) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.npc_id] });
    },
  });
}

/** Marks a favor repaid. Settled, never deleted — the row is the record that
 *  it happened, the same way a completed objective is never un-completed by
 *  removing its row. */
export async function settleNpcFavor(id: string): Promise<NpcFavor> {
  const { data, error } = await supabase
    .from("npc_favors")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as NpcFavor;
}

export function useSettleNpcFavor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; npcId: string }) => settleNpcFavor(input.id),
    onSuccess: (_favor, input) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.npcId] });
    },
  });
}

/** For a favor entered by mistake — the DM's own correction, not how a repaid
 *  one is closed out (that is {@link settleNpcFavor}). */
export async function deleteNpcFavor(id: string): Promise<void> {
  const { error } = await supabase.from("npc_favors").delete().eq("id", id);
  if (error) throw error;
}

export function useDeleteNpcFavor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; npcId: string }) => deleteNpcFavor(input.id),
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.npcId] });
    },
  });
}
