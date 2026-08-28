import { computed, ref, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { QUEST_RUNTIME_QUERY_KEYS } from "@/composables/quests/useQuestFlow";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import type { CampaignSessionState, CampaignSessionEnded } from "@/types/session.types";

/**
 * The campaign's live session: started, running, ended.
 *
 * Module-level singleton, like `useRunningEncounters` — every surface that
 * shows session state (the chrome control, the live rail, the quest cockpit's
 * default surface) reads one row and one subscription, not one each.
 *
 * The row is the authority; `useUiStore().sessionRunning` is only its mirror,
 * so `ui.dmMode` stays the cheap synchronous read the five existing consumers
 * already use. Nothing else may write that mirror — see the store.
 */
let refCount = 0;
let stopWatcher: (() => void) | null = null;

const session = ref<CampaignSessionState | null>(null);
const loaded = ref(false);
const pending = ref(false);

/** How long a session may run before the app stops believing in it. Six hours
 *  is past a long evening and well short of "the DM closed the laptop on
 *  Thursday": the failure this catches is a session nobody ended, which then
 *  keeps broadcasting reveals at players who are not at the table. */
export const STALE_SESSION_HOURS = 6;

/**
 * Take a row as the truth. Exported because the campaign realtime channel
 * carries this table's events — see `useCampaignLiveSync`, which owns one
 * subscription for every campaign-scoped table rather than one each.
 */
export function adoptCampaignSession(row: CampaignSessionState | null) {
  adopt(row);
}

function adopt(row: CampaignSessionState | null) {
  session.value = row;
  loaded.value = true;
  useUiStore().sessionRunning = row?.is_running === true;
}

export async function refetchCampaignSession(campaignId: string) {
  return fetchSession(campaignId);
}

async function fetchSession(campaignId: string) {
  if (!campaignId) return adopt(null);
  const { data, error } = await supabase
    .from("campaign_session_state")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  // A campaign switch can complete before its own request returns. Never let a
  // stale response describe the campaign the DM is now looking at.
  if (useCampaignStore().activeCampaignId !== campaignId) return;
  if (error) {
    console.error("Failed to load the campaign session", error);
    return adopt(null);
  }
  adopt((data as CampaignSessionState | null) ?? null);
}

export function useCampaignSession() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();

  // No channel of its own: `campaign_session_state` rides the one campaign
  // subscription in `useCampaignLiveSync`, the way every other campaign-scoped
  // table does. This composable owns the first read and the commands; the
  // channel keeps the row fresh.
  refCount++;
  if (refCount === 1) {
    stopWatcher = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        adopt(null);
        loaded.value = false;
        if (campaignId) void fetchSession(campaignId);
      },
      { immediate: true },
    );
  }

  onUnmounted(() => {
    refCount--;
    if (refCount === 0) {
      stopWatcher?.();
      stopWatcher = null;
    }
  });

  async function start(): Promise<void> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId || pending.value) return;
    // Re-starting an already-running session preserves its `started_at`, so it
    // is a no-op the DM cannot see — and announcing it again would tell the
    // table the session began twice.
    const wasRunning = session.value?.is_running === true
      && session.value.campaign_id === campaignId;
    pending.value = true;
    try {
      const { data, error } = await supabase.rpc("start_campaign_session", {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      const row = data as CampaignSessionState;
      const resumed = wasRunning;
      adopt(row);
      if (!resumed) void announceSessionStart(campaignId);
    } finally {
      pending.value = false;
    }
  }

  async function end(): Promise<CampaignSessionEnded> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId || pending.value) return { encounters_ended: 0, chains_paused: 0 };
    pending.value = true;
    try {
      const { data, error } = await supabase.rpc("end_campaign_session", {
        p_campaign_id: campaignId,
      });
      if (error) throw error;
      await fetchSession(campaignId);
      // The RPC paused every open chain inside its own transaction, so every
      // runtime view the client is holding is now stale. `useCampaignLiveQuests`
      // would self-heal on its 5s poll; the cockpit's context would not.
      for (const key of QUEST_RUNTIME_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      return (data as CampaignSessionEnded | null) ?? { encounters_ended: 0, chains_paused: 0 };
    } finally {
      pending.value = false;
    }
  }

  return {
    session,
    loaded,
    pending,
    isRunning: computed(() => session.value?.is_running === true),
    startedAt: computed(() => session.value?.started_at ?? null),
    start,
    end,
  };
}

