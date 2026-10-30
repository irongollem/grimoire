import { ref, computed, watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useCampaignStore } from "@/stores/campaign";
import { ensureCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { MapLiveDoorState } from "@/types/mapLive.types";
import type { EncounterState, MagicalDarknessZone, RunCombatant, RunningEncounterState } from "@/types/encounter.types";

// ── Module-level singleton for running encounters ──────────────────────────────
let stopRunRings: (() => void) | null = null;
let runRefCount = 0;
let stopRunWatcher: (() => void) | null = null;
const runningStates = ref<RunningEncounterState[]>([]);
const runningLoaded = ref(false);

export function useRunningEncounters() {
  const campaign = useCampaignStore();

  async function fetchRunning(campaignId: string) {
    if (!campaignId) { runningStates.value = []; return; }
    // Only the columns the running-list consumers read (the banner, session rail,
    // encounter lists and the initiative widget). `combatants_live` stays because
    // the widget draws its rows from it; `fog_mask`, `events_fired` and the rest
    // are not read by anything here and are the bulk of a row.
    const { data, error } = await supabase
      .from("encounter_state")
      .select("encounter_id, is_running, current_round, active_combatant_index, combatants_live")
      .eq("campaign_id", campaignId)
      .eq("is_running", true);
    // A failed read keeps the list as it was: clearing it would hide a live
    // fight from the banner and rail over a transient error.
    if (error) throw error;
    if (campaign.activeCampaignId === campaignId) {
      runningStates.value = data as RunningEncounterState[];
      runningLoaded.value = true;
    }
  }

  // The doorbell says an encounter_state row changed, never which; re-read the
  // running rows. Every ring is read, this tab's own included: going live and
  // ending a fight write the row but nothing here patches `runningStates` from the
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
      } catch (error) {
        // Reported from a timer: a throw inside a listener or a console call does
        // not reliably reach Sentry.
        setTimeout(() => { throw error; });
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

// ── DM writes ──────────────────────────────────────────────────────────────────
// Three kinds of write reach the live row, and each owns its own columns:
//   - the roster (round, turn, combatants, fired events), written only by the
//     runner, which owns the run;
//   - token positions, written one combatant at a time by
//     `update_combatant_position` from any battle map, the DM's and the players';
//   - the map's own state (fog, magical darkness, doors), written by the DM's
//     battle map without touching the roster.
// A second map window follows the run rather than owning it (#1120), so it writes
// positions and map state only: pushing its copy of the roster would undo the
// runner's last change.

/** One debounced write: a burst collapses into the last call, and `flush` sends it now. */
function debounced() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let run: (() => void) | null = null;
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const fn = run;
    run = null;
    fn?.();
  }
  return {
    schedule(fn: () => void) {
      if (timer) clearTimeout(timer);
      run = fn;
      timer = setTimeout(flush, 300);
    },
    flush,
    get pending() {
      return timer !== null;
    },
  };
}
const rosterPush = debounced();
const mapPush = debounced();
let pendingMapPatch: MapPatch = {};
let writesInFlight = 0;
let writeGeneration = 0;
let rereadAfterWrites: (() => void) | null = null;

interface MapPatch {
  fog_mask?: string | null;
  magical_darkness?: MagicalDarknessZone[];
  door_states?: MapLiveDoorState[];
}

function writesPending(): boolean {
  return rosterPush.pending || mapPush.pending || writesInFlight > 0;
}

async function trackWrite<T>(write: () => Promise<T>): Promise<T> {
  writesInFlight++;
  writeGeneration++;
  try {
    return await write();
  } finally {
    writesInFlight--;
    if (!writesPending() && rereadAfterWrites) {
      const reread = rereadAfterWrites;
      rereadAfterWrites = null;
      reread();
    }
  }
}

// ── Following the live row ─────────────────────────────────────────────────────
// A window that shows a live fight it does not run (the battle map in a second
// window, #1120) learns of every change through the campaign doorbell: the row
// rings, and the window re-reads it. The runner follows too, so a fog mask a
// second window brushed is the one End combat reads.
//
// A read never lands over this tab's own pending write. The tab holds a change
// the row does not have yet (a brush stroke, a ring of HP), and adopting the
// older row would flash it back, or hand the runner a roster behind its own. Such
// a read waits for the writes to settle and is made again; the write's own ring
// would bring one, but a failed write rings nothing.
const followers = new Map<string, { refs: number; reread: () => void; stop: () => void }>();

