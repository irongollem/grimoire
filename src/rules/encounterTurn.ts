import type { ActionUse, RunCombatant, WildshapeState } from "@/types/encounter.types";
import type { StatBlockEntry } from "@/types/statBlock.types";
import type { StatBlockListKey } from "@/rules/statBlock/parseAction";
import { rechargeSucceeds } from "@/rules/combat/recharge";
import { rollDie } from "@/lib/dice/dice";
import type { PartyMemberUpdate } from "@/types/party.types";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import { applyDamage, applyHealing, betterTempHp, formHpPools } from "@/rules/hitPoints";
import { damageOutcome, healingOutcome, UNCONSCIOUS, type DyingOutcome } from "@/rules/dying";
import { rollAllInitiativeValues, findFirstActiveIndex, stepTurnIndex } from "@/rules/encounterCombatLogic";

/**
 * The encounter turn state machine, as a pure reducer.
 *
 * `(state, command) -> { state, events }`: no Vue, no Pinia, no DOM, no clock.
 * The Pinia store (`stores/encounterRun`) is a thin shell that feeds it
 * commands; a test, a server function or an AI DM can drive a turn through the
 * same code. Turn boundaries are explicit events (`turn_ended`, `turn_started`,
 * `round_started`) so rules that hang off them (condition durations, #1018)
 * have one place to hook.
 *
 * The input state is never mutated. Combatants a command touches are replaced
 * by fresh objects; everything else is shared with the input.
 */

/** Everything the reducer owns. Plain JSON-serialisable data. */
export interface EncounterTurnState {
  combatants: RunCombatant[];
  round: number;
  /** Index into the initiative-sorted order (`sortCombatantsByInitiative`). */
  activeIndex: number;
  /** True once initiative is locked and combat is running. */
  started: boolean;
  /** "Random Initiative Each Round" optional rule. */
  randomizeInitiativeEachRound: boolean;
  lairEnabled: boolean;
  /** instance_id of the combatant whose stat_block.lair_actions fire at init 20. */
  lairOwnerInstanceId: string | null;
  /** Rounds in which a lair action has already been used. */
  lairFiredRounds: number[];
}

export type EncounterTurnCommand =
  | { type: "start_combat" }
  | { type: "next_turn" }
  | { type: "prev_turn" }
  | { type: "reshuffle_initiative" }
  | { type: "set_initiative"; instanceId: string; value: number }
  | { type: "adjust_hp"; instanceId: string; delta: number; critical?: boolean }
  | { type: "set_hp"; instanceId: string; value: number }
  | { type: "set_max_hp"; instanceId: string; value: number }
  | { type: "set_temp_hp"; instanceId: string; value: number }
  | { type: "toggle_condition"; instanceId: string; condition: string }
  | { type: "set_conditions"; instanceId: string; conditions: string[] }
  | { type: "enter_wildshape"; instanceId: string; form: WildshapeState; wildshapesUsed: number; tempHp?: number }
  | { type: "revert_wildshape"; instanceId: string }
  | { type: "toggle_surprised"; instanceId: string }
  | { type: "toggle_reaction"; instanceId: string }
  /** caps: instance_id -> legendary action cap. Missing entries get no pool. */
  | { type: "prime_legendary_actions"; caps: Record<string, number> }
  | { type: "spend_legendary_actions"; instanceId: string; cost: number }
  | { type: "mark_lair_fired" }
  | { type: "set_boss_mechanics"; lairEnabled: boolean; lairOwnerInstanceId: string | null }
  | { type: "remove_combatant"; instanceId: string }
  /** Marks one use of a limited ability. `limit` is copied onto the combatant so the reducer knows what recharges. */
  | { type: "use_action"; instanceId: string; action: string; limit: ActionLimit }
  /** DM override: the ability is available again (clears its use count). */
  | { type: "restore_action"; instanceId: string; action: string };

/** What limits an ability, read from its stat-block entry (`actionLimit`). */
export interface ActionLimit {
  recharge?: { min: number; max: number };
  per_day?: number;
}

