import { ref, computed, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useCampaignStore } from "@/stores/campaign";
import { ensureCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

// ── Module-level singleton for running encounters ──────────────────────────────
let stopRunRings: (() => void) | null = null;
let runRefCount = 0;
let stopRunWatcher: (() => void) | null = null;
const runningStates = ref<EncounterState[]>([]);
const runningLoaded = ref(false);

export function useRunningEncounters() {
  const campaign = useCampaignStore();

  async function fetchRunning(campaignId: string) {
    if (!campaignId) { runningStates.value = []; return; }
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_running", true);
    if (campaign.activeCampaignId === campaignId) {
      runningStates.value = (data ?? []) as EncounterState[];
      runningLoaded.value = true;
    }
  }

  // The doorbell says an encounter_state row changed, never which; re-read the
  // running rows. Not skipped for this tab's own rings: going live and ending a
  // fight write the row but nothing here patches `runningStates` from the
  // response, so the ring is the only thing that tells this list. Rings arrive in
  // bursts (every HP tick pushes), so one read runs at a time and a ring that
  // lands meanwhile schedules exactly one more.
  function subscribe(campaignId: string) {
    stopRunRings?.();
    let reading = false;
    let again = false;
    const reread = async () => {
      if (reading) { again = true; return; }
      reading = true;
      try {
        do {
          again = false;
          await fetchRunning(campaignId);
        } while (again && campaign.activeCampaignId === campaignId);
      } finally {
        reading = false;
      }
    };
    void reread();
    const offRing = onCampaignRing(["encounter_state"], (ring) => {
      if (ring.campaignId === campaignId && campaign.activeCampaignId === campaignId) void reread();
    });
    const offReconcile = onCampaignReconcile((id) => {
      if (id === campaignId) void reread();
    });
    stopRunRings = () => { offRing(); offReconcile(); };
  }

  runRefCount++;
  if (runRefCount === 1) {
    stopRunWatcher = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        stopRunRings?.();
        stopRunRings = null;
        runningStates.value = [];
        runningLoaded.value = false;
        if (campaignId) subscribe(campaignId);
      },
      { immediate: true },
    );
  }

  onUnmounted(() => {
    runRefCount--;
    if (runRefCount === 0) {
      stopRunWatcher?.();
      stopRunWatcher = null;
      stopRunRings?.();
      stopRunRings = null;
      runningStates.value = [];
    }
  });

  return {
    runningStates,
    runningLoaded,
    isEncounterRunning: (id: string) => runningStates.value.some((s) => s.encounter_id === id),
    anyRunning: computed(() => runningStates.value.length > 0),
    firstRunning: computed(() => runningStates.value[0] ?? null),
  };
}

// ── Shared live state (module-level so player + DM composable share it) ───────
// Exported so PlayerLayout can keep the subscription alive and PlayerEncounterView
// can read the same reactive ref without needing its own subscription.
export const liveState = ref<EncounterState | null>(null);
const liveStateLoaded = ref(false);
let stopPlayerRings: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

