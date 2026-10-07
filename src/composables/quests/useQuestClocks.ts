import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CLOCKS_KEY, OBJECTIVES_KEY, QUEST_RUNTIME_QUERY_KEYS } from "@/lib/campaignLiveSync/registry";
import type { QuestClock, QuestClockInsert, QuestClockUpdate } from "@/types/quest.types";

/**
 * A quest's progress clocks (#1011, `quest_clocks`). DM-only rows; another
 * device's tick arrives through the campaign doorbell (`SIGNAL_KEYS`), never a
 * poll. `filled` is not writable from here: it moves only through
 * `useTickQuestClock` (the `tick_quest_clock` RPC) or a rule, which is what
 * lets a clock that fills fire the rules watching it.
 */

function asRef(value: string | Ref<string>): Ref<string> {
  return isRef(value) ? value : ref(value);
}

export async function fetchQuestClocks(questId: string): Promise<QuestClock[]> {
  const { data, error } = await supabase
    .from("quest_clocks")
    .select("*")
    .eq("quest_id", questId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestClock[];
}

export function useQuestClocks(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [CLOCKS_KEY, id.value] as const),
    queryFn: () => fetchQuestClocks(id.value),
    enabled: computed(() => !!id.value),
  });
}

export function useCreateQuestClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (insert: QuestClockInsert) => {
      const { data, error } = await supabase.from("quest_clocks").insert(insert).select("*").single();
      if (error) throw error;
      return data as QuestClock;
    },
    onSuccess: (clock) => queryClient.invalidateQueries({ queryKey: [CLOCKS_KEY, clock.quest_id] }),
  });
}

export function useUpdateQuestClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, questId, update }: { id: string; questId: string; update: QuestClockUpdate }) => {
      const { error } = await supabase.from("quest_clocks").update(update).eq("id", id).eq("quest_id", questId);
      if (error) throw error;
      return questId;
    },
    onSuccess: (questId) => queryClient.invalidateQueries({ queryKey: [CLOCKS_KEY, questId] }),
  });
}

export function useDeleteQuestClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, questId }: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_clocks").delete().eq("id", id).eq("quest_id", questId);
      if (error) throw error;
      return questId;
    },
    onSuccess: (questId) => queryClient.invalidateQueries({ queryKey: [CLOCKS_KEY, questId] }),
  });
}

/** What `tick_quest_clock` returns. `filled_up` is true only on the tick that
 *  filled the clock, the one that fired its rules. */
export interface QuestClockTickResult {
  changed: boolean;
  filled: number;
  segments: number;
  filled_up: boolean;
  transition_id?: string;
}

/**
 * Tick a clock by `step` (negative to untick). Filling it fires its rules
 * server-side, which can move objectives and anything a world verb touches,
 * so the ledger and every runtime view refresh too.
 */
export function useTickQuestClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clockId, step, reason }: { clockId: string; questId: string; step: number; reason?: string }) => {
      const { data, error } = await supabase.rpc("tick_quest_clock", {
        p_clock_id: clockId,
        p_step: step,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as QuestClockTickResult;
    },
    onSuccess: (result, { questId }) => {
      queryClient.invalidateQueries({ queryKey: [CLOCKS_KEY, questId] });
      if (result.filled_up) {
        queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY] });
        for (const key of QUEST_RUNTIME_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