export type EncounterTurnEvent =
  /** The combatant whose turn just ended. Always emitted BEFORE the next turn starts. */
  | { type: "turn_ended"; instanceId: string }
  | { type: "surprise_cleared"; instanceId: string }
  /** A new round began (round 1 on `start_combat`, or the wrap past the last combatant). */
  | { type: "round_started"; round: number }
  | { type: "turn_started"; instanceId: string }
  /** A player-combatant change the caller must write to party_members. */
  | { type: "player_persist"; partyMemberId: string; patch: PartyMemberUpdate }
  /** What an HP change did to a death-saving combatant. Emitted only when there is one. */
  | { type: "dying_outcome"; instanceId: string; outcome: DyingOutcome }
  | { type: "legendary_spent"; instanceId: string; spent: number }
  /** A spent recharge ability came back on this d6 at the start of its owner's turn. */
  | { type: "action_recharged"; instanceId: string; action: string; roll: number }
  /** A spent recharge ability stayed spent on this d6. */
  | { type: "recharge_failed"; instanceId: string; action: string; roll: number }
  /** The caller should evaluate event triggers now (round or HP just changed). */
  | { type: "check_events"; reason: "turn" | "hp" };

export interface EncounterTurnDeps {
  /** Injected d20 for the per-round initiative reshuffle. Defaults to `rollDie(20)`. */
  rollD20?: () => number;
  /** Injected d6 for recharge rolls. Defaults to `rollDie(6)`. */
  rollD6?: () => number;
}

