import { computed, ref, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { QUEST_RUNTIME_QUERY_KEYS } from "@/composables/quests/useQuestFlow";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import type { CampaignSession, CampaignSessionEnded, PlayerSessionState } from "@/types/session.types";

/**
 * The campaign's live session: started, running, ended.
 *
 * Module-level singleton, like `useRunningEncounters` — every surface that
 * shows session state (the chrome control, the live rail, the quest cockpit's
 * default surface) reads one row and one subscription, not one each.
 *
 * The live session is the one open row of the `campaign_sessions` log (started,
 * not ended). The row is the authority; `useUiStore().sessionRunning` is only its mirror,
 * so `ui.dmMode` stays the cheap synchronous read the five existing consumers
 * already use. Nothing else may write that mirror — see the store.
 */
let refCount = 0;
let stopWatcher: (() => void) | null = null;

const session = ref<CampaignSession | null>(null);
const loaded = ref(false);
const pending = ref(false);

/** How long a session may run before the app stops believing in it. Six hours
 *  is past a long evening and well short of "the DM closed the laptop on
 *  Thursday": the failure this catches is a session nobody ended, which then
 *  keeps broadcasting reveals at players who are not at the table. */
export const STALE_SESSION_HOURS = 6;

/** Running means started and not yet ended. */
function isOpen(row: CampaignSession | null): boolean {
  return !!row && row.started_at !== null && row.ended_at === null;
}

/**
 * Take a row from the log as the truth about the live session. Only an open row
 * can be the live session; a row that closes the adopted one clears it, and any
 * other row (an edit to a past session) leaves the live session alone.
 */
export function adoptLoggedSession(row: CampaignSession): void {
  if (isOpen(row)) adopt(row);
  else if (session.value?.id === row.id) adopt(null);
}

function adopt(row: CampaignSession | null) {
  const open = row && isOpen(row) ? row : null;
  session.value = open;
  loaded.value = true;
  useUiStore().sessionRunning = open !== null;
}

/** The open session was deleted from the log. */
export function dropLoggedSession(id: string): void {
  if (session.value?.id === id) adopt(null);
}

export async function refetchCampaignSession(campaignId: string) {
  return fetchSession(campaignId);
}

async function fetchSession(campaignId: string) {
  if (!campaignId) return adopt(null);
  const { data, error } = await supabase
    .from("campaign_sessions")
    .select("*")
    .eq("campaign_id", campaignId)
    .not("started_at", "is", null)
    .is("ended_at", null)
    .maybeSingle();
  // A campaign switch can complete before its own request returns. Never let a
  // stale response describe the campaign the DM is now looking at.
  if (useCampaignStore().activeCampaignId !== campaignId) return;
  if (error) {
    console.error("Failed to load the campaign session", error);
    return adopt(null);
  }
  adopt((data as CampaignSession | null) ?? null);
}

export interface StartSessionOptions {
  number?: number | null;
  title?: string | null;
  /** The scheduled session whose title prefilled the dialog. */
  proposalId?: string | null;
}

export function useCampaignSession() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();

  // No channel of its own: `campaign_sessions` rides the one campaign
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

  async function start(options: StartSessionOptions = {}): Promise<void> {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId || pending.value) return;
    // The RPC hands back the open session unchanged when one is open, so a
    // second start is a no-op the DM cannot see. Announcing it again would tell
    // the table the session began twice: announce only when the id is new.
    const previousId = session.value?.campaign_id === campaignId ? session.value.id : null;
    pending.value = true;
    try {
      const { data, error } = await supabase.rpc("start_campaign_session", {
        p_campaign_id: campaignId,
        p_number: options.number ?? null,
        p_title: options.title?.trim() || null,
        p_proposal_id: options.proposalId ?? null,
      });
      if (error) throw error;
      const row = data as CampaignSession;
      adopt(row);
      void queryClient.invalidateQueries({ queryKey: ["campaign-sessions"] });
      if (row.id !== previousId) void announceSessionStart(campaignId);
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
      void queryClient.invalidateQueries({ queryKey: ["campaign-sessions"] });
      // The RPC paused every open chain inside its own transaction, so every
      // runtime view the client is holding is now stale. Live sync will say so
      // too, but this device should not wait on the round trip to learn what it
      // just did.
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
    isRunning: computed(() => isOpen(session.value)),
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
  if (session.value && isOpen(session.value) && session.value.campaign_id === campaignId) {
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
  const row = data as CampaignSession;
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
  row: CampaignSession | null,
  now: number = Date.now(),
): boolean {
  if (!row || !isOpen(row) || !row.started_at) return false;
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
 * What a player is allowed to know: whether the table is sitting, since when,
 * and which session it is. Read through `get_player_session_state`, which hands
 * back strictly less than the row (the DM-only policy on `campaign_sessions` is
 * unchanged), and zero rows when no session is open.
 *
 * Refreshed by the `campaign_sync` doorbell, not by this table's row events:
 * the channel carries those only for readers RLS lets through, and a player is
 * not one. The doorbell names the table without the row, so a start or end
 * reaches players as it happens rather than on a poll.
 */
export function usePlayerSessionState(campaignId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => ["player-session-state", toValue(campaignId)]),
    queryFn: async (): Promise<{
      isRunning: boolean;
      startedAt: string | null;
      sessionId: string | null;
      number: number | null;
      title: string | null;
    }> => {
      const id = toValue(campaignId);
      if (!id) throw new Error("usePlayerSessionState fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_session_state", {
        p_campaign_id: id,
      });
      if (error) throw error;
      const row = (data as PlayerSessionState[] | null)?.[0];
      return {
        isRunning: row?.is_running === true,
        startedAt: row?.started_at ?? null,
        sessionId: row?.session_id ?? null,
        number: row?.number ?? null,
        title: row?.title ?? null,
      };
    },
    enabled: () => !!toValue(campaignId),
  });
}
