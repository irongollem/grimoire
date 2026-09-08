import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { BEATS_KEY, QUEST_RUNTIME_QUERY_KEYS } from "./useQuestFlow";
import type { QuestRuntimeContext, QuestThread } from "@/types/quest.types";

const THREADS_KEY = "quest_threads";

function asRef(value: string | Ref<string>): Ref<string> {
  return isRef(value) ? value : ref(value);
}

/** Every cache a thread open/close touches: its own list, every runtime view
 *  (a new thread is a new cursor; a closed one removes one), and the board
 *  summary, whose `threads[]`/`liveThreadCount` change with either. */
function invalidateThreadCaches(queryClient: ReturnType<typeof useQueryClient>, questId: string) {
  queryClient.invalidateQueries({ queryKey: [THREADS_KEY, questId] });
  for (const key of QUEST_RUNTIME_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board"] });
}

export async function fetchQuestThreads(questId: string, campaignId: string | null): Promise<QuestThread[]> {
  const { data, error } = await supabase
    .from("quest_threads")
    .select("*")
    .eq("quest_id", questId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const threads = (data ?? []) as QuestThread[];
  if (threads.length > 0 || !campaignId) return threads;
  return [await ensureQuestMainThread(campaignId, questId)];
}

/**
 * A quest always has a Main thread — the insert trigger and the backfill in
 * `20260908210321` promise it — but a seeded or imported quest bypasses the
 * trigger (a local `db reset` loads `seed.sql` with triggers off), and the
 * cockpit's "Start run" then had no thread to point at and failed twice over.
 * So the first read of an empty thread list repairs the invariant through the
 * engine's own idempotent call (`20260908210325`) instead of showing a quest
 * the DM cannot start. Every caller of `useQuestThreads` is a DM surface; the
 * RPC re-checks that server-side.
 */
async function ensureQuestMainThread(campaignId: string, questId: string): Promise<QuestThread> {
  const { data, error } = await supabase.rpc("ensure_quest_main_thread", { p_campaign_id: campaignId, p_quest_id: questId });
  if (error) throw error;
  return data as QuestThread;
}

/** Every thread a quest holds, live and closed alike — the thread bar reads
 *  this rather than `QuestRuntimeContext.threads` when it needs closed/merged
 *  threads too. Polls like the runtime queries: a thread can open or merge
 *  from another open tab or another DM device. */
export function useQuestThreads(questId: string | Ref<string>) {
  const id = asRef(questId);
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [THREADS_KEY, id.value]),
    queryFn: () => fetchQuestThreads(id.value, campaign.activeCampaignId),
    enabled: () => !!id.value,
    refetchInterval: 5_000,
  });
}

export interface OpenQuestThreadInput {
  campaignId: string;
  questId: string;
  /** The parallel route's beat — the new thread's cursor starts here. */
  beatId: string;
  label: string;
  reason?: string;
}

export async function openQuestThread(input: OpenQuestThreadInput): Promise<QuestRuntimeContext> {
  const { data, error } = await supabase.rpc("open_quest_thread", {
    p_campaign_id: input.campaignId,
    p_quest_id: input.questId,
    p_beat_id: input.beatId,
    p_label: input.label,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw error;
  return data as QuestRuntimeContext;
}

/** Opens a thread by hand (the thread bar), rather than as a side effect of
 *  taking a `parallel` route — that case is `spawnEdgeIds` on
 *  {@link useQuestRuntimeCommand} instead, since it happens in the same
 *  transaction as the move. */
export function useOpenQuestThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: openQuestThread,
    onSuccess: (_context, input) => invalidateThreadCaches(queryClient, input.questId),
  });
}

export interface CloseQuestThreadInput {
  campaignId: string;
  questId: string;
  threadId: string;
  reason?: string;
}

export async function closeQuestThread(input: CloseQuestThreadInput): Promise<void> {
  const { error } = await supabase.rpc("close_quest_thread", {
    p_campaign_id: input.campaignId,
    p_quest_id: input.questId,
    p_thread_id: input.threadId,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw error;
}

export function useCloseQuestThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: closeQuestThread,
    onSuccess: (_result, input) => invalidateThreadCaches(queryClient, input.questId),
  });
}

export interface FireHeldConsequenceInput {
  eventId: string;
  year: number;
  month: number;
  day: number;
}

/**
 * Fires a payoff the DM held back in the Advance dialog (`QuestHeldPayoff`),
 * from the log rather than from the beat that originally carried it. Shares
 * `perform_quest_consequence` with `useDueConsequences` — the caller supplies
 * today's in-world date the same way that composable reads it off the
 * campaign store, since firing late is still firing "as of today," not as of
 * whenever the payoff was held.
 */
export async function fireHeldConsequence(input: FireHeldConsequenceInput): Promise<void> {
  const { error } = await supabase.rpc("perform_quest_consequence", {
    p_event_id: input.eventId,
    p_year: input.year,
    p_month: input.month,
    p_day: input.day,
  });
  if (error) throw error;
}

export function useFireHeldConsequence() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: string }) => fireHeldConsequence({
      eventId: input.eventId,
      year: campaign.todayYear,
      month: campaign.todayMonth,
      day: campaign.todayDay,
    }),
    onSuccess: () => {
      for (const key of QUEST_RUNTIME_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ queryKey: ["quest_consequence_events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}
