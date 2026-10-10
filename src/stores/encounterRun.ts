import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type { RunCombatant, FactionDef, RevealState, EncounterEvent, EventTrigger, SpawnDef, WildshapeState } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import type { Trap } from "@/types/trap.types";
import type { PartyMemberUpdate } from "@/types/party.types";
import type { Companion } from "@/types/companion.types";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import type { DyingOutcome } from "@/rules/dying";
import {
  reduceEncounterTurn,
  type ActionLimit,
  type EncounterTurnCommand,
  type EncounterTurnEvent,
  type EncounterTurnState,
} from "@/rules/encounterTurn";
import {
  rollInitiativeValue,
  evaluateTrigger,
  buildMonsterCombatants,
  buildNpcCombatants,
} from "@/rules/encounterCombatLogic";

/** Persists a player-combatant change to party_members and invalidates the
 *  party query cache. The store stays UI-only — the actual DB write + cache
 *  invalidation is owned by a TanStack Query mutation registered by the
 *  encounter runner via `setPersistHandler`. */
export type PersistPlayerHandler = (partyMemberId: string, patch: PartyMemberUpdate) => void;

/** Rolls one combatant's initiative. Registered by the encounter runner so the
 *  DM's dice-mode preference is honoured — in "physical" mode this resolves via
 *  the manual-entry prompt instead of Math.random(). Returns null when the DM
 *  cancels the prompt. Without a registered roller the store falls back to an
 *  automatic d20 (used by tests and by any non-UI caller). */
export type InitiativeRoller = (combatant: RunCombatant) => Promise<number | null>;

