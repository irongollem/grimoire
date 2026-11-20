import { ref, shallowRef, computed, onScopeDispose } from "vue";
import type { Occluders } from "@/lib/battlemap/occlusion";
import { defineStore } from "pinia";
import type { RunCombatant, FactionDef, RevealState, EncounterEvent, WildshapeState } from "@/types/encounter.types";
import type { Monster, MonsterSize } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import type { TrapEntry } from "@/types/trap.types";
import type { Companion } from "@/types/companion.types";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import { initiativeRoll } from "@/rules/initiative";
import { DEFAULT_RULESET, type RulesetKey } from "@/types/ruleset.types";
import type { DyingOutcome } from "@/rules/dying";
import type { AppliedCondition } from "@/types/condition.types";
import { holdsConcentration, type ConditionEndReason } from "@/rules/conditionDurations";
import type { ActionLimit, EncounterTurnEvent } from "@/rules/encounterTurn";
import { rollInitiativeValue, adoptedStatsFor } from "@/rules/encounterCombatLogic";
import type { FightCommand } from "@/rules/fight/fightCommands";
import { applyWithRageUpkeep } from "@/rules/fight/allies/rageUpkeep";
import type { FightDeps } from "@/rules/fight/fightEvents";
import { isTurnEvent, type FightEffect, type FightState } from "@/rules/fight/fightState";
import { companionCombatant, idClock, spawnMonsters, spawnNpcs } from "@/rules/fight/fightSpawn";
import type { ConfirmedFight, FightFrame } from "@/lib/encounters/fightSync";
import type { ShownDefense } from "@/rules/fight/tactics/shownDefenses";
import type { ShownDeedDelta } from "@/rules/fight/tactics/shownThreat";
import { toast } from "@/lib/toast";
import { createFightLink } from "./encounterRunLink";
import { createBatchPump } from "./encounterRunPump";

/** Rolls one combatant's initiative. Registered by the encounter runner so the
 *  DM's dice-mode preference is honoured — in "physical" mode this resolves via
 *  the manual-entry prompt instead of Math.random(). Returns null when the DM
 *  cancels the prompt. Without a registered roller the store falls back to an
 *  automatic d20 (used by tests and by any non-UI caller). */
export type InitiativeRoller = (combatant: RunCombatant) => Promise<number | null>;

/** One move of a token within the turn: where it left, and what the move cost in feet. */
export interface MoveRecord {
  from: { x: number; y: number };
  feet: number;
}

/** The commands that hand the turn to someone else (or restart the order). */
/** One clock for the tab, so no two spawns share an id however fast they follow each other (see `idClock`). */
const spawnClock = idClock();

const TURN_CHANGING = new Set<FightCommand["type"]>(["next_turn", "prev_turn", "reshuffle_initiative", "start_combat"]);
/** Commands whose recharge and condition lines replace the last turn's instead of adding to them. */
const TURN_STARTING = new Set<FightCommand["type"]>(["next_turn", "reshuffle_initiative"]);

