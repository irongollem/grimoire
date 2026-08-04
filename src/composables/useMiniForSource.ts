import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { PlayerVisibleMini, MiniSourceTable } from "@/types/mini.types";

async function fetchMiniForSource(table: MiniSourceTable, id: string): Promise<PlayerVisibleMini | null> {
  const { data, error } = await supabase
    .rpc("get_player_visible_mini", { p_source_table: table, p_source_id: id })
    .maybeSingle();
  if (error) throw error;
  return data as PlayerVisibleMini | null;
}

/**
 * Newest READY mini forged from a given source entity (npc/monster/party
 * member) — powers the player-facing MiniPortraitOverlay reveal.
 *
 * This goes through the `get_player_visible_mini` RPC rather than the `minis`
 * table, because `minis_select` is DM-only: a mini is DM work product, and the
 * campaign-member branch that used to sit in that policy leaked secret NPC and
 * monster sculpts. The RPC re-gates per source type — party members are open to
 * the party, NPCs need a shared portrait and no active disguise, monsters need
 * a discovery — and strips the job/credit columns. All of that lives in the
 * function; this composable does no gating of its own. `null` (no visible ready
 * mini) is a normal, expected result, not an error state.
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