export interface EncounterTurnResult {
  state: EncounterTurnState;
  events: EncounterTurnEvent[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** A working copy of a combatant, with every nested value a command may touch
 *  copied too, so mutating it can never reach the input state. */
function draft(c: RunCombatant): RunCombatant {
  const copy: RunCombatant = { ...c, conditions: [...c.conditions], death_saves: { ...c.death_saves } };
  if (c.wildshape) copy.wildshape = { ...c.wildshape };
  if (c.action_uses) {
    copy.action_uses = Object.fromEntries(
      Object.entries(c.action_uses).map(([name, use]) => [name, { ...use, recharge: use.recharge && { ...use.recharge } }]),
    );
  }
  return copy;
}

function replaceCombatant(list: readonly RunCombatant[], next: RunCombatant): RunCombatant[] {
  return list.map((c) => (c.instance_id === next.instance_id ? next : c));
}

/** Write a player combatant's change to party_members (via the caller). */
function persist(events: EncounterTurnEvent[], c: RunCombatant, patch: PartyMemberUpdate) {
  if (c.type !== "player" || !c.party_member_id) return;
  events.push({ type: "player_persist", partyMemberId: c.party_member_id, patch });
}

/** A party member (not a companion or monster) is the only combatant that dies by the death-save rules. */
function usesDeathSaves(c: RunCombatant): boolean {
  return c.type === "player" && !!c.party_member_id;
}

/** Refill the per-turn pools a combatant regains at the start of its turn
 *  (5e RAW: reaction resets, legendary actions refill). */
function refreshTurnStart(c: RunCombatant): RunCombatant {
  const next: RunCombatant = { ...c, reactionUsed: false };
  if (typeof c.legendary_action_cap === "number") next.legendary_actions_remaining = c.legendary_action_cap;
  return next;
}

/**
 * Where an entry's limited-use tally is kept: the list qualifies the printed name,
 * because a stat block may print "Tail Attack" under Actions and again under
 * Legendary Actions, and those are two different abilities.
 */
export function actionUseKey(list: StatBlockListKey, entry: StatBlockEntry): string {
  return `${list}/${entry.name}`;
}

/** The printed name behind a tally key (`actionUseKey` reversed). */
export function actionUseName(key: string): string {
  const slash = key.indexOf("/");
  return slash === -1 ? key : key.slice(slash + 1);
}

/** The limit a stat-block entry puts on itself, in the shape `use_action` stores. */
export function actionLimit(entry: StatBlockEntry): ActionLimit {
  const { recharge, uses } = entry.structured;
  return { ...(recharge ? { recharge } : {}), ...(uses ? { per_day: uses.count } : {}) };
}

/**
 * Whether a combatant can use an entry now, and the short label the runner shows
 * for it. A recharge ability is spent from its first use until a d6 brings it
 * back; an N/day ability is exhausted at N uses (a fight never lasts through a
 * rest, so "per short rest" and "per long rest" are the same count here).
 * Unlimited entries are always available with no label.
 */
export function actionAvailability(
  c: RunCombatant,
  entry: StatBlockEntry,
  list: StatBlockListKey,
): { available: boolean; label: string | null } {
  const { recharge, uses } = entry.structured;
  const tally = c.action_uses?.[actionUseKey(list, entry)];
  const used = tally ? tally.used : 0;
  if (recharge) {
    const range = recharge.min === recharge.max ? `${recharge.min}` : `${recharge.min}\u2013${recharge.max}`;
    return used >= 1
      ? { available: false, label: `Recharge ${range} \u00b7 spent` }
      : { available: true, label: `Recharge ${range}` };
  }
  if (uses) {
    const left = Math.max(0, uses.count - used);
    return { available: left > 0, label: `${left}/${uses.count} left` };
  }
  return { available: true, label: null };
}

/**
 * Start of a combatant's turn: each spent recharge ability rolls a d6 and comes
 * back on a result inside its range (SRD "Recharge X-Y"). Emitted after
 * `turn_started`. Returns the combatant unchanged when nothing was spent.
 */
function rechargeAtTurnStart(c: RunCombatant, deps: EncounterTurnDeps, events: EncounterTurnEvent[]): RunCombatant {
  if (!c.action_uses) return c;
  const spent = Object.entries(c.action_uses).filter(([, use]) => use.recharge && use.used >= 1);
  if (spent.length === 0) return c;
  const rollD6 = deps.rollD6 ?? (() => rollDie(6));
  const uses: Record<string, ActionUse> = { ...c.action_uses };
  for (const [action, use] of spent) {
    if (!use.recharge) continue;
    const roll = rollD6();
    if (rechargeSucceeds(roll, use.recharge)) {
      uses[action] = { ...use, used: 0 };
      events.push({ type: "action_recharged", instanceId: c.instance_id, action, roll });
    } else {
      events.push({ type: "recharge_failed", instanceId: c.instance_id, action, roll });
    }
  }
  return { ...c, action_uses: uses };
}

/** Re-roll everyone's initiative and hand the turn to the top of the freshly
 *  sorted order, refreshing that combatant's per-turn pools. */
function reshuffle(state: EncounterTurnState, deps: EncounterTurnDeps, events: EncounterTurnEvent[]): EncounterTurnState {
  const rolled = rollAllInitiativeValues(state.combatants, deps.rollD20);
  let combatants = state.combatants.map((c) => ({ ...c, initiative: rolled.get(c.instance_id) ?? c.initiative }));
  const sorted = sortCombatantsByInitiative(combatants);
  const activeIndex = findFirstActiveIndex(sorted);
  const first = sorted[activeIndex];
  if (first) {
    events.push({ type: "turn_started", instanceId: first.instance_id });
    combatants = replaceCombatant(combatants, rechargeAtTurnStart(refreshTurnStart(first), deps, events));
  }
  return { ...state, combatants, activeIndex };
}

/**
 * Adopt the result of a dying-rules calculation onto a player combatant, and
 * return only what it changed, for the write. An ordinary hit on a conscious
 * PC changes neither, and writing the runner's copy back anyway would undo a
 * condition the player toggled on their own sheet a moment earlier.
 */
function adoptDying(c: RunCombatant, saves: { successes: number; failures: number }, conditions: string[]): PartyMemberUpdate {
  const patch: PartyMemberUpdate = {};
  if (saves.successes !== c.death_saves.successes || saves.failures !== c.death_saves.failures) {
    patch.death_save_successes = saves.successes;
    patch.death_save_failures = saves.failures;
  }
  const had = new Set(c.conditions);
  if (conditions.length !== had.size || conditions.some((name) => !had.has(name))) {
    patch.conditions = [...conditions];
  }
  c.death_saves = { ...saves };
  c.conditions = [...conditions];
  return patch;
}

/** Drops the beast-form overlay. Real stats were never touched, so nothing needs restoring. */
function revertForm(c: RunCombatant, events: EncounterTurnEvent[]) {
  if (!c.wildshape) return;
  c.wildshape = undefined;
  persist(events, c, { wildshape_state: null });
}

// ── per-command handlers ─────────────────────────────────────────────────────

function nextTurn(state: EncounterTurnState, deps: EncounterTurnDeps, events: EncounterTurnEvent[]): EncounterTurnState {
  let combatants = state.combatants;
  const sorted = sortCombatantsByInitiative(combatants);
  const ending = sorted[state.activeIndex];
  const step = stepTurnIndex(sorted, state.activeIndex, 1);

  // Clear surprise on the combatant whose turn is ending — surprised creatures
  // can't act on their first turn, but the flag lifts at its end per 5e RAW.
  // (Cleared even when nobody is alive to take the next turn.)
  if (step && ending) events.push({ type: "turn_ended", instanceId: ending.instance_id });
  if (ending?.surprised) {
    combatants = replaceCombatant(combatants, { ...ending, surprised: false });
    events.push({ type: "surprise_cleared", instanceId: ending.instance_id });
  }
  if (!step) return { ...state, combatants };

  let next: EncounterTurnState = { ...state, combatants };
  if (step.wrapped) {
    next = { ...next, round: state.round + 1 };
    events.push({ type: "round_started", round: next.round });
    // New round: with random initiative on, re-roll and re-sort, then start
    // from the top of the new order (which also refreshes that combatant's
    // per-turn pools). Nothing below applies since the order just changed.
    if (state.randomizeInitiativeEachRound) {
      next = reshuffle(next, deps, events);
      events.push({ type: "check_events", reason: "turn" });
      return next;
    }
  }

  // At the start of each combatant's turn: refresh their reaction and
  // legendary action pool (5e RAW: reactions reset at start of YOUR turn).
  const starting = sortCombatantsByInitiative(next.combatants)[step.sortedIndex];
  if (starting) {
    events.push({ type: "turn_started", instanceId: starting.instance_id });
    next = {
      ...next,
      combatants: replaceCombatant(next.combatants, rechargeAtTurnStart(refreshTurnStart(starting), deps, events)),
    };
  }
  events.push({ type: "check_events", reason: "turn" });
  return { ...next, activeIndex: step.sortedIndex };
}

function adjustHp(c: RunCombatant, delta: number, critical: boolean | undefined, events: EncounterTurnEvent[]) {
  const pools = formHpPools({ current_hp: c.hp, max_hp: c.max_hp, temp_hp: c.temp_hp ?? 0 }, c.wildshape);
  let outcome: DyingOutcome = null;
  let dyingPatch: PartyMemberUpdate = {};
  if (delta < 0) {
    // Temp HP absorbs first, then the beast form, then real HP (5e RAW).
    if (usesDeathSaves(c)) {
      const out = damageOutcome({ pools, saves: c.death_saves, conditions: c.conditions }, { amount: -delta, critical });
      c.temp_hp = out.temp_hp || undefined;
      c.hp = out.current_hp;
      if (out.reverted) revertForm(c, events);
      else if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
      dyingPatch = adoptDying(c, out.saves, out.conditions);
      outcome = out.outcome;
    } else {
      const out = applyDamage(pools, -delta);
      c.temp_hp = out.temp_hp || undefined;
      c.hp = out.current_hp;
      if (out.reverted) revertForm(c, events);
      else if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
    }
  } else if (usesDeathSaves(c)) {
    const out = healingOutcome({ pools, saves: c.death_saves, conditions: c.conditions }, delta);
    outcome = out.outcome;
    if (out.outcome !== "healing-refused-dead") {
      c.hp = out.current_hp;
      if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
      dyingPatch = adoptDying(c, out.saves, out.conditions);
    }
  } else {
    const out = applyHealing(pools, delta);
    c.hp = out.current_hp;
    if (c.wildshape && out.beast_hp !== null) c.wildshape.beast_hp = out.beast_hp;
  }
  if (c.type === "player") {
    persist(events, c, {
      current_hp: c.hp,
      temp_hp: c.temp_hp ?? 0,
      wildshape_state: c.wildshape ?? null,
      ...dyingPatch,
    });
  }
  if (outcome !== null) events.push({ type: "dying_outcome", instanceId: c.instance_id, outcome });
  events.push({ type: "check_events", reason: "hp" });
}

function setHp(c: RunCombatant, value: number, events: EncounterTurnEvent[]) {
  const before = c.hp;
  let dyingPatch: PartyMemberUpdate = {};
  if (c.wildshape && c.wildshape.beast_max_hp !== null) {
    c.wildshape.beast_hp = Math.min(c.wildshape.beast_max_hp, Math.max(0, value));
    if (c.wildshape.beast_hp === 0) revertForm(c, events);
  } else {
    c.hp = Math.min(c.max_hp, Math.max(0, value));
    // A 2024 form ends when the character themself reaches 0.
    if (c.wildshape && c.hp === 0) revertForm(c, events);
    if (usesDeathSaves(c)) {
      // The DM setting HP directly still follows the rules: reaching 0 puts the
      // character down, and any HP above 0 stands them up with clean saves.
      if (c.hp <= 0 && before > 0) {
        const conditions = c.conditions.includes(UNCONSCIOUS) ? c.conditions : [...c.conditions, UNCONSCIOUS];
        dyingPatch = adoptDying(c, { successes: 0, failures: 0 }, conditions);
      } else if (c.hp > 0 && before <= 0) {
        const conditions = c.conditions.filter((x) => x !== UNCONSCIOUS);
        dyingPatch = adoptDying(c, { successes: 0, failures: 0 }, conditions);
      }
    }
  }
  persist(events, c, { current_hp: c.hp, wildshape_state: c.wildshape ?? null, ...dyingPatch });
  events.push({ type: "check_events", reason: "hp" });
}

// A combatant that was at full stays full at the new max so bumping a 2/2
// monster to 11 gives it 11/11, not 2/11. Edits the beast overlay when
// wildshaped, real max otherwise.
function setMaxHp(c: RunCombatant, value: number, events: EncounterTurnEvent[]) {
  const max = Math.max(1, Math.floor(value));
  if (c.wildshape && c.wildshape.beast_hp !== null && c.wildshape.beast_max_hp !== null) {
    const wasFull = c.wildshape.beast_hp >= c.wildshape.beast_max_hp;
    c.wildshape.beast_max_hp = max;
    c.wildshape.beast_hp = wasFull ? max : Math.min(c.wildshape.beast_hp, max);
    persist(events, c, { wildshape_state: { ...c.wildshape } });
  } else {
    const wasFull = c.hp >= c.max_hp;
    c.max_hp = max;
    c.hp = wasFull ? max : Math.min(c.hp, max);
    persist(events, c, { current_hp: c.hp, max_hp: max });
  }
  events.push({ type: "check_events", reason: "hp" });
}

/** Commands that edit one combatant through a working copy. */
function editCombatant(
  state: EncounterTurnState,
  instanceId: string,
  edit: (c: RunCombatant) => void,
): EncounterTurnState {
  const found = state.combatants.find((x) => x.instance_id === instanceId);
  if (!found) return state;
  const c = draft(found);
  edit(c);
  return { ...state, combatants: replaceCombatant(state.combatants, c) };
}

/**
 * Applies one command. Returns the new state and the events it raised, in the
 * order they happened. A command that finds nothing to act on returns the
 * input state itself and no events.
 */
export function reduceEncounterTurn(
  state: EncounterTurnState,
  command: EncounterTurnCommand,
  deps: EncounterTurnDeps = {},
): EncounterTurnResult {
  const events: EncounterTurnEvent[] = [];
  const done = (next: EncounterTurnState): EncounterTurnResult => ({ state: next, events });

  switch (command.type) {
    case "start_combat": {
      // Combat starts even if someone never got an initiative: they sort to the
      // end of the order and can be typed in there.
      const next: EncounterTurnState = { ...state, started: true, activeIndex: 0, round: 1 };
      events.push({ type: "round_started", round: 1 });
      const first = sortCombatantsByInitiative(next.combatants)[0];
      if (first) events.push({ type: "turn_started", instanceId: first.instance_id });
      return done(next);
    }
    case "next_turn":
      return done(nextTurn(state, deps, events));
    case "prev_turn": {
      const sorted = sortCombatantsByInitiative(state.combatants);
      const step = stepTurnIndex(sorted, state.activeIndex, -1);
      if (!step) return done(state);
      const round = step.wrapped && state.round > 1 ? state.round - 1 : state.round;
      return done({ ...state, round, activeIndex: step.sortedIndex });
    }
    case "reshuffle_initiative":
      return done(reshuffle(state, deps, events));
    case "set_initiative":
      return done(editCombatant(state, command.instanceId, (c) => {
        c.initiative = command.value;
      }));
    case "adjust_hp":
      return done(editCombatant(state, command.instanceId, (c) => adjustHp(c, command.delta, command.critical, events)));
    case "set_hp":
      return done(editCombatant(state, command.instanceId, (c) => setHp(c, command.value, events)));
    case "set_max_hp":
      return done(editCombatant(state, command.instanceId, (c) => setMaxHp(c, command.value, events)));
    case "set_temp_hp":
      return done(editCombatant(state, command.instanceId, (c) => {
        // Temp HP doesn't stack — take the higher value
        c.temp_hp = betterTempHp(c.temp_hp ?? 0, command.value) || undefined;
        persist(events, c, { temp_hp: c.temp_hp ?? 0 });
      }));
    case "toggle_condition":
      return done(editCombatant(state, command.instanceId, (c) => {
        c.conditions = c.conditions.includes(command.condition)
          ? c.conditions.filter((x) => x !== command.condition)
          : [...c.conditions, command.condition];
        persist(events, c, { conditions: [...c.conditions] });
      }));
    case "set_conditions":
      return done(editCombatant(state, command.instanceId, (c) => {
        c.conditions = [...command.conditions];
        persist(events, c, { conditions: [...c.conditions] });
      }));
    case "enter_wildshape":
      return done(editCombatant(state, command.instanceId, (c) => {
        // Player's real hp/max_hp/ac are NEVER modified — beast form is a self-contained overlay.
        // Reverting is simply clearing this field; nothing needs restoring.
        c.wildshape = { ...command.form };
        const patch: PartyMemberUpdate = { wildshape_state: { ...c.wildshape }, wildshapes_used: command.wildshapesUsed };
        const tempHp = command.tempHp ?? 0;
        // `tempHp` is what the edition grants on assuming a form (2024: druid
        // level, Moon 3x); 0 means nothing, and temp HP never stacks.
        if (tempHp > 0) {
          c.temp_hp = betterTempHp(c.temp_hp ?? 0, tempHp) || undefined;
          patch.temp_hp = c.temp_hp ?? 0;
        }
        persist(events, c, patch);
      }));
    case "revert_wildshape": {
      const found = state.combatants.find((x) => x.instance_id === command.instanceId);
      if (!found?.wildshape) return done(state);
      return done(editCombatant(state, command.instanceId, (c) => revertForm(c, events)));
    }
    case "toggle_surprised":
      return done(editCombatant(state, command.instanceId, (c) => {
        c.surprised = !c.surprised;
      }));
    case "toggle_reaction":
      return done(editCombatant(state, command.instanceId, (c) => {
        c.reactionUsed = !c.reactionUsed;
      }));
    case "prime_legendary_actions":
      return done({
        ...state,
        combatants: state.combatants.map((c) => {
          const cap = command.caps[c.instance_id];
          return cap && cap > 0 ? { ...c, legendary_action_cap: cap, legendary_actions_remaining: cap } : c;
        }),
      });
    case "spend_legendary_actions": {
      const found = state.combatants.find((x) => x.instance_id === command.instanceId);
      if (!found || typeof found.legendary_actions_remaining !== "number") return done(state);
      // Clamped at zero: spends what there is.
      const available = found.legendary_actions_remaining;
      const spent = Math.min(available, command.cost);
      events.push({ type: "legendary_spent", instanceId: command.instanceId, spent });
      return done(editCombatant(state, command.instanceId, (c) => {
        c.legendary_actions_remaining = available - spent;
      }));
    }
    case "mark_lair_fired":
      return done(
        state.lairFiredRounds.includes(state.round)
          ? state
          : { ...state, lairFiredRounds: [...state.lairFiredRounds, state.round] },
      );
    case "set_boss_mechanics":
      return done({ ...state, lairEnabled: command.lairEnabled, lairOwnerInstanceId: command.lairOwnerInstanceId });
    case "use_action":
      return done(editCombatant(state, command.instanceId, (c) => {
        const prior = c.action_uses?.[command.action];
        c.action_uses = {
          ...c.action_uses,
          [command.action]: { ...command.limit, used: (prior ? prior.used : 0) + 1 },
        };
      }));
    case "restore_action": {
      const found = state.combatants.find((x) => x.instance_id === command.instanceId);
      if (!found?.action_uses?.[command.action]) return done(state);
      return done(editCombatant(state, command.instanceId, (c) => {
        const prior = c.action_uses?.[command.action];
        if (prior) c.action_uses = { ...c.action_uses, [command.action]: { ...prior, used: 0 } };
      }));
    }
    case "remove_combatant": {
      // `activeIndex` indexes the sorted order, so re-derive the removed
      // entry's sorted position first and shift/clamp accordingly.
      const removedSortedIndex = sortCombatantsByInitiative(state.combatants).findIndex(
        (c) => c.instance_id === command.instanceId,
      );
      if (removedSortedIndex < 0) return done(state);
      const combatants = state.combatants.filter((c) => c.instance_id !== command.instanceId);
      const shifted = removedSortedIndex < state.activeIndex ? state.activeIndex - 1 : state.activeIndex;
      return done({ ...state, combatants, activeIndex: Math.min(shifted, Math.max(0, combatants.length - 1)) });
    }
  }
}