/** Bumped each time a followed read is adopted, so a runner can tell a change made elsewhere from its own. */
export const liveRevision = ref(0);

function follow(encounterId: string, campaignId: string): () => void {
  const existing = followers.get(encounterId);
  if (existing) {
    existing.refs++;
    return () => release(encounterId);
  }
  let reading = false;
  let again = false;
  const readOnce = async () => {
    if (writesPending()) {
      rereadAfterWrites = reread;
      return;
    }
    const generation = writeGeneration;
    const { data, error } = await supabase
      .from("encounter_state")
      .select("*")
      .eq("encounter_id", encounterId)
      .maybeSingle();
    if (error) throw error;
    if (!followers.has(encounterId)) return;
    if (generation !== writeGeneration || writesPending()) {
      rereadAfterWrites = reread;
      return;
    }
    liveState.value = (data as EncounterState | null) ?? null;
    liveRevision.value++;
  };
  const reread = async () => {
    if (reading) { again = true; return; }
    reading = true;
    try {
      do {
        again = false;
        await readOnce();
      } while (again && followers.has(encounterId));
    } catch (error) {
      // Reported from a timer: a throw inside a listener does not reliably reach Sentry.
      setTimeout(() => { throw error; });
    } finally {
      reading = false;
    }
  };
  const offRing = onCampaignRing(["encounter_state"], (ring) => {
    if (ring.campaignId === campaignId) void reread();
  });
  const offReconcile = onCampaignReconcile((id) => {
    if (id === campaignId) void reread();
  });
  followers.set(encounterId, {
    refs: 1,
    reread: () => void reread(),
    stop: () => { offRing(); offReconcile(); },
  });
  return () => release(encounterId);
}

