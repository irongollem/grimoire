import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Mini, MiniSourceTable } from "@/types/mini.types";

async function fetchMiniForSource(table: MiniSourceTable, id: string): Promise<Mini | null> {
  const { data, error } = await supabase
    .from("minis")
    .select("*")
    .eq("source_table", table)
    .eq("source_id", id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Mini | null;
}

/**
 * Newest READY mini forged from a given source entity (npc/monster/party
 * member) — powers the player-facing MiniPortraitOverlay reveal. RLS handles
 * visibility (campaign members can read the row); this composable does no
 * additional gating on top of that. `null` (no ready mini) is a normal,
 * expected result, not an error state.
 */
export function useMiniForSource(table: MiniSourceTable | Ref<MiniSourceTable>, id: string | Ref<string>) {
  const tableRef = isRef(table) ? table : ref(table);
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => ["minis", "for", tableRef.value, idRef.value]),
    queryFn: () => fetchMiniForSource(tableRef.value, idRef.value),
    enabled: () => !!idRef.value,
    staleTime: 60_000,
  });
}