/**
 * Tell the table the session has begun.
 *
 * The announcement lands where the consequence lands: from this point every NPC
 * the DM reveals posts itself into this same chat, so the one message that
 * explains the rest of the evening sits directly above them. It is also the
 * strongest confirmation the DM gets that broadcasting is on — stronger than
 * any indicator in their own chrome, because it is visible to the people it
 * affects.
 *
 * Never allowed to fail the start. A session that began without its
 * announcement is a session; a start that failed because chat was unreachable
 * is a DM standing at a table that will not begin.
 */
async function announceSessionStart(campaignId: string): Promise<void> {
  try {
    await sendCampaignAnnouncement(campaignId, "⚔️ The session begins.");
  } catch (cause) {
    console.error("The session started but could not be announced", cause);
  }
}

/**
 * Make sure a session is running, and say whether this call is what started it.
 *
 * A DM who hits **Run** on an encounter is unambiguously at the table, so
 * requiring them to have started a session first would be pure bookkeeping —
 * exactly the kind that makes people resent a modal app. Going live starts the
 * session instead, and the caller reports it rather than letting the change
 * happen silently.
 *
 * Deliberately a plain function, not part of `useCampaignSession()`: callers
 * are inside an event handler, not a component setup, and must not take out a
 * subscription they never release.
 */
export async function ensureCampaignSession(
  campaignId: string,
): Promise<{ id: string | null; started: boolean }> {
  if (session.value?.is_running && session.value.campaign_id === campaignId) {
    return { id: session.value.id, started: false };
  }
  const { data, error } = await supabase.rpc("start_campaign_session", {
    p_campaign_id: campaignId,
  });
  if (error) {
    // Never fail the thing the DM actually asked for. Combat going live matters
    // more than the session bookkeeping around it; the session can be started
    // from the chrome afterwards.
    console.error("Failed to start the campaign session", error);
    return { id: null, started: false };
  }
  const row = data as CampaignSessionState;
  adopt(row);
  // Going live on an encounter starts the session, so the table hears about it
  // the same way it would have from the chrome control.
  void announceSessionStart(campaignId);
  return { id: row.id, started: true };
}

/**
 * Whether a running session has been running longer than anyone plays.
 *
 * Deliberately a pure function of the row and a clock rather than a timer: the
 * question is only ever asked on load and when the rail re-renders, and a
 * `setInterval` that fires at 3am to ask "still playing?" is worse than not
 * asking at all.
 */
export function isSessionStale(
  row: CampaignSessionState | null,
  now: number = Date.now(),
): boolean {
  if (!row?.is_running || !row.started_at) return false;
  const started = Date.parse(row.started_at);
  if (Number.isNaN(started)) return false;
  return now - started > STALE_SESSION_HOURS * 60 * 60 * 1000;
}

/**
 * Elapsed time as a table reads it: `1:47`, or `12:03` once it has been going
 * long enough to matter. Minutes are zero-padded, hours are not — this is a
 * duration, not a wall clock.
 */
export function formatSessionElapsed(
  startedAt: string | null,
  now: number = Date.now(),
): string {
  if (!startedAt) return "";
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return "";
  const minutes = Math.max(0, Math.floor((now - started) / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * What a player is allowed to know: whether the table is sitting, and since
 * when. Read through `get_player_session_state`, which hands back strictly less
 * than the row — the DM-only policy on `campaign_session_state` is unchanged.
 *
 * Polled rather than subscribed. The campaign realtime channel carries this
 * table's events, but only for readers RLS lets through, and a player is not
 * one — so a subscription would deliver nothing. A session begins and ends
 * roughly twice an evening, so a slow poll is the honest shape.
 */
export function usePlayerSessionState(campaignId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["player-session-state", toValue(campaignId)]),
    queryFn: async (): Promise<{ isRunning: boolean; startedAt: string | null }> => {
      const { data, error } = await supabase.rpc("get_player_session_state", {
        p_campaign_id: toValue(campaignId),
      });
      if (error) throw error;
      const row = (data as { is_running: boolean; started_at: string | null }[] | null)?.[0];
      return { isRunning: row?.is_running === true, startedAt: row?.started_at ?? null };
    },
    enabled: () => !!toValue(campaignId),
    refetchInterval: 60_000,
  });
}
