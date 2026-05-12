import { ref, computed, onUnmounted } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

// ── Module-level singleton for running encounters ──────────────────────────────
let runChannel: ReturnType<typeof supabase.channel> | null = null;
let runRefCount = 0;
const runningStates = ref<EncounterState[]>([]);
const runningLoaded = ref(false);

export function useRunningEncounters() {
  const campaign = useCampaignStore();

  async function fetchRunning() {
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) { runningStates.value = []; return; }
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_running", true);
    runningStates.value = (data ?? []) as EncounterState[];
    runningLoaded.value = true;
  }

  function subscribe() {
    if (runChannel || !campaign.activeCampaignId) return;
    runChannel = supabase
      .channel(`running_encounters:${campaign.activeCampaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "encounter_state",
          filter: `campaign_id=eq.${campaign.activeCampaignId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { encounter_id?: string }).encounter_id;
            if (id) runningStates.value = runningStates.value.filter(s => s.encounter_id !== id);
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
        })
      .subscribe();
  }

  runRefCount++;
  fetchRunning();
  subscribe();

  onUnmounted(() => {
    runRefCount--;
    if (runRefCount === 0 && runChannel) {
      supabase.removeChannel(runChannel);
      runChannel = null;
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
let playerChannel: ReturnType<typeof supabase.channel> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

// ── DM composable ──────────────────────────────────────────────────────────────
export function useEncounterLive(encounterId: string) {
  const campaign = useCampaignStore();

  const isLive = computed(() => liveState.value?.encounter_id === encounterId && liveState.value?.is_running === true);

  async function goLive(state: {
    round: number;
    activeIndex: number;
    combatants: RunCombatant[];
  }) {
    if (!campaign.activeCampaignId) return;
    const user = getCurrentUser();
    const payload = {
      encounter_id: encounterId,
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
    const patch: Record<string, unknown> = {
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      combatants_live: state.combatants,
      events_fired: state.eventsFired,
    };
    if (state.fogMask !== undefined) patch.fog_mask = state.fogMask;
    const { error } = await supabase
      .from("encounter_state")
      .update(patch)
      .eq("encounter_id", encounterId);
    if (error) throw error;
    liveState.value = { ...liveState.value, ...(patch as Partial<EncounterState>) };
  }

  async function endLive() {
    if (!liveState.value) return;
    const { error } = await supabase
      .from("encounter_state")
      .update({ is_running: false })
      .eq("encounter_id", encounterId);
    if (error) throw error;
    liveState.value = null;
  }

  // Load existing state on mount (in case DM navigated away and back)
  async function loadState() {
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("encounter_id", encounterId)
      .maybeSingle();
    if (data) liveState.value = data as EncounterState;
    liveStateLoaded.value = true;
  }

  loadState();

  onUnmounted(() => {
    if (pushTimer) clearTimeout(pushTimer);
  });

  return { isLive, liveState, liveStateLoaded, goLive, schedulePush, endLive };
}


// ── Player composable ──────────────────────────────────────────────────────────
export function usePlayerEncounterLive(campaignId: string) {
  async function fetchRunning() {
    if (!campaignId) { liveState.value = null; return; }
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_running", true)
      .maybeSingle();
    liveState.value = data ? (data as EncounterState) : null;
  }

  function subscribe() {
    if (playerChannel || !campaignId) return;
    playerChannel = supabase
      .channel(`encounter_state:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "encounter_state",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            liveState.value = null;
          } else {
            const row = payload.new as EncounterState;
            liveState.value = row.is_running ? row : null;
          }
        },
      )
      .subscribe();
  }

  // On tab focus: re-fetch to catch any state changes missed while the
  // WebSocket was idle. The global supabase.realtime.connect() handler
  // (in supabase.ts) will have already reconnected the channel itself.
  function onVisibility() {
    if (document.visibilityState === "visible") void fetchRunning();
  }

  fetchRunning();
  subscribe();
  document.addEventListener("visibilitychange", onVisibility);

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (playerChannel) {
      supabase.removeChannel(playerChannel);
      playerChannel = null;
    }
  });

  return { liveState };
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
