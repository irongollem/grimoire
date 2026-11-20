// Keeping an ally's Rage by the book (#1021, `src/rules/fight/allies/rage.ts` holds the rule): the server looks at what each command changed
// on a raging party member and applies the verdict, because a blow that knocks the Barbarian out, an attack it makes, damage it takes and the
// end of its turn all arrive through different commands (a `take_turn`, a DM's `adjust_hp`, an opportunity attack, `next_turn`).
// What it applies are ordinary fight commands (`remove_condition`, `use_action`), so a Rage that ends is written to the sheet's conditions like any other change.

import { applyFightCommand, type FightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightDeps } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";
import { RAGING, ragingCondition } from "../../../src/rules/fight/allies/features.ts";
import { RAGE_KEPT, RAGE_STARTED, ragingOf, rageAfterCommand, rageGoesOutAtTurnEnd, tallied } from "../../../src/rules/fight/allies/rage.ts";
import { sortCombatantsByInitiative } from "../../../src/rules/combatantSort.ts";

/** The state after a run of fight commands, and the effects they raised. */
export interface Upkept {
  state: FightState;
  effects: FightEffect[];
}

/** Applies fight commands in order, folding the state and collecting the effects. */
function applyAll(state: FightState, commands: readonly FightCommand[], deps: FightDeps): Upkept {
  let next = state;
  const effects: FightEffect[] = [];
  for (const command of commands) {
    const result = applyFightCommand(next, command, deps);
    next = result.state;
    effects.push(...result.effects);
  }
  return { state: next, effects };
}

/** The Rage leaves `instanceId`: the condition comes off (written to the sheet by the reducer) and the DM's list of ended conditions says so. */
function endRage(state: FightState, instanceId: string, deps: FightDeps): Upkept {
  const cleared = applyAll(state, [
    { type: "remove_condition", instanceId, name: RAGING },
    { type: "restore_action", instanceId, action: RAGE_KEPT },
  ], deps);
  return { state: cleared.state, effects: [...cleared.effects, { type: "condition_ended", instanceId, name: RAGING, reason: "expired" }] };
}

/**
 * What a command did to the Rages in the fight. `before` is the fight as the command found it, `after` as it left it. A Rage that began in this command is
 * remembered (`RAGE_STARTED`, so a sheet that still says it is raging does not start it again once it has ended); one that was knocked out ends; a 2014
 * Rage that attacked or was hurt is tallied as kept for the turn's end; a 2024 Rage that attacked on the turn it would end is extended by taking the
 * condition off and putting it on again, which makes it a fresh one (the reducer keeps a condition armed that is applied over an armed one).
 */
export function settleRages(before: FightState, after: FightState, deps: FightDeps): Upkept {
  let state = after;
  const effects: FightEffect[] = [];
  for (const c of after.combatants) {
    const rage = ragingOf(c);
    if (rage === null) continue;
    const previous = before.combatants.find((x) => x.instance_id === c.instance_id);
    const commands: FightCommand[] = [];
    if (previous !== undefined && ragingOf(previous) === null && !tallied(c, RAGE_STARTED)) {
      commands.push({ type: "use_action", instanceId: c.instance_id, action: RAGE_STARTED, limit: {} });
    }
    const verdict = rageAfterCommand(previous, c);
    if (verdict !== null && verdict.do === "keep" && !tallied(c, RAGE_KEPT)) commands.push({ type: "use_action", instanceId: c.instance_id, action: RAGE_KEPT, limit: {} });
    if (verdict !== null && verdict.do === "extend") {
      commands.push({ type: "remove_condition", instanceId: c.instance_id, name: RAGING }, { type: "apply_condition", instanceId: c.instance_id, condition: ragingCondition(c.instance_id, "2024") });
    }
    const applied = applyAll(state, commands, deps);
    state = applied.state;
    effects.push(...applied.effects);
    if (verdict !== null && verdict.do === "end") {
      const ended = endRage(state, c.instance_id, deps);
      state = ended.state;
      effects.push(...ended.effects);
    }
  }
  return { state, effects };
}

/**
 * The end of the active creature's turn (`next_turn`): a 2014 Rage the Barbarian has not kept going since its last turn ends now, and the tally starts over.
 * Judged before the turn passes, on the creature whose turn it is.
 */
export function endOfTurnRage(state: FightState, deps: FightDeps): Upkept {
  const active = sortCombatantsByInitiative(state.combatants)[state.activeIndex];
  if (active === undefined || ragingOf(active) === null) return { state, effects: [] };
  if (rageGoesOutAtTurnEnd(active)) return endRage(state, active.instance_id, deps);
  return applyAll(state, [{ type: "restore_action", instanceId: active.instance_id, action: RAGE_KEPT }], deps);
}
