import { ref, computed, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { createRealtimeHeal, type RealtimeHeal } from "@/lib/realtimeHeal";
import { useCampaignStore } from "@/stores/campaign";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

// ── Module-level singleton for running encounters ──────────────────────────────
let runChannel: ReturnType<typeof supabase.channel> | null = null;
let runHeal: RealtimeHeal | null = null;
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
    // Without this, a DM whose socket dropped kept showing an encounter as
    // running (or missed one starting) until a full reload.
    runHeal = createRealtimeHeal(() => void fetchRunning());
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
      .subscribe((status) => runHeal?.onStatus(status));
  }

  runRefCount++;
  fetchRunning();
  subscribe();

  onUnmounted(() => {
    runRefCount--;
    if (runRefCount === 0 && runChannel) {
      // Detach before removeChannel(): the resulting CLOSED must not land on a
      // handle we are about to discard.
      runHeal?.detach();
      runHeal = null;
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
export function usePlayerEncounterLive(campaignId: string) {
  async function fetchRunning() {
    if (!campaignId) { liveState.value = null; return; }
    // Nothing enforces a single is_running row per campaign, so if a DM starts a
    // second encounter without ending the first, .maybeSingle() would error and
    // blank the player's live view mid-combat. Take the most recently started one
    // instead so a stray second row degrades gracefully.
    const { data } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_running", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    liveState.value = data ? (data as EncounterState) : null;
  }

  // hiddenReconcileMs: 0 keeps the previous "refetch on every return to the tab"
  // behaviour rather than waiting out a background threshold. This is one row,
  // it is live combat, and a player who alt-tabs mid-fight must not come back to
  // a stale board — the 2s throttle is enough to stop wake signals stacking.
  const heal = createRealtimeHeal(() => void fetchRunning(), { hiddenReconcileMs: 0 });

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
          // React to ROW IDENTITY, not just "any change in the campaign". Nothing
          // guarantees a single running encounter, so a second encounter starting
          // (which flips the FIRST one's is_running to false) or a stale row being
          // deleted must NOT blank the encounter we're actually showing.
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<EncounterState>;
            if (!liveState.value || oldRow.encounter_id === liveState.value.encounter_id) {
              void fetchRunning(); // the shown encounter ended — find any other running one
            }
            return;
          }
          const row = payload.new as EncounterState;
          if (row.is_running) {
            // A running encounter's state update — adopt it if it's the one we show,
            // nothing is shown yet, or it started at/after the current one (newest wins).
            if (!liveState.value
              || row.encounter_id === liveState.value.encounter_id
              || (row.started_at ?? "") >= (liveState.value.started_at ?? "")) {
              liveState.value = row;
            }
          } else if (liveState.value && row.encounter_id === liveState.value.encounter_id) {
            void fetchRunning(); // the encounter we show just stopped — fall back to another
          }
          // else: a different, non-running encounter changed — ignore.
        },
      )
      .subscribe((status) => heal.onStatus(status));
  }

  fetchRunning();
  subscribe();

  onUnmounted(() => {
    heal.detach();
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