function release(encounterId: string) {
  const entry = followers.get(encounterId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.stop();
  followers.delete(encounterId);
}

// ── DM composable ──────────────────────────────────────────────────────────────
// `string | null` rather than `string`, deliberately: an encounter being
// created has no id yet, and the previous signature forced the caller to lie
// about that with `?? ""` — which is how an empty UUID reached PostgREST and
// came back 400 (#833). Absence is a real state here, so the type says so.
//
// `follow` keeps the live row current from the doorbell (see "Following the live
// row" above): the runner and the battle map pass it; a page that only needs to
// stop a fight does not.
export function useEncounterLive(
  encounterId: MaybeRefOrGetter<string | null>,
  options: { follow?: boolean } = {},
) {
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
      // Likewise a new fight starts without the last one's spheres of darkness.
      magical_darkness: [],
      // And every door starts as the map drew it: the DM's open and shut doors belong to the fight (#1073).
      door_states: [],
    };
    const { data, error } = await trackWrite(async () =>
      supabase.from("encounter_state").upsert(payload, { onConflict: "encounter_id" }).select().single(),
    );
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

  interface RosterState {
    round: number;
    activeIndex: number;
    combatants: RunCombatant[];
    eventsFired: string[];
  }

  /** The runner's roster, debounced. Only the window that owns the run calls this. */
  function schedulePush(state: RosterState) {
    rosterPush.schedule(() => void trackWrite(() => pushState(state)));
  }

  async function pushState(state: RosterState) {
    if (!liveState.value) return;
    // Token positions are written straight into DB combatants_live by the battle
    // maps via update_combatant_position; the runner store never ingests them, so
    // a full-replace here would revert every token to its seed position on the
    // next HP/turn/condition push. Read the live positions and merge them onto the
    // outgoing combatants (DB position wins) so moves persist across pushes.
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
    const patch = {
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      combatants_live: mergedCombatants,
      events_fired: state.eventsFired,
    };
    const { error } = await supabase
      .from("encounter_state")
      .update(patch)
      .eq("encounter_id", toValue(encounterId));
    if (error) throw error;
    if (liveState.value) liveState.value = { ...liveState.value, ...patch };
  }

  /**
   * The battle map's own state, debounced: only the columns given are written, and
   * patches inside one burst merge, so a door opened while the fog push is pending
   * does not drop the fog.
   */
  function scheduleMapPush(patch: { fogMask?: string | null; magicalDarkness?: MagicalDarknessZone[]; doorStates?: MapLiveDoorState[] }) {
    if (patch.fogMask !== undefined) pendingMapPatch.fog_mask = patch.fogMask;
    if (patch.magicalDarkness !== undefined) pendingMapPatch.magical_darkness = patch.magicalDarkness;
    if (patch.doorStates !== undefined) pendingMapPatch.door_states = patch.doorStates;
    mapPush.schedule(() => {
      const columns = pendingMapPatch;
      pendingMapPatch = {};
      void trackWrite(() => pushMap(columns));
    });
  }

  async function pushMap(columns: MapPatch) {
    if (!liveState.value) return;
    const { error } = await supabase
      .from("encounter_state")
      .update(columns)
      .eq("encounter_id", toValue(encounterId));
    if (error) throw error;
    if (liveState.value) liveState.value = { ...liveState.value, ...columns };
  }

  /**
   * Moves one token on the live board: shown at once, then written through the
   * same atomic function the players use, which lets the campaign's DM move any
   * combatant. A refused move is re-read away and thrown for the caller to report.
   */
  async function moveToken(instanceId: string, position: { x: number; y: number } | null) {
    const row = liveState.value;
    if (!row || !isLive.value) return;
    liveState.value = {
      ...row,
      combatants_live: row.combatants_live.map((c) => (c.instance_id === instanceId ? { ...c, position } : c)),
    };
    try {
      await trackWrite(() => updateCombatantPosition(row.id, instanceId, position));
    } catch (error) {
      const id = toValue(encounterId);
      const entry = id ? followers.get(id) : undefined;
      if (entry) entry.reread();
      else void loadState();
      throw error;
    }
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
  let unfollow: (() => void) | null = null;
  watch(
    [() => toValue(encounterId), () => campaign.activeCampaignId],
    ([id, campaignId], previous) => {
      if (!previous || previous[0] !== id) void loadState();
      unfollow?.();
      unfollow = options.follow && id && campaignId ? follow(id, campaignId) : null;
    },
    { immediate: true },
  );

  onUnmounted(() => {
    unfollow?.();
    // Send what is pending rather than drop it. Leaving the runner for the battle
    // map unmounts it, and a change made just before that never reached the players.
    rosterPush.flush();
    mapPush.flush();
  });

  return { isLive, liveState, liveStateLoaded, goLive, schedulePush, scheduleMapPush, moveToken, endLive };
}

// ── Player composable ──────────────────────────────────────────────────────────
export function usePlayerEncounterLive(campaignId: MaybeRefOrGetter<string | null>) {
  let subscribedCampaignId: string | null = null;

  async function fetchRunning(id: string) {
    const { data, error } = await supabase.rpc("get_player_encounter_state", {
      p_campaign_id: id,
    });
    // A failed read keeps the fight on screen: clearing it would end the
    // player's combat view over a transient error.
    if (error) throw error;
    // A campaign switch can complete before its previous request. Never let
    // that stale response replace the active campaign's live encounter.
    if (id !== subscribedCampaignId) return;
    liveState.value = (data as EncounterState[])[0] ?? null;
    liveStateLoaded.value = true;
  }

  function subscribe(id: string): void {
    unsubscribe();
    subscribedCampaignId = id;
    liveStateLoaded.value = false;
    // Every DM push rings, so rings come in bursts. One read runs at a time and a
    // ring that lands meanwhile schedules exactly one more, so responses can never
    // land out of order.
    let reading = false;
    let again = false;
    const reread = async () => {
      if (reading) { again = true; return; }
      reading = true;
      try {
        do {
          again = false;
          await fetchRunning(id);
        } while (again && subscribedCampaignId === id);
      } catch (error) {
        // Reported from a timer: a throw inside a listener or a console call does
        // not reliably reach Sentry.
        setTimeout(() => { throw error; });
      } finally {
        reading = false;
      }
    };
    void reread();
    // `encounter_state` rings for every change to the row the player's
    // projection (get_player_encounter_state) is built from, including an NPC
    // identity change, so by the time the ring lands the projection is current.
    // The ring carries no combatant payload: resolve it through the server-side
    // projection before adopting anything.
    const offRing = onCampaignRing(["encounter_state"], (ring) => {
      if (ring.campaignId === id && subscribedCampaignId === id) void reread();
    });
    const offReconcile = onCampaignReconcile((campaign) => {
      if (campaign === id && subscribedCampaignId === id) void reread();
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
 * Moves one token on the live board, atomically, through
 * `update_combatant_position`: a player may move only their own character's
 * token, the campaign's DM any combatant (#1120).
 */
export async function updateCombatantPosition(
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