export const useEncounterRunStore = defineStore("encounterRun", () => {
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
  /**
   * The walls and closed doors of the fight's map, as the map screen on show has read them; null when no map screen
   * is up (a fight with no map, or the phone's list). The attack flows read it for what a wall changes (a foe on
   * the other side of one is not "beside" an archer). Shallow: the value is replaced whole, never edited.
   */
  const occludersSource = shallowRef<(() => Occluders | null) | null>(null);
  /** Read only when an attack asks, so a map screen pays nothing for it until then. */
  const occluders = computed<Occluders | null>(() => (occludersSource.value === null ? null : occludersSource.value()));
  /** The map screen on show says how its walls are read; null when it goes away. */
  function setOccluders(read: (() => Occluders | null) | null) {
    occludersSource.value = read;
  }
  const started = ref(false); // true = initiative locked + sorted
  /** This turn's moves per token, for Back to start and Ctrl Z (#1125 decision 11). Not persisted: it lives as long as the turn. */
  const moveHistory = ref<Record<string, MoveRecord[]>>({});
  const events = ref<EncounterEvent[]>([]);
  const eventsFired = ref<string[]>([]);
  const traps = ref<TrapEntry[]>([]);
  const availableMonsters = ref<Monster[]>([]);
  const availableNpcs = ref<NpcListRow[]>([]);
  /** condition_ended events: replaced at every next_turn / reshuffle_initiative with that turn's
   *  endings; other commands that end conditions (save resolution, concentration, source down or
   *  removed) append. Cleared by `reset()`. */
  const lastConditionEvents = ref<Array<{ instanceId: string; name: string; reason: ConditionEndReason }>>([]);
  /** Concentration saves owed by stat-block holders that took damage (#1018), until the DM settles each. */
  const concentrationChecks = ref<Array<{ key: string; instanceId: string; damage: number }>>([]);
  let concentrationSeq = 0;
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

  /** Conditions owing the DM a roll, in initiative order: one entry per (combatant, condition, what). */
  const dueConditions = computed(() =>
    sortedCombatants.value.flatMap((c) =>
      c.conditions.flatMap((condition) => [
        ...(condition.due?.save ? [{ instanceId: c.instance_id, combatantName: c.name, condition, what: "save" as const }] : []),
        ...(condition.due?.damage ? [{ instanceId: c.instance_id, combatantName: c.name, condition, what: "damage" as const }] : []),
      ]),
    ),
  );

  /** Falls back to an automatic d20 + modifier when no roller is registered —
   *  used by mid-combat spawns too (a modal per spawned goblin would stall the turn). */
  function rollOneInitiative(c: RunCombatant): Promise<number | null> {
    return initiativeRoller ? initiativeRoller(c) : Promise.resolve(rollInitiativeValue(initiativeRoll(c, ruleset.value)));
  }

  /** When true, every combatant's initiative is re-rolled and the order
   *  re-sorted at the start of each new round (the "Random Initiative Each
   *  Round" optional rule). Set by the runner from the campaign rule toggle. */
  const randomizeInitiativeEachRound = ref(false);

  function setRandomizeInitiativeEachRound(value: boolean) {
    randomizeInitiativeEachRound.value = value;
  }

  /** The table's edition, whose condition rules an initiative roll follows
   *  (Exhaustion, check disadvantage). Set by the runner on mount, like the
   *  random-initiative flag above; it starts at the app default until then. */
  const ruleset = ref<RulesetKey>(DEFAULT_RULESET);

  function setRuleset(value: RulesetKey) {
    ruleset.value = value;
  }

  /** The fight as the pure rules see it: this store's refs, read once. */
  function snapshot(): FightState {
    return {
      combatants: combatants.value,
      round: round.value,
      activeIndex: activeIndex.value,
      started: started.value,
      randomizeInitiativeEachRound: randomizeInitiativeEachRound.value,
      ruleset: ruleset.value,
      lairEnabled: lairEnabled.value,
      lairOwnerInstanceId: lairOwnerInstanceId.value,
      lairFiredRounds: lairFiredRounds.value,
      events: events.value,
      eventsFired: eventsFired.value,
    };
  }

  /** What a spawn is built from: the monsters and NPCs the runner holds, and the clock for instance ids. */
  function fightDeps(): FightDeps {
    return { monsters: availableMonsters.value, npcs: availableNpcs.value, now: spawnClock };
  }

  /** The encounter's own settings a fight is played under, which the saved row does not hold. */
  function frame(): FightFrame {
    return {
      randomizeInitiativeEachRound: randomizeInitiativeEachRound.value,
      ruleset: ruleset.value,
      lairEnabled: lairEnabled.value,
      lairOwnerInstanceId: lairOwnerInstanceId.value,
      events: events.value,
    };
  }

  /** Shows a fight state: what the pure rules computed, or what a reconcile replayed. */
  function adoptState(before: FightState, state: FightState) {
    if (state.combatants !== before.combatants) combatants.value = state.combatants;
    round.value = state.round;
    activeIndex.value = state.activeIndex;
    started.value = state.started;
    lairEnabled.value = state.lairEnabled;
    lairOwnerInstanceId.value = state.lairOwnerInstanceId;
    if (state.lairFiredRounds !== before.lairFiredRounds) lairFiredRounds.value = state.lairFiredRounds;
    if (state.eventsFired !== before.eventsFired) eventsFired.value = state.eventsFired;
    dropStaleChecks();
  }

  /** A check is owed only while its holder is still in the fight and still holds something. */
  function dropStaleChecks() {
    const stale = concentrationChecks.value.filter((k) => !holdsConcentration(combatants.value, k.instanceId));
    if (stale.length > 0) concentrationChecks.value = concentrationChecks.value.filter((k) => !stale.includes(k));
  }

  /** What the DM is told of the effects the rules raised: concentration saves owed, conditions that ended,
   *  recharge rolls. Character-row writes and chat lines are the server's to make, never the browser's.
   *  `turnStart` is true when a turn change raised them (it replaces the last turn's lines; anything else appends). */
  function raise(effects: FightEffect[], turnStart: boolean) {
    const raised = effects.filter(isTurnEvent);
    const recharges = raised.flatMap((e) =>
      e.type === "action_recharged" || e.type === "recharge_failed"
        ? [{ instanceId: e.instanceId, action: e.action, roll: e.roll, recharged: e.type === "action_recharged" }]
        : [],
    );
    // Exactly this turn's rolls: a turn that rolled none must clear the old lines,
    // or "still spent" lingers for rounds. Other commands leave it alone.
    if (turnStart) lastRechargeEvents.value = recharges;
    const endings = raised.flatMap((e) =>
      e.type === "condition_ended" ? [{ instanceId: e.instanceId, name: e.name, reason: e.reason }] : [],
    );
    if (turnStart) lastConditionEvents.value = endings;
    else if (endings.length > 0) lastConditionEvents.value = [...lastConditionEvents.value, ...endings];
    for (const effect of effects) {
      if (effect.type === "concentration_check_due") {
        concentrationSeq += 1;
        concentrationChecks.value = [
          ...concentrationChecks.value,
          { key: `conc-${concentrationSeq}`, instanceId: effect.instanceId, damage: effect.damage },
        ];
      }
    }
    dropStaleChecks();
  }

  /** A move can only be taken back within the turn it was made in. */
  function turnChanged(commands: readonly FightCommand[]) {
    if (commands.some((c) => TURN_CHANGING.has(c.type))) moveHistory.value = {};
  }

  const link = createFightLink({ snapshot, frame, deps: fightDeps, show: adoptState, raise, turnChanged });
  const { busy, unsentBatches, sendFailures } = link;
  // The one sender of this fight's batches. It belongs to the store, which holds them, so it outlives any runner.
  const pump = createBatchPump(
    {
      encounterId: link.encounterId,
      nextBatch: link.nextBatch,
      hasQueued: link.hasQueued,
      sendFailed: link.sendFailed,
      sendSucceeded: link.sendSucceeded,
      answered: link.answered,
      dropPending: link.dropPending,
      unsent: unsentBatches,
    },
    toast,
  );
  link.setWaker(pump.kick);
  onScopeDispose(() => pump.dispose());

  /** Runs a command through the pure fight rules (`rules/fight`: the turn
   *  reducer and the fight's own commands, then the event check when the
   *  reducer asked for one) and shows the result at once. With a fight attached the command is also queued for
   *  the server, which applies the same rules and whose answer, when it differs, replaces what is shown here.
   *  A command whose result the browser cannot know (it needs dice, or builds ids) is queued and not shown: the
   *  fight is `busy` until the answer comes. Returns the reducer's events for callers that need an outcome
   *  (HP changes, legendary spend), none for a command that waits. */
  function dispatch(command: FightCommand): EncounterTurnEvent[] {
    const before = snapshot();
    const result = link.queue(command, before) ?? applyWithRageUpkeep(before, command, fightDeps());
    if (result.state === null) return [];
    turnChanged([command]);
    adoptState(before, result.state);
    raise(result.effects, TURN_STARTING.has(command.type));
    return result.effects.filter(isTurnEvent);
  }

  /** Attaches a fight the server holds: shows it, and from now on keeps what it confirmed beside what is pending. */
  function startFight(meta: { encounterId: string; encounterName: string; factions: FactionDef[]; events: EncounterEvent[]; traps: TrapEntry[] }, confirmed: ConfirmedFight) {
    encounterId.value = meta.encounterId;
    encounterName.value = meta.encounterName;
    factions.value = meta.factions;
    events.value = meta.events;
    traps.value = meta.traps;
    link.attach(confirmed, meta.encounterId);
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
      if (rolled !== null) dispatch({ type: "set_initiative", instanceId, value: rolled });
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
      // Each rolled value is a command, which replaces `combatants.value` with a new array; this loop keeps walking the old one.
      for (const c of combatants.value) {
        if (c.initiative !== null) continue;
        const rolled = await rollOneInitiative(c);
        if (rolled === null) return false;
        dispatch({ type: "set_initiative", instanceId: c.instance_id, value: rolled });
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
    // The token takes the beast's size. A caller that did not carry it in the form
    // gets it from the beast's monster row when the runner holds that.
    const beastSize = form.beast_size ?? availableMonsters.value.find((m) => m.id === form.monster_id)?.size;
    dispatch({ type: "enter_wildshape", instanceId, form: beastSize ? { ...form, beast_size: beastSize } : form, wildshapesUsed, tempHp });
  }

  /** The DM's Enlarge/Reduce for this fight; null puts the creature back to its own size. */
  function setSizeOverride(instanceId: string, size: MonsterSize | null) {
    dispatch({ type: "set_size_override", instanceId, size });
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

  function setHp(instanceId: string, value: number) {
    dispatch({ type: "set_hp", instanceId, value });
  }

  // DM edits a combatant's max HP on the fly (e.g. a monster that spawned with the
  // wrong HP, or scaling a fight live); see `setMaxHp` in rules/encounterTurn.
  function setMaxHp(instanceId: string, value: number) {
    dispatch({ type: "set_max_hp", instanceId, value });
  }

  function applyCondition(instanceId: string, condition: AppliedCondition) {
    dispatch({ type: "apply_condition", instanceId, condition });
  }

  function removeCondition(instanceId: string, name: string) {
    dispatch({ type: "remove_condition", instanceId, name });
  }

  /** Replace a combatant's full conditions array — used when several
   *  entries change at once (e.g. exhaustion replacement). */
  function setConditions(instanceId: string, conditions: AppliedCondition[]) {
    dispatch({ type: "set_conditions", instanceId, conditions });
  }

  /** The DM's roll for a "save ends" condition. */
  function resolveConditionSave(instanceId: string, name: string, success: boolean) {
    dispatch({ type: "resolve_condition_save", instanceId, name, success });
  }

  /** Clears an ongoing-damage debt; the damage itself goes through `adjustHp` first. */
  function settleOngoingDamage(instanceId: string, name: string) {
    dispatch({ type: "settle_ongoing_damage", instanceId, name });
  }

  /** Ends what a combatant's concentration was holding on others (all of it, or one spell's). */
  function endConcentration(instanceId: string, spell?: string) {
    dispatch({ type: "end_concentration", instanceId, spell });
  }

  /** Remembers a defense a blow just showed on a combatant (#1021). */
  function showDefense(instanceId: string, damageType: string, defense: ShownDefense) {
    dispatch({ type: "show_defense", instanceId, damageType, defense });
  }

  /** Remembers a deed the fight just saw on a combatant (#1021). */
  function showDeed(instanceId: string, deed: ShownDeedDelta) {
    dispatch({ type: "show_deed", instanceId, deed });
  }

  function addCurse(instanceId: string, curse: string) {
    dispatch({ type: "add_curse", instanceId, curse });
  }

  function removeCurse(instanceId: string, curse: string) {
    dispatch({ type: "remove_curse", instanceId, curse });
  }

  function setRevealState(instanceId: string, revealState: RevealState) {
    dispatch({ type: "set_reveal_state", instanceId, revealState });
  }

  function cycleRevealState(instanceId: string) {
    const c = combatants.value.find((x) => x.instance_id === instanceId);
    if (!c) return;
    const order: RevealState[] = ["hidden", "unseen", "revealed"];
    const idx = order.indexOf(c.reveal_state ?? "hidden");
    setRevealState(instanceId, order[(idx + 1) % order.length]);
  }

  /** Newcomers join the roster, and the turn stays with whoever is acting (see `joinFight`, which the command applies). */
  function join(newcomers: RunCombatant[]) {
    if (newcomers.length === 0) return;
    dispatch({ type: "add_combatants", combatants: newcomers });
  }

  function addMonster(monsterId: string, factionId: string, count: number, customName?: string) {
    join(spawnMonsters(fightDeps(), started.value, monsterId, { factionId, count, customName }, true));
  }

  function addNpc(npcId: string, factionId: string, count: number, customName?: string) {
    join(spawnNpcs(fightDeps(), started.value, npcId, { factionId, count, customName }));
  }

  /** Gives every combatant that joined on stand-in numbers the real ones, once
   *  its monster or NPC has a stat block (written mid-fight). The runner calls
   *  this whenever it re-reads the monsters or NPCs on the field. The numbers
   *  are worked out here, where the monsters and NPCs are held; applying them
   *  is the `adopt_stats` command. */
  function adoptStatBlocks() {
    for (const c of combatants.value) {
      if (!c.placeholder_stats) continue;
      const source = c.monster_id
        ? availableMonsters.value.find((m) => m.id === c.monster_id)
        : availableNpcs.value.find((n) => n.id === c.npc_id);
      const stats = adoptedStatsFor(c, source?.stat_block);
      if (stats) dispatch({ type: "adopt_stats", instanceId: c.instance_id, stats });
    }
  }

  /** Settles one owed concentration save; a lost one ends what the holder was concentrating on. */
  function resolveConcentrationCheck(key: string, kept: boolean) {
    const check = concentrationChecks.value.find((k) => k.key === key);
    if (!check) return;
    concentrationChecks.value = concentrationChecks.value.filter((k) => k.key !== key);
    if (!kept) endConcentration(check.instanceId);
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
    // The command refuses a duplicate id too; this keeps the no-op from building the combatant at all.
    if (combatants.value.some((c) => c.instance_id === `c-${comp.id}`)) return;
    join([companionCombatant(comp, factionId)]);
  }

  function fireEvent(eventId: string) {
    dispatch({ type: "fire_event", eventId });
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
    dispatch({ type: "check_events" });
  }

  function reset() {
    encounterId.value = null;
    encounterName.value = "";
    round.value = 0;
    activeIndex.value = 0;
    combatants.value = [];
    factions.value = [];
    occludersSource.value = null;
    started.value = false;
    events.value = [];
    eventsFired.value = [];
    traps.value = [];
    availableMonsters.value = [];
    availableNpcs.value = [];
    lastRechargeEvents.value = [];
    lastConditionEvents.value = [];
    concentrationChecks.value = [];
    rollingInitiative.value = false;
    // The random-initiative flag and the ruleset are the table's settings, not this
    // fight's: the runner's watches set them once on mount, and `initStore` resets
    // the store after the runner may already have mounted, which used to switch
    // Random Initiative Each Round off and the edition back to 2014 (#1149).
    lairEnabled.value = false;
    lairOwnerInstanceId.value = null;
    lairFiredRounds.value = [];
    moveHistory.value = {};
    link.detach();
    pump.fightChanged();
  }

  // ── Boss mechanics ───────────────────────────────────────────────────────────

  /** The encounter's lair settings, from its row: part of the frame a fight is played under, which the
   *  server reads from the same row, so there is nothing to send. */
  function setBossMechanics(opts: { lairEnabled: boolean; lairOwnerInstanceId: string | null }) {
    lairEnabled.value = opts.lairEnabled;
    lairOwnerInstanceId.value = opts.lairOwnerInstanceId;
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

  /** Idempotent: a repeat leaves the Reaction as asked, where `toggleReaction` would flip it back. */
  function setReactionUsed(instanceId: string, used: boolean) {
    dispatch({ type: "set_reaction_used", instanceId, used });
  }

  /** The token left `from` and the move cost `feet`: counts against the turn's movement and can be taken back. */
  function recordMove(instanceId: string, from: { x: number; y: number }, feet: number) {
    moveHistory.value = { ...moveHistory.value, [instanceId]: [...(moveHistory.value[instanceId] ?? []), { from, feet }] };
    dispatch({ type: "record_move", instanceId, feet });
  }

  /**
   * Takes back this turn's last move ("last") or all of them ("all": Back to start). Returns where the token goes
   * back to and hands its feet back, or null when it has not moved this turn. The caller moves the token itself,
   * because live and offline moves travel different ways.
   */
  function undoMove(instanceId: string, scope: "last" | "all"): MoveRecord | null {
    const history = moveHistory.value[instanceId] ?? [];
    if (history.length === 0) return null;
    const undone = scope === "all" ? history : history.slice(-1);
    moveHistory.value = { ...moveHistory.value, [instanceId]: history.slice(0, history.length - undone.length) };
    const feet = undone.reduce((sum, m) => sum + m.feet, 0);
    dispatch({ type: "undo_move", instanceId, feet });
    return { from: undone[0].from, feet };
  }

  function setActionUsed(instanceId: string, used: boolean) {
    dispatch({ type: "set_action_used", instanceId, used });
  }

  function setBonusUsed(instanceId: string, used: boolean) {
    dispatch({ type: "set_bonus_used", instanceId, used });
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

  return {
    encounterId,
    encounterName,
    round,
    activeIndex,
    combatants,
    factions,
    occluders,
    setOccluders,
    started,
    events,
    eventsFired,
    activeEnvironmentEffects,
    traps,
    availableMonsters,
    availableNpcs,
    busy,
    lastRechargeEvents,
    lastConditionEvents,
    dueConditions,
    // Boss mechanics state
    lairEnabled,
    lairOwnerInstanceId,
    lairCanFireThisRound,
    sortedCombatants,
    activeCombatant,
    rollingInitiative,
    randomizeInitiativeEachRound,
    setRandomizeInitiativeEachRound,
    ruleset,
    setRuleset,
    reshuffleInitiative,
    rollInitiative,
    rollAllInitiatives,
    unrolledPlayers,
    tiedInstanceIds,
    setInitiativeRoller,
    startCombat,
    setInitiative,
    nextTurn,
    prevTurn,
    adjustHp,
    setHp,
    setMaxHp,
    setTempHp,
    applyCondition,
    removeCondition,
    setConditions,
    resolveConditionSave,
    settleOngoingDamage,
    endConcentration,
    concentrationChecks,
    resolveConcentrationCheck,
    addCurse,
    showDefense,
    showDeed,
    removeCurse,
    setRevealState,
    cycleRevealState,
    enterWildshape,
    setSizeOverride,
    revertWildshape,
    addMonster,
    addNpc,
    adoptStatBlocks,
    join,
    removeCombatant,
    addCompanionCombatant,
    fireEvent,
    addGeneratedEvent,
    checkEvents,
    reset,
    startFight,
    nextBatch: link.nextBatch,
    hasQueued: link.hasQueued,
    unsentBatches,
    sendFailures,
    linkedEncounterId: link.encounterId,
    /** Sends what waits now (the pump also does it by itself whenever a batch is queued). */
    kickSends: pump.kick,
    /** Resolves true once every batch made so far has reached the server, false when it did not in time. */
    drainSends: pump.drain,
    /** The party sync the runner wants made between batches. */
    setIdleWork: pump.setIdleWork,
    /** The server will not take a fight's commands: tells the DM, and drops what is pending only if the store still holds that fight. */
    fightRefused: pump.refused,
    onFightLost: pump.onLost,
    answered: link.answered,
    observed: link.observed,
    dropPendingCommands: link.dropPending,
    // Boss mechanics helpers
    setBossMechanics,
    toggleSurprised,
    toggleReaction,
    moveHistory,
    recordMove,
    undoMove,
    setActionUsed,
    setReactionUsed,
    setBonusUsed,
    useAction,
    restoreAction,
    spendLegendaryActions,
    markLairFired,
  };
});
