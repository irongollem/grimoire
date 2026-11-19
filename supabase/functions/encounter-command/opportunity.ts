// Opportunity attacks, resolved by the server (#1021). PHB 2014 ch. 9 "Opportunity Attacks" (SRD 5.2 the same): a
// hostile creature you can see that moves out of your reach may be struck by you, with your Reaction, right before it
// leaves; taking the Disengage action prevents it. `opportunityAttacks` (rules/fight/terrain/sight.ts) says WHO is
// provoked and at which step of a path; this file makes the creatures the server can play actually strike.
//
// Two callers: the `provoke` command (the browser asks before it moves a player's token) and `take_turn` (before a
// creature the server moves walks). Neither moves the mover: the first leaves it to the browser, the second does it
// after this returns. A strike is resolved with the mover standing on the square it is leaving, and the mover's
// recorded position is put back afterwards.
//
// A player character's attack is never rolled here (a player rolls their own dice): `take_turn` reports it as
// `provoked_player` and the browser offers it. A bystander and a creature with no stat block never strike.

import { NO_OCCLUDERS } from "../../../src/lib/battlemap/occlusion.ts";
import { combatantFootprint } from "../../../src/lib/battlemap/tokenFootprint.ts";
import { actionAvailability } from "../../../src/rules/encounterTurn.ts";
import { applyFightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightResult } from "../../../src/rules/fight/fightEvents.ts";
import type { FightEffect, FightState } from "../../../src/rules/fight/fightState.ts";
import { isDisengaged, isIncapacitated } from "../../../src/rules/fight/stances.ts";
import { withNumbers } from "../../../src/rules/fight/tactics/numbers.ts";
import { isHostileTo } from "../../../src/rules/fight/sides.ts";
import {
  DEFAULT_REACH_FEET,
  distanceFeet,
  opportunityAttacks,
  type Box,
  type ProvokedAttack,
} from "../../../src/rules/fight/terrain/sight.ts";
import { isOnBoard, type TurnOption, type UsableAttack } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { StatBlockListKey } from "../../../src/rules/statBlock/parseAction.ts";
import { statBlockOf } from "../_shared/fightStatBlocks.ts";
import { meleeReachFeet } from "../_shared/turnOptionsFor.ts";
import { FightCommandError } from "./commandError.ts";
import { applyResolvingCommand, knownArmorClass, type ResolveEnv } from "./resolve.ts";

export type ProvokeCommand = { type: "provoke"; moverId: string; path: Array<{ x: number; y: number }> };

export const MIN_PATH_CELLS = 2;
export const MAX_PATH_CELLS = 60;

export function isProvokeCommand(command: { type: string }): command is ProvokeCommand {
  return command.type === "provoke";
}

/** Shape only: that the mover exists is checked as the command is applied. */
export function validateProvokeCommand(command: Record<string, unknown>): void {
  if (typeof command.moverId !== "string" || command.moverId.length === 0) throw new FightCommandError(400, "provoke needs a moverId.");
  const { path } = command;
  if (!Array.isArray(path) || path.length < MIN_PATH_CELLS || path.length > MAX_PATH_CELLS) {
    throw new FightCommandError(400, `provoke needs a path of ${MIN_PATH_CELLS} to ${MAX_PATH_CELLS} cells.`);
  }
  for (const cell of path as unknown[]) {
    const c = cell as { x?: unknown; y?: unknown } | null;
    if (typeof c !== "object" || c === null || !Number.isInteger(c.x) || !Number.isInteger(c.y)) {
      throw new FightCommandError(400, "provoke: every cell of the path is a pair of whole numbers, x and y.");
    }
  }
}

/** The opportunity attacks a path provokes, worked out from the fight as it stands now (never from a plan made earlier). */
export function provokedBy(state: FightState, mover: RunCombatant, path: readonly { x: number; y: number }[], env: ResolveEnv): ProvokedAttack[] {
  const enemies = state.combatants
    .filter((c) => c.instance_id !== mover.instance_id && isOnBoard(c) && c.hp > 0 && isHostileTo(mover, c, env.factions))
    .map((c) => ({
      id: c.instance_id,
      box: { anchor: c.position as { x: number; y: number }, footprint: combatantFootprint(c) },
      reachFeet: meleeReachFeet(statBlockOf(c, env.sources)),
      reactionUsed: c.reactionUsed === true,
      incapacitated: isIncapacitated(c.conditions),
    }));
  return opportunityAttacks({
    path,
    moverFootprint: combatantFootprint(mover),
    enemies,
    occluders: env.map === null ? NO_OCCLUDERS : env.map.occluders,
    disengaged: isDisengaged(mover.conditions),
  });
}

interface Chosen {
  list: StatBlockListKey;
  action: string;
}

/**
 * The melee attack the creature makes with its Reaction: of its Actions that are plain melee attacks (no recharge, no
 * uses per day, so nothing needs spending) and reach the mover from where it is leaving, the one with the most
 * expected damage by the same estimate the turn picker uses (`withNumbers`). Without an armour class to weigh against,
 * the first printed one. Null when it has none.
 */
