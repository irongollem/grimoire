import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

const QUERY_KEY = "npc-reveals";

/**
 * When each character first met an NPC (`npc_reveals`), keyed by party member.
 * The DM may read every row of their campaign. The rows are written by DB
 * triggers alongside `npcs` / `locations` updates, so `campaignRealtimeWorld`
 * invalidates this root on those events rather than this query polling.
 */
export function useNpcReveals(npcId: Ref<string> | string) {
  const idRef = isRef(npcId) ? npcId : ref(npcId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      const { data, error } = await supabase
        .from("npc_reveals")
        .select("party_member_id,revealed_at")
        .eq("npc_id", id);
      if (error) throw error;
      return new Map(data.map((r) => [r.party_member_id, r.revealed_at] as const));
    },
    enabled: () => !!idRef.value,
  });
}
