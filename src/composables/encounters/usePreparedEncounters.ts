import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface PreparedEncounter {
  id: string;
  name: string;
}

/**
 * The encounters set up in one room that nobody has run yet (epic #1133): not finished, and with no `encounter_state`
 * row, which is what starting one writes. The explore screen offers them when the party walks in.
 *
 * Its own key root, `prepared-encounters`, which the `encounters` and `encounter_state` signals both ring.
 */
export function usePreparedEncounters(campaignId: MaybeRefOrGetter<string | null>, roomId: MaybeRefOrGetter<string | null>) {
  const query = useQuery({
    queryKey: computed(() => ["prepared-encounters", toValue(campaignId), toValue(roomId)] as const),
    queryFn: async ({ queryKey: [, cid, rid] }): Promise<PreparedEncounter[]> => {
      if (!cid || !rid) throw new Error("usePreparedEncounters read without a campaign and room; enabled guarantees both");
      const { data: encounters, error } = await supabase
        .from("encounters")
        .select("id, name")
        .eq("campaign_id", cid)
        .eq("location_id", rid)
        .eq("is_finished", false)
        .order("name", { ascending: true });
      if (error) throw error;
      if (encounters.length === 0) return [];
      const { data: states, error: stateError } = await supabase
        .from("encounter_state")
        .select("encounter_id")
        .eq("campaign_id", cid)
        .in("encounter_id", encounters.map((e) => e.id));
      if (stateError) throw stateError;
      const run = new Set(states.map((s) => s.encounter_id));
      return encounters.filter((e) => !run.has(e.id)).map((e) => ({ id: e.id, name: e.name }));
    },
    enabled: () => !!toValue(campaignId) && !!toValue(roomId),
  });
  return { prepared: computed(() => (query.data.value ? query.data.value : [])), isLoading: query.isLoading };
}
