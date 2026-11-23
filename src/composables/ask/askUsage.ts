/** Ask Grimoire (#1253): how many of today's free questions the caller has left. */
import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { FREE_ASKS_PER_DAY } from "@edge-shared/agent/askContract";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export interface AskUsageRow {
  day: string;
  free_used: number;
}

/** Free questions left today (UTC). A row from an earlier day counts for nothing: the day rolled over. */
export function freeAsksLeft(row: AskUsageRow | null, now: Date = new Date()): number {
  if (row === null || row.day !== now.toISOString().slice(0, 10)) return FREE_ASKS_PER_DAY;
  return Math.max(0, FREE_ASKS_PER_DAY - row.free_used);
}

export function useAskUsage(): { freeLeft: ComputedRef<number | null>; refetch: () => void } {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const { data, refetch } = useQuery({
    queryKey: computed(() => ["ask-usage", userId.value]),
    enabled: computed(() => userId.value !== null),
    queryFn: async (): Promise<AskUsageRow | null> => {
      // Scoped to the caller in the query: RLS is a ceiling, not a filter.
      const id = userId.value;
      if (id === null) throw new Error("Not signed in.");
      const { data: row, error } = await supabase.from("ask_usage").select("day, free_used").eq("user_id", id).maybeSingle();
      if (error) throw error;
      return row as AskUsageRow | null;
    },
  });
  // `undefined` is "not read yet": no number is better than a wrong one.
  const freeLeft = computed(() => (data.value === undefined ? null : freeAsksLeft(data.value)));
  return { freeLeft, refetch: () => void refetch() };
}
