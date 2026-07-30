import { ref, computed, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/realtimeChannel";
import { useCampaignStore } from "@/stores/campaign";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

// ── Module-level singleton for running encounters ──────────────────────────────
let runRealtime: RealtimeChannelHandle | null = null;
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

  function subscribe(campaignId: string) {
    runRealtime?.stop();
    void fetchRunning(campaignId);
    runRealtime = createRealtimeChannel({
      topic: `running_encounters:${campaignId}`,
      reconcile: () => void fetchRunning(campaignId),
      bind: (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "encounter_state",
          filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          if (campaign.activeCampaignId !== campaignId) return;
          if (payload.eventType === "DELETE") {
            // RLS trims a DELETE payload to the primary key, and Realtime does
            // not apply the channel filter to DELETE events — so `id` is all we
            // get, and it may belong to another campaign. Matching on the
            // primary key is safe either way: a foreign id is simply absent.
            const id = (payload.old as { id?: string }).id;
            if (id) runningStates.value = runningStates.value.filter(s => s.id !== id);
          } else {
            const row = payload.new as EncounterState;
            const idx = runningStates.value.findIndex(s => s.encounter_id === row.encounter_id);
            if (row.is_running) {
              if (idx >= 0) runningStates.value[idx] = row;
              else runningStates.value.push(row);
            } else {
              if (idx >= 0) runningStates.value.splice(idx, 1);
            }
          }
        }),
    });
  }

  runRefCount++;
  if (runRefCount === 1) {
    stopRunWatcher = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        runRealtime?.stop();
        runRealtime = null;
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
      runRealtime?.stop();
      runRealtime = null;
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
let playerRealtime: RealtimeChannelHandle | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

// ── DM composable ──────────────────────────────────────────────────────────────
export function useEncounterLive(encounterId: MaybeRefOrGetter<string>) {
  const campaign = useCampaignStore();

  const isLive = computed(() => liveState.value?.encounter_id === toValue(encounterId) && liveState.value?.is_running === true);

  async function goLive(state: {
    round: number;
    activeIndex: number;
    combatants: RunCombatant[];
  }) {
    if (!campaign.activeCampaignId) return;
    const user = getCurrentUser();
    const payload = {
      encounter_id: toValue(encounterId),
      campaign_id: campaign.activeCampaignId,
      user_id: user!.id,
      is_running: true,
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      combatants_live: state.combatants,
      events_fired: [],
      started_at: new Date().toISOString(),
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
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("encounter_id", toValue(encounterId))
      .maybeSingle();
    if (data) liveState.value = data as EncounterState;
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
export function usePlayerEncounterLive(campaignId: MaybeRefOrGetter<string>) {
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
    playerRealtime = createRealtimeChannel({
      topic: `encounter_state_player_updates:${id}`,
      reconcile: () => void fetchRunning(id),
      bind: (channel) => channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "encounter_state_player_updates",
          filter: `campaign_id=eq.${id}`,
        },
        () => {
          if (subscribedCampaignId !== id) return;
          // The signal row deliberately contains no combatant payload. Resolve
          // every change through the server-side projection before adopting it.
          void fetchRunning(id);
        },
      ),
    });
  }

  function unsubscribe(): void {
    subscribedCampaignId = null;
    playerRealtime?.stop();
    playerRealtime = null;
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