// ── DM composable ──────────────────────────────────────────────────────────────
// `string | null` rather than `string`, deliberately: an encounter being
// created has no id yet, and the previous signature forced the caller to lie
// about that with `?? ""` — which is how an empty UUID reached PostgREST and
// came back 400 (#833). Absence is a real state here, so the type says so.
export function useEncounterLive(encounterId: MaybeRefOrGetter<string | null>) {
  const campaign = useCampaignStore();

  const isLive = computed(() => liveState.value?.encounter_id === toValue(encounterId) && liveState.value?.is_running === true);

  async function goLive(state: {
    round: number;
    activeIndex: number;
    combatants: RunCombatant[];
  }): Promise<{ startedSession: boolean }> {
    if (!campaign.activeCampaignId) return { startedSession: false };
    const user = getCurrentUser();
    // Combat runs *inside* a session, so going live starts one if the DM has
    // not (unnumbered; the DM can number it from the log). `session_id` is that
    // `campaign_sessions` row, which is what makes "what did we play on
    // Thursday" answerable from one column. See #758.
    const session = await ensureCampaignSession(campaign.activeCampaignId);
    const payload = {
      encounter_id: toValue(encounterId),
      campaign_id: campaign.activeCampaignId,
      user_id: user!.id,
      session_id: session.id,
      is_running: true,
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      combatants_live: state.combatants,
      events_fired: [],
      started_at: new Date().toISOString(),
      // Upsert on `encounter_id` means a second go-live of the same encounter
      // (a new fight after a previous one ended) would otherwise inherit the
      // last fight's mask — nothing clears `fog_mask` on end, since it also
      // feeds the "explored" sync read on end-combat. Null it here instead,
      // on the row's own onConflict update, so the battle-map view's own seed
      // check (`shouldSeedFog`, fogMask.ts) reliably fires exactly once per
      // go-live rather than once per encounter ever.
      fog_mask: null,
    };
    const { data, error } = await supabase
      .from("encounter_state")
      .upsert(payload, { onConflict: "encounter_id" })
      .select()
      .single();
    if (error) throw error;
    // Enforce one live encounter per campaign: stop any other running rows so the
    // player's single-live-row view can't flip-flop between two encounters.
    await supabase
      .from("encounter_state")
      .update({ is_running: false })
      .eq("campaign_id", campaign.activeCampaignId)
      .eq("is_running", true)
      .neq("encounter_id", toValue(encounterId));
    liveState.value = data as EncounterState;
    return { startedSession: session.started };
  }

  interface PushableState {
    round: number;
    activeIndex: number;
    combatants: RunCombatant[];
    eventsFired: string[];
    fogMask?: string | null;
  }

  function schedulePush(state: PushableState) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushState(state), 300);
  }

  async function pushState(state: PushableState) {
    if (!liveState.value) return;
    // Token positions are written straight into DB combatants_live by the map
    // windows (players + the DM's separate map window) via update_combatant_position;
    // the main runner store never ingests them, so a full-replace here would revert
    // every token to its seed position on the next HP/turn/condition push. Read the
    // live positions and merge them onto the outgoing combatants (DB position wins)
    // so moves persist across pushes.
    const { data: current } = await supabase
      .from("encounter_state")
      .select("combatants_live")
      .eq("encounter_id", toValue(encounterId))
      .maybeSingle();
    const dbPositions = new Map<string, RunCombatant["position"]>();
    for (const c of (current?.combatants_live as RunCombatant[] | null) ?? []) {
      if (c.position) dbPositions.set(c.instance_id, c.position);
    }
    const mergedCombatants = state.combatants.map((c) =>
      dbPositions.has(c.instance_id) ? { ...c, position: dbPositions.get(c.instance_id) } : c,
    );
    const patch: Record<string, unknown> = {
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      combatants_live: mergedCombatants,
      events_fired: state.eventsFired,
    };
    if (state.fogMask !== undefined) patch.fog_mask = state.fogMask;
    const { error } = await supabase
      .from("encounter_state")
      .update(patch)
      .eq("encounter_id", toValue(encounterId));
    if (error) throw error;
    liveState.value = { ...liveState.value, ...(patch as Partial<EncounterState>) };
  }

  async function endLive() {
    if (!liveState.value) return;
    const { error } = await supabase
      .from("encounter_state")
      .update({ is_running: false })
      .eq("encounter_id", toValue(encounterId));
    if (error) throw error;
    liveState.value = null;
  }

  // Load existing state on mount (in case DM navigated away and back)
  async function loadState() {
    const id = toValue(encounterId);

    // An unsaved encounter has nothing to load. Clearing rather than leaving
    // the previous encounter's state in place matters: this component is reused
    // across route param changes, so a stale `liveState` would otherwise show
    // one encounter as running while a different one is on screen.
    if (!id) {
      liveState.value = null;
      liveStateLoaded.value = true;
      return;
    }

    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("encounter_id", id)
      .maybeSingle();

    // The id may have moved on while this was in flight — switching encounters
    // quickly starts a second load before the first returns, and without this
    // the slower response wins and installs the wrong encounter's state.
    if (toValue(encounterId) !== id) return;

    liveState.value = (data as EncounterState | null) ?? null;
    liveStateLoaded.value = true;
  }

  // Re-run on id changes so a reused component instance (same-route param
  // change) loads the correct encounter's live state instead of the stale one.
  watch(() => toValue(encounterId), () => void loadState(), { immediate: true });

  onUnmounted(() => {
    if (pushTimer) clearTimeout(pushTimer);
  });

  return { isLive, liveState, liveStateLoaded, goLive, schedulePush, endLive };
}


// ── Player composable ──────────────────────────────────────────────────────────
export function usePlayerEncounterLive(campaignId: MaybeRefOrGetter<string | null>) {
  let subscribedCampaignId: string | null = null;

  async function fetchRunning(id = subscribedCampaignId) {
    if (!id) { liveState.value = null; return; }
    const { data, error } = await supabase.rpc("get_player_encounter_state", {
      p_campaign_id: id,
    });
    // A campaign switch can complete before its previous request. Never let
    // that stale response replace the active campaign's live encounter.
    if (id === subscribedCampaignId) {
      if (error) {
        console.error("Failed to load player-safe encounter state", error);
        liveState.value = null;
      } else {
        const rows = (data ?? []) as EncounterState[];
        liveState.value = rows[0] ?? null;
      }
      liveStateLoaded.value = true;
    }
  }

  function subscribe(id: string): void {
    unsubscribe();
    subscribedCampaignId = id;
    liveStateLoaded.value = false;
    void fetchRunning(id);
    // `encounter_state` rings for every change to the row the player's
    // projection (get_player_encounter_state) is built from; the player-updates
    // signal table is written in the same transaction, so by the time the ring
    // lands the projection is current. The ring carries no combatant payload:
    // resolve it through the server-side projection before adopting anything.
    const offRing = onCampaignRing(["encounter_state"], (ring) => {
      if (ring.campaignId === id && subscribedCampaignId === id) void fetchRunning(id);
    });
    const offReconcile = onCampaignReconcile((campaign) => {
      if (campaign === id && subscribedCampaignId === id) void fetchRunning(id);
    });
    stopPlayerRings = () => { offRing(); offReconcile(); };
  }

  function unsubscribe(): void {
    subscribedCampaignId = null;
    stopPlayerRings?.();
    stopPlayerRings = null;
  }

  watch(
    () => toValue(campaignId),
    (id) => {
      if (id) subscribe(id);
      else {
        unsubscribe();
        liveState.value = null;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    unsubscribe();
  });

  return { liveState, liveStateLoaded };
}

/**
 * RLS-safe RPC for players to move their own token on the battle map.
 * The Postgres function `update_combatant_position` validates that the
 * caller's linked party_member_id matches the `instance_id` before writing.
 */
export async function updateOwnCombatantPosition(
  encounterStateId: string,
  instanceId: string,
  position: { x: number; y: number } | null,
): Promise<void> {
  const { error } = await supabase.rpc("update_combatant_position", {
    p_encounter_state_id: encounterStateId,
    p_instance_id: instanceId,
    p_position: position,
  });
  if (error) throw error;
}