export const useEncounterRunStore = defineStore("encounterRun", () => {
  /** Registered by the encounter runner; routes persistence through the
   *  `useUpdatePartyMember` mutation so the party cache is invalidated. */
  let persistHandler: PersistPlayerHandler | null = null;

  function setPersistHandler(handler: PersistPlayerHandler | null) {
    persistHandler = handler;
  }

  /** Registered by the encounter runner; routes initiative rolls through
   *  `usePromptedRoll` so physical-dice mode prompts the DM for each result. */
  let initiativeRoller: InitiativeRoller | null = null;

  function setInitiativeRoller(roller: InitiativeRoller | null) {
    initiativeRoller = roller;
  }

  const encounterId = ref<string | null>(null);
  const encounterName = ref("");
  const round = ref(1);
  const activeIndex = ref(0); // index into sortedCombatants
  const combatants = ref<RunCombatant[]>([]);
  const factions = ref<FactionDef[]>([]);
  const started = ref(false); // true = initiative locked + sorted
  const events = ref<EncounterEvent[]>([]);
  const eventsFired = ref<string[]>([]);
  const traps = ref<Trap[]>([]);
  const availableMonsters = ref<Monster[]>([]);
  const availableNpcs = ref<NpcListRow[]>([]);
  const pendingBroadcasts = ref<string[]>([]);
  /** Recharge rolls from the most recent turn start, for the runner to show ("Fire Breath recharged on a 5"). Replaced at every turn start that rolled one. */
  const lastRechargeEvents = ref<Array<{ instanceId: string; action: string; roll: number; recharged: boolean }>>([]);

  // Boss-fight mechanics state
  const lairEnabled = ref(false);
  /** instance_id of the combatant whose stat_block.lair_actions should fire at init 20. */
  const lairOwnerInstanceId = ref<string | null>(null);
  /** Rounds in which a lair action has already been used. Keyed by round number. */
  const lairFiredRounds = ref<number[]>([]);

  // Sorted by initiative desc, players-first on tie, dex_mod desc (shared comparator)
  const sortedCombatants = computed(() => sortCombatantsByInitiative(combatants.value));

  /**
   * Hazards and terrain changes currently in play (#604): every
   * `environment_effect` action belonging to an event that has fired.
   *
   * DERIVED, never stored. `eventsFired` already syncs to `encounter_state`
   * and the event definitions already live on the encounter row, so the
   * standing hazard list falls out of state that exists — the same way the
   * player panel derives its narrative beats. A separate ref would be a third
   * copy to keep in step across a reload, a live-sync push and a DM who fires
   * an event from a second window.
   */
  const activeEnvironmentEffects = computed(() =>
    events.value
      .filter((e) => eventsFired.value.includes(e.id))
      .flatMap((e) => e.actions.filter((a) => a.type === "environment_effect")),
  );

  const activeCombatant = computed(() => sortedCombatants.value[activeIndex.value] ?? null);

  /** Falls back to an automatic d20 + modifier when no roller is registered —
   *  used by mid-combat spawns too (a modal per spawned goblin would stall the turn). */
  function rollOneInitiative(c: RunCombatant): Promise<number | null> {
    return initiativeRoller ? initiativeRoller(c) : Promise.resolve(rollInitiativeValue(c));
  }

  /** When true, every combatant's initiative is re-rolled and the order
   *  re-sorted at the start of each new round (the "Random Initiative Each
   *  Round" optional rule). Set by the runner from the campaign rule toggle. */
  const randomizeInitiativeEachRound = ref(false);

  function setRandomizeInitiativeEachRound(value: boolean) {
    randomizeInitiativeEachRound.value = value;
  }

  /** Runs a command through the pure turn reducer (`rules/encounterTurn`), adopts
   *  the resulting state, then acts on the events it raised: player changes go to
   *  the registered persist handler, and `check_events` runs the event triggers
   *  once the new state is in place. Returns the events for callers that need
   *  an outcome (HP changes, legendary spend). */
  function dispatch(command: EncounterTurnCommand): EncounterTurnEvent[] {
    const before: EncounterTurnState = {
      combatants: combatants.value,
      round: round.value,
      activeIndex: activeIndex.value,
      started: started.value,
      randomizeInitiativeEachRound: randomizeInitiativeEachRound.value,
      lairEnabled: lairEnabled.value,
      lairOwnerInstanceId: lairOwnerInstanceId.value,
      lairFiredRounds: lairFiredRounds.value,
    };
    const { state, events: raised } = reduceEncounterTurn(before, command);
    if (state.combatants !== before.combatants) combatants.value = state.combatants;
    round.value = state.round;
    activeIndex.value = state.activeIndex;
    started.value = state.started;
    lairEnabled.value = state.lairEnabled;
    lairOwnerInstanceId.value = state.lairOwnerInstanceId;
    if (state.lairFiredRounds !== before.lairFiredRounds) lairFiredRounds.value = state.lairFiredRounds;
    let checkNow = false;
    const recharges = raised.flatMap((e) =>
      e.type === "action_recharged" || e.type === "recharge_failed"
        ? [{ instanceId: e.instanceId, action: e.action, roll: e.roll, recharged: e.type === "action_recharged" }]
        : [],
    );
    // Exactly this turn's rolls: a turn that rolled none must clear the old lines,
    // or "still spent" lingers for rounds. Other commands leave it alone.
    if (command.type === "next_turn" || command.type === "reshuffle_initiative") lastRechargeEvents.value = recharges;
    for (const event of raised) {
      if (event.type === "player_persist") persistHandler?.(event.partyMemberId, event.patch);
      else if (event.type === "check_events") checkNow = true;
    }
    if (checkNow) checkEvents();
    return raised;
  }

  /** Re-roll everyone's initiative silently (auto d20 — never a physical-dice
   *  prompt, since this fires once per round) and hand the turn to the top of
   *  the freshly-sorted order. */
  function reshuffleInitiative() {
    dispatch({ type: "reshuffle_initiative" });
  }

  /** True while a roll is in flight. In physical-dice mode that means a
   *  manual-entry prompt is open, so every roll control (top bar + per-combatant)
   *  disables until it's answered — the prompt is a single global slot. */
  const rollingInitiative = ref(false);

  /** Rolls (or re-rolls) one combatant — the per-row button. Unlike
   *  `rollAllInitiatives` this is an explicit request, so it does replace an
   *  existing value. */
  async function rollInitiative(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c || rollingInitiative.value) return;
    rollingInitiative.value = true;
    try {
      const rolled = await rollOneInitiative(c);
      if (rolled !== null) c.initiative = rolled;
    } finally {
      rollingInitiative.value = false;
    }
  }

  /** Fills in everyone who doesn't have an initiative yet. Never overwrites a
   *  value that's already there: a player's own roll, a monster the DM rolled
   *  or typed by hand. Rolls sequentially because physical-dice mode prompts the
   *  DM once per combatant; cancelling stops the run and leaves the rest blank
   *  so the button can be pressed again to pick up where it left off.
   *
   *  Rolling is not starting: `started` is only set by `startCombat`, so the
   *  lobby stays a lobby (round 0, re-roll buttons on every row) until the DM
   *  says go. Returns whether everyone ended up with a value. */
  async function rollAllInitiatives(): Promise<boolean> {
    if (rollingInitiative.value) return false;
    rollingInitiative.value = true;
    try {
      for (const c of combatants.value) {
        if (c.initiative !== null) continue;
        const rolled = await rollOneInitiative(c);
        if (rolled === null) return false;
        c.initiative = rolled;
      }
      return true;
    } finally {
      rollingInitiative.value = false;
    }
  }

  /** Player characters who have not rolled yet: the ones Start Combat asks about. */
  const unrolledPlayers = computed(() =>
    combatants.value.filter((c) => c.type === "player" && c.party_member_id && c.initiative === null),
  );

  /** Instance ids sharing an initiative total with someone else. The comparator
   *  already orders a tie by modifier, so this only makes the tie visible: the
   *  DM decides among monsters and players among their own characters, and
   *  editing a value is how either reorders. */
  const tiedInstanceIds = computed(() => {
    const byTotal = new Map<number, string[]>();
    for (const c of combatants.value) {
      if (c.initiative === null) continue;
      byTotal.set(c.initiative, [...(byTotal.get(c.initiative) ?? []), c.instance_id]);
    }
    return new Set([...byTotal.values()].filter((ids) => ids.length > 1).flat());
  });

  /** Blank every PC's initiative. A party member's `current_initiative` outlives
   *  the encounter it was rolled for, so the runner clears it when a lobby opens;
   *  this is the store half of that, so a stale value read before going live
   *  does not survive into the fight. */
  function clearPlayerInitiatives() {
    for (const c of combatants.value) {
      if (c.type === "player" && c.party_member_id) c.initiative = null;
    }
  }

  async function startCombat() {
    if (!started.value) await rollAllInitiatives();
    // Combat starts even if the DM cancelled a manual-entry prompt: anyone left
    // without a value sorts to the end of the order and can be typed in there.
    dispatch({ type: "start_combat" });
  }

  function setInitiative(instanceId: string, value: number) {
    dispatch({ type: "set_initiative", instanceId, value });
  }

  function nextTurn() {
    dispatch({ type: "next_turn" });
  }

  function prevTurn() {
    dispatch({ type: "prev_turn" });
  }

  function enterWildshape(instanceId: string, form: WildshapeState, wildshapesUsed: number, tempHp = 0) {
    dispatch({ type: "enter_wildshape", instanceId, form, wildshapesUsed, tempHp });
  }

  function revertWildshape(instanceId: string) {
    dispatch({ type: "revert_wildshape", instanceId });
  }

  /** Returns the dying outcome for a player combatant (so the caller can say what happened), else null. */
  function adjustHp(instanceId: string, delta: number, options?: { critical?: boolean }): DyingOutcome {
    const raised = dispatch({ type: "adjust_hp", instanceId, delta, critical: options?.critical });
    const dying = raised.find((e) => e.type === "dying_outcome");
    return dying ? dying.outcome : null;
  }

  function setTempHp(instanceId: string, value: number) {
    dispatch({ type: "set_temp_hp", instanceId, value });
  }

  /** Adopt a temp-HP value that came FROM party_members (the player changed it on
   *  their own sheet). Assigns verbatim — no max(), no persist — because the DB row
   *  is the authority here and writing back would echo our own realtime event. */
  function ingestTempHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.temp_hp = value > 0 ? value : undefined;
  }

  /** Adopt a beast form taken or dropped outside the runner (the player's own
   *  sheet), without writing it back. Same reasoning as ingestTempHp: the row is
   *  the authority, and a runner that does not know about the form damages the
   *  druid instead of the beast and then persists the form away. */
  function ingestWildshape(instanceId: string, form: WildshapeState | null) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.wildshape = form ? { ...form } : undefined;
  }

  /** Adopt HP from party_members without writing it back. Realtime rows are
   * authoritative and must not create a second mutation or an echo loop. */
  function ingestHp(instanceId: string, value: number) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    if (c.wildshape && c.wildshape.beast_max_hp !== null) {
      c.wildshape.beast_hp = Math.min(c.wildshape.beast_max_hp, Math.max(0, value));
      if (c.wildshape.beast_hp === 0) c.wildshape = undefined;
    } else {
      // Healing from 0 ends the dying state, wherever it was done.
      if (c.hp <= 0 && value > 0) c.death_saves = { successes: 0, failures: 0 };
      c.hp = Math.min(c.max_hp, Math.max(0, value));
    }
    checkEvents();
  }

  /** Adopt death saves rolled outside the runner (the player's own sheet), without writing back. */
  function ingestDeathSaves(instanceId: string, saves: { successes: number; failures: number }) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.death_saves = { ...saves };
  }

  function setHp(instanceId: string, value: number) {
    dispatch({ type: "set_hp", instanceId, value });
  }

  // DM edits a combatant's max HP on the fly (e.g. a monster that spawned with the
  // wrong HP, or scaling a fight live); see `setMaxHp` in rules/encounterTurn.
  function setMaxHp(instanceId: string, value: number) {
    dispatch({ type: "set_max_hp", instanceId, value });
  }

  function toggleCondition(instanceId: string, condition: string) {
    dispatch({ type: "toggle_condition", instanceId, condition });
  }

  /** Replace a combatant's full conditions array — used when several
   *  entries change at once (e.g. exhaustion replacement). */
  function setConditions(instanceId: string, conditions: string[]) {
    dispatch({ type: "set_conditions", instanceId, conditions });
  }

  /** Adopt conditions from party_members without persisting the same row. */
  function ingestConditions(instanceId: string, conditions: string[]) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.conditions = [...conditions];
  }

  function addCurse(instanceId: string, curse: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c || !curse.trim() || c.curses.includes(curse.trim())) return;
    c.curses.push(curse.trim());
  }

  function removeCurse(instanceId: string, curse: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    c.curses = c.curses.filter((cu) => cu !== curse);
  }

  function setRevealState(instanceId: string, state: RevealState) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (c) c.reveal_state = state;
  }

  function cycleRevealState(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const order: RevealState[] = ["hidden", "unseen", "revealed"];
    const idx = order.indexOf(c.reveal_state ?? "hidden");
    c.reveal_state = order[(idx + 1) % order.length];
  }

  function shouldTrigger(trigger: EventTrigger): boolean {
    return evaluateTrigger(trigger, combatants.value, round.value);
  }

  function addMonster(monsterId: string, factionId: string, count: number, customName?: string) {
    const monster = availableMonsters.value.find((m) => m.id === monsterId);
    if (!monster) return;
    combatants.value.push(
      ...buildMonsterCombatants(monster, { factionId, count, customName, started: started.value, includeLegendaryActions: true }),
    );
  }

  function addNpc(npcId: string, factionId: string, count: number, customName?: string) {
    const npc = availableNpcs.value.find((n) => n.id === npcId);
    if (!npc) return;
    combatants.value.push(...buildNpcCombatants(npc, { factionId, count, customName, started: started.value }));
  }

  /** Mid-combat event spawns intentionally don't seed a legendary-action pool
   *  (unlike `addMonster`) — matches prior behavior, see buildMonsterCombatants. */
  function spawnFromDef(spawn: SpawnDef) {
    // Absent `kind` means monster — every event authored before #604 predates
    // the field. See SpawnDef.
    if (spawn.kind === "npc") {
      addNpc(spawn.monster_id, spawn.faction_id, spawn.count, spawn.custom_name);
      return;
    }
    const monster = availableMonsters.value.find((m) => m.id === spawn.monster_id);
    if (!monster) return;
    combatants.value.push(
      ...buildMonsterCombatants(monster, {
        factionId: spawn.faction_id,
        count: spawn.count,
        customName: spawn.custom_name,
        started: started.value,
      }),
    );
  }

  /** Removes a combatant from the roster entirely — used to pull a benched
   *  companion out of the lobby (round 0). */
  function removeCombatant(instanceId: string) {
    dispatch({ type: "remove_combatant", instanceId });
  }

  /** Adds a companion combatant to the roster — the counterpart to the
   *  companion-seeding loop in EncounterRunView's initStore, used when a
   *  benched companion is flipped back to "with the party" mid-lobby. No-op if
   *  the companion is already present. */
  function addCompanionCombatant(comp: Companion, factionId: string) {
    const instanceId = `c-${comp.id}`;
    if (combatants.value.some((c) => c.instance_id === instanceId)) return;
    combatants.value.push({
      instance_id: instanceId,
      type: "player",
      name: comp.name,
      faction_id: factionId,
      initiative: null,
      hp: comp.current_hp,
      max_hp: comp.max_hp,
      ac: String(comp.ac),
      conditions: [...comp.conditions],
      curses: [],
      death_saves: { successes: 0, failures: 0 },
      dex_mod: 0,
      portrait_url: comp.portrait_url ?? null,
      portrait_focal_point: comp.portrait_focal_point ?? null,
      companion_id: comp.id,
    });
  }

  function executeEvent(event: EncounterEvent) {
    if (!eventsFired.value.includes(event.id)) eventsFired.value.push(event.id);
    for (const action of event.actions) {
      if (action.type === "spawn_combatants") {
        for (const spawn of action.spawns) spawnFromDef(spawn);
      } else if (action.type === "broadcast_message") {
        pendingBroadcasts.value.push(action.message);
      } else if (action.type === "environment_effect") {
        // Broadcast the same way a message action does — the table hears about
        // the collapsing floor — and that is the whole of it. The hazard's
        // continuing presence is DERIVED from `eventsFired`, not stored, so
        // there is no third piece of state to sync, persist or get out of step
        // with the fired list (see activeEnvironmentEffects).
        pendingBroadcasts.value.push(`${action.label}: ${action.description}`);
      }
    }
  }

  function fireEvent(eventId: string) {
    const event = events.value.find((e) => e.id === eventId);
    if (!event) return;
    executeEvent(event);
  }

  /**
   * Add an AI-generated event to the running encounter (#604), UNFIRED.
   *
   * Nothing executes here: the event joins the EVENTS list exactly as a
   * hand-authored one does, and waits for the DM to press ▶. Generated events
   * are always `manual` + `fire_once` — the generator never proposes a trigger
   * and the model is never asked for one — so `checkEvents`, which only
   * auto-fires non-manual triggers, cannot pick this up on a round boundary
   * and surprise the DM with reinforcements they were still deciding about.
   */
  function addGeneratedEvent(event: EncounterEvent) {
    events.value.push(event);
  }

  function checkEvents() {
    if (!started.value) return;
    for (const event of events.value) {
      if (event.fire_once && eventsFired.value.includes(event.id)) continue;
      if (event.trigger.type !== "manual" && shouldTrigger(event.trigger)) {
        executeEvent(event);
      }
    }
  }

  function clearPendingBroadcast(message: string) {
    const idx = pendingBroadcasts.value.indexOf(message);
    if (idx >= 0) pendingBroadcasts.value.splice(idx, 1);
  }

  function reset() {
    encounterId.value = null;
    encounterName.value = "";
    round.value = 0;
    activeIndex.value = 0;
    combatants.value = [];
    factions.value = [];
    started.value = false;
    events.value = [];
    eventsFired.value = [];
    traps.value = [];
    availableMonsters.value = [];
    availableNpcs.value = [];
    pendingBroadcasts.value = [];
    lastRechargeEvents.value = [];
    rollingInitiative.value = false;
    randomizeInitiativeEachRound.value = false;
    lairEnabled.value = false;
    lairOwnerInstanceId.value = null;
    lairFiredRounds.value = [];
  }

  // ── Boss mechanics ───────────────────────────────────────────────────────────

  function setBossMechanics(opts: { lairEnabled: boolean; lairOwnerInstanceId: string | null }) {
    dispatch({ type: "set_boss_mechanics", ...opts });
  }

  function toggleSurprised(instanceId: string) {
    dispatch({ type: "toggle_surprised", instanceId });
  }

  /** Marks one use of a limited ability; `limit` comes from `actionLimit(entry)`. */
  function useAction(instanceId: string, action: string, limit: ActionLimit) {
    dispatch({ type: "use_action", instanceId, action, limit });
  }

  /** DM override: the ability is available again. */
  function restoreAction(instanceId: string, action: string) {
    dispatch({ type: "restore_action", instanceId, action });
    // The action is available again, so a "still spent" line for it is now false.
    lastRechargeEvents.value = lastRechargeEvents.value.filter((e) => !(e.instanceId === instanceId && e.action === action));
  }

  function toggleReaction(instanceId: string) {
    dispatch({ type: "toggle_reaction", instanceId });
  }

  /** Seed legendary-action state on every combatant whose monster has a
   *  non-empty `legendary_actions` array. Called once at combat start after
   *  monsters are loaded so the runner knows who gets a pool. */
  function primeLegendaryActions(caps: Record<string, number>) {
    // caps: instance_id → cap (typically 3). Missing entries get no pool.
    dispatch({ type: "prime_legendary_actions", caps });
  }

  /** Spend N legendary actions from `instanceId` — clamped at zero. Returns
   *  the actual amount spent (0 if there weren't enough). */
  function spendLegendaryActions(instanceId: string, cost: number): number {
    const raised = dispatch({ type: "spend_legendary_actions", instanceId, cost });
    const spent = raised.find((e) => e.type === "legendary_spent");
    return spent ? spent.spent : 0;
  }

  const lairCanFireThisRound = computed(() =>
    lairEnabled.value
      && lairOwnerInstanceId.value !== null
      && !lairFiredRounds.value.includes(round.value)
      && (combatants.value.find((c) => c.instance_id === lairOwnerInstanceId.value)?.hp ?? 0) > 0,
  );

  function markLairFired() {
    dispatch({ type: "mark_lair_fired" });
  }

  function hydrateFromLive(state: {
    encounter_id: string;
    encounter_name: string;
    factions: FactionDef[];
    current_round: number;
    active_combatant_index: number;
    combatants_live: RunCombatant[];
    events?: EncounterEvent[];
    events_fired?: string[];
    traps?: Trap[];
  }) {
    encounterId.value = state.encounter_id;
    encounterName.value = state.encounter_name;
    factions.value = state.factions;
    combatants.value = state.combatants_live;
    round.value = state.current_round;
    activeIndex.value = state.active_combatant_index;
    started.value = state.current_round > 0;
    if (state.events) events.value = state.events;
    if (state.events_fired) eventsFired.value = state.events_fired;
    if (state.traps) traps.value = state.traps;
  }

  return {
    encounterId,
    encounterName,
    round,
    activeIndex,
    combatants,
    factions,
    started,
    events,
    eventsFired,
    activeEnvironmentEffects,
    traps,
    availableMonsters,
    availableNpcs,
    pendingBroadcasts,
    lastRechargeEvents,
    // Boss mechanics state
    lairEnabled,
    lairOwnerInstanceId,
    lairCanFireThisRound,
    sortedCombatants,
    activeCombatant,
    rollingInitiative,
    randomizeInitiativeEachRound,
    setRandomizeInitiativeEachRound,
    reshuffleInitiative,
    rollInitiative,
    rollAllInitiatives,
    unrolledPlayers,
    tiedInstanceIds,
    clearPlayerInitiatives,
    setInitiativeRoller,
    startCombat,
    setInitiative,
    nextTurn,
    prevTurn,
    adjustHp,
    setHp,
    setMaxHp,
    setTempHp,
    ingestTempHp,
    ingestHp,
    ingestDeathSaves,
    toggleCondition,
    setConditions,
    ingestConditions,
    ingestWildshape,
    addCurse,
    removeCurse,
    setRevealState,
    cycleRevealState,
    enterWildshape,
    revertWildshape,
    addMonster,
    addNpc,
    removeCombatant,
    addCompanionCombatant,
    fireEvent,
    addGeneratedEvent,
    checkEvents,
    clearPendingBroadcast,
    reset,
    setPersistHandler,
    hydrateFromLive,
    // Boss mechanics helpers
    setBossMechanics,
    toggleSurprised,
    toggleReaction,
    useAction,
    restoreAction,
    primeLegendaryActions,
    spendLegendaryActions,
    markLairFired,
  };
});