function chooseStrike(state: FightState, attacker: RunCombatant, mover: RunCombatant, env: ResolveEnv): Chosen | null {
  const block = statBlockOf(attacker, env.sources);
  if (block === null || attacker.position === null || attacker.position === undefined || mover.position === null || mover.position === undefined) return null;
  const from: Box = { anchor: attacker.position, footprint: combatantFootprint(attacker) };
  const to: Box = { anchor: mover.position, footprint: combatantFootprint(mover) };
  const feet = distanceFeet(from, to);
  const usable: UsableAttack[] = [];
  for (const entry of block.actions ?? []) {
    const a = entry.structured.kind === "attack" ? entry.structured.attack : undefined;
    if (a === undefined || a.delivery === "ranged") continue;
    if (entry.structured.recharge || entry.structured.uses) continue;
    if (!actionAvailability(attacker, entry, "actions").available) continue;
    if (feet > (a.reach === undefined ? DEFAULT_REACH_FEET : a.reach)) continue;
    usable.push({ list: "actions", entry });
  }
  if (usable.length === 0) return null;
  const options: TurnOption[] = usable.map(({ entry }) => ({
    id: `attack:actions:${entry.name}:${mover.instance_id}`,
    kind: "attack",
    targetId: mover.instance_id,
    destination: null, path: null, feet: null, distanceFeet: null, provokes: [], exposure: [],
    attack: { list: "actions", action: entry.name, steps: null, distanceFeet: feet, cover: null, longRange: false, closeCombat: false, hitChance: null, expectedDamage: null },
    summary: entry.name,
  }));
  const numbered = withNumbers(options, {
    attacks: usable, combatants: state.combatants, moverId: attacker.instance_id,
    armorClassOf: (t) => knownArmorClass(t, env.players), ruleset: state.ruleset,
  });
  let best = numbered[0];
  for (const o of numbered) {
    const have = best.attack?.expectedDamage ?? -1;
    const got = o.attack?.expectedDamage ?? -1;
    if (got > have) best = o;
  }
  return best.attack === null ? null : { list: "actions", action: best.attack.action };
}

export interface StrikeOptions {
  /** `take_turn`: a player who may strike is reported as `provoked_player`. `provoke`: a player rolls their own dice and is left out. */
  reportPlayers: boolean;
}

/**
 * Every opportunity attack the path provokes, the creatures the server can play striking in the order of the path.
 * Stops once the mover is at 0 hit points. The returned state has the strikers' Reactions spent and the mover where it was.
 */
export async function strikeOnLeaving(
  state: FightState,
  moverId: string,
  path: readonly { x: number; y: number }[],
  env: ResolveEnv,
  options: StrikeOptions,
): Promise<FightResult & { moverDown: boolean }> {
  const effects: FightEffect[] = [];
  let next = state;
  const moverNow = () => next.combatants.find((c) => c.instance_id === moverId) as RunCombatant;
  const origin = moverNow().position;
  for (const provoked of provokedBy(state, moverNow(), path, env)) {
    if (moverNow().hp <= 0) break;
    const attacker = next.combatants.find((c) => c.instance_id === provoked.enemyId);
    if (attacker === undefined || attacker.hp <= 0) continue;
    if (attacker.type === "player") {
      if (options.reportPlayers) effects.push({ type: "provoked_player", moverId, playerId: attacker.instance_id, step: provoked.step });
      continue;
    }
    if (attacker.bystander === true || statBlockOf(attacker, env.sources) === null) continue;
    // The mover stands on the square it is leaving while the blow is rolled: reach, cover and Prone read positions.
    const at = path[provoked.step];
    next = { ...next, combatants: next.combatants.map((c) => (c.instance_id === moverId ? { ...c, position: at } : c)) };
    const chosen = chooseStrike(next, attacker, moverNow(), env);
    if (chosen === null) {
      next = { ...next, combatants: next.combatants.map((c) => (c.instance_id === moverId ? { ...c, position: origin } : c)) };
      continue;
    }
    const spent = applyFightCommand(next, { type: "set_reaction_used", instanceId: attacker.instance_id, used: true }, env.fightDeps);
    next = spent.state;
    effects.push(...spent.effects, { type: "opportunity", attackerId: attacker.instance_id, targetId: moverId, step: provoked.step });
    const done = await applyResolvingCommand(
      next, { type: "resolve_attack", attackerId: attacker.instance_id, list: chosen.list, action: chosen.action, targetId: moverId }, env,
    );
    next = { ...done.state, combatants: done.state.combatants.map((c) => (c.instance_id === moverId ? { ...c, position: origin } : c)) };
    effects.push(...done.effects);
  }
  return { state: next, effects, moverDown: moverNow().hp <= 0 };
}

/** The `provoke` command: strikes on the way out, moves nothing. A mover already at 0 hit points is struck by nobody (`strikeOnLeaving` stops at 0). */
export async function applyProvoke(state: FightState, command: ProvokeCommand, env: ResolveEnv): Promise<FightResult> {
  const mover = state.combatants.find((c) => c.instance_id === command.moverId);
  if (!mover) throw new FightCommandError(400, `No creature "${command.moverId}" is in this fight.`);
  const { state: next, effects } = await strikeOnLeaving(state, command.moverId, command.path, env, { reportPlayers: false });
  return { state: next, effects };
}
