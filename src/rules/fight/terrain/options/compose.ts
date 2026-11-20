// The whole-turn options of one creature (#1202 story 3b): a short list of legal, described things it could do with
// its turn, each with an id. An AI DM picks one by id; it never produces a coordinate. This file offers options and
// does not rank them: which is best for a creature is tactics (#1203).
//
// Pure and edge-importable (relative `.ts` imports only). It stands on the terrain facts: `reachable` (where can it
// end), `attackFrom` and `coverBetween` (what can it attack from there, under what cover) and `opportunityAttacks`
// (what a path provokes).
//
// The rules below are app conventions over the PHB 2014 ch. 9 actions (the 2024 SRD 5.2 says the same of each). Every
// one is a named, commented block; the docs list them in `context/features/combat-encounters.md`.
//
// Not modelled: darkness and invisibility (so Hide only asks for total cover), standing up from Prone, a player's
// weapon reach (a player's is `DEFAULT_REACH_FEET`), any ranking of the options.

import { combatantFootprint } from "../../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { isIncapacitated } from "../../../conditions.ts";
import { cannotReactWhileSurprised, losesFirstTurnToSurprise } from "../../../initiative.ts";
import { isHostileTo } from "../../sides.ts";
import { reachTerrainOf, type FightMap } from "../battleMap.ts";
import { reachable, type ReachResult } from "../reach.ts";
import { distanceFeet } from "../sight.ts";
import { attackOption, bestAttackSquare, listIsOpen, plannedAttacks, unmeasuredAttack } from "./attacks.ts";
import { fleeOption, fleeSourceOf } from "./flee.ts";
import { approachOption, disengageOption, dodgeOption, hideOption } from "./movement.ts";
import { boxOf, exitsByCellOf, isLiving, isOnBoard, sizeOf, type Scene } from "./scene.ts";
import { breakFreeOptions, healOptionsOf, spellOptionsOf } from "./spellOptions.ts";
import { MAX_TURN_OPTIONS, type TurnOption, type TurnOptionsInput } from "./types.ts";

/**
 * The options of the creature whose id is `moverId`. Rules, in the order they are listed in the docs:
 * 1 Attack, 2 Dash, 3 Disengage, 4 Dodge, 5 Hide, 6 nothing measurable, 7 who gets nothing, 8 Multiattack, 9 the cap, 10 Flee,
 * 11 Spell (a damage spell cast from where the creature stands; see `spellTargeting.ts` for what it may be cast at),
 * 12 Break free (an ability check to end a condition a spell holds it in; see `breakFreeOptions`),
 * 13 Heal (a healing spell cast from where the creature stands at someone of its side who is hurt or down; see `healTargeting.ts`).
 *
 * Rule 7: a creature at 0 hit points, Incapacitated, or surprised on the first round of a 2014 fight (`round` given), gets an empty list. A creature whose Action is spent
 * (`action_used`) gets only what needs no Action: Bonus Action attacks (unless `bonus_used`) and a plain `move`
 * toward each hostile, since Dash, Disengage, Dodge and Hide are Actions and a spent Action's attacks are gone.
 */
export function turnOptions(input: TurnOptionsInput): TurnOption[] {
  const mover = input.combatants.find((c) => c.instance_id === input.moverId);
  if (!mover) throw new Error(`No combatant "${input.moverId}" in this fight`);
  if (!isLiving(mover) || isIncapacitated(mover.conditions)) return [];
  // PHB 2014 ch. 9 "Surprise": a surprised creature cannot move or take an action on its first turn.
  if (input.round !== undefined && losesFirstTurnToSurprise(mover, input.ruleset, input.round)) return [];

  const actionFree = mover.action_used !== true;
  const names = new Map(input.combatants.map((c) => [c.instance_id, c.name]));
  const planned = plannedAttacks(input.attacks.filter((a) => listIsOpen(mover, a.list)));
  const hostileTargets = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isLiving(c) && isHostileTo(mover, c, input.factions ?? []));

  const measurable = input.map !== null && input.budgetFeet !== null && isOnBoard(mover);
  const options: { option: TurnOption; nearness: number }[] = [];
  const fixed: TurnOption[] = [];

  if (!measurable) {
    // Rule 6: no map, no position or no known speed. One attack per (attack, hostile), nothing measured, plus Dodge.
    hostileTargets.forEach((t, i) => planned.forEach((p) => options.push({ option: unmeasuredAttack(p, t), nearness: i })));
    if (actionFree) fixed.push(dodgeOption(null));
    return capped(options, fixed, [...spellOptionsOf(input, mover, names, null), ...healOptionsOf(input, mover, names, null), ...breakFreeOptions(input, mover)]);
  }

  const map = input.map as FightMap;
  const budget = input.budgetFeet as number;
  const onBoard = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isOnBoard(c));
  const hostiles = onBoard.filter((c) => isLiving(c) && isHostileTo(mover, c, input.factions ?? []));
  const search = (budgetFeet: number) =>
    reachable({
      mover: { anchor: mover.position ?? null, footprint: combatantFootprint(mover), size: sizeOf(mover) },
      budgetFeet,
      terrain: reachTerrainOf(map, [mover, ...onBoard].map((c) => ({ anchor: boxOf(c).anchor, footprint: combatantFootprint(c) }))),
      others: onBoard.map((o) => ({ anchor: boxOf(o).anchor, footprint: combatantFootprint(o), size: sizeOf(o), hostile: isHostileTo(mover, o, input.factions ?? []), incapacitated: isIncapacitated(o.conditions) })),
      ruleset: input.ruleset,
    });
  const scene: Scene = {
    mover,
    moverFootprint: combatantFootprint(mover),
    map,
    reach: search(budget),
    others: onBoard,
    hostiles,
    enemies: hostiles.map((h) => ({ id: h.instance_id, box: boxOf(h), reachFeet: input.reachOf(h), reactionUsed: h.reactionUsed === true, cannotReact: cannotReactWhileSurprised(h, input.ruleset), incapacitated: isIncapacitated(h.conditions) })),
    ruleset: input.ruleset,
    exposureMemo: new Map(),
    exitsByCell: exitsByCellOf(map.exits),
  };
  let farWalk: ReachResult | undefined;
  const here = boxOf(mover);
  const nearness = (t: RunCombatant) => distanceFeet(here, boxOf(t));

  // Rule 1: an attack per (usable attack, living hostile) that some reachable square allows.
  const reached = new Set<string>();
  for (const t of hostiles) {
    for (const p of planned) {
      const square = bestAttackSquare(scene, p, t);
      if (square === null) continue;
      reached.add(t.instance_id);
      options.push({ option: attackOption(scene, names, p, t, square), nearness: nearness(t) });
    }
  }

  if (actionFree) {
    // Rule 2: a Dash toward each hostile no attack can reach this turn, searched with twice the budget (PHB 2014 ch. 9 "Dash").
    const dashReach = search(budget * 2);
    for (const t of hostiles) {
      if (reached.has(t.instance_id)) continue;
      const dash = approachOption("dash", scene, names, t, dashReach);
      if (dash) options.push({ option: dash, nearness: nearness(t) });
    }
    // Rule 3, 5, 10, 4: Disengage, Hide, Flee, Dodge keep their place under the cap.
    const disengage = disengageOption(scene);
    if (disengage) fixed.push(disengage);
    const hide = hideOption(scene, names);
    if (hide) fixed.push(hide);
    const flee = fleeOption(scene, names, dashReach, () => (farWalk ??= search(Number.POSITIVE_INFINITY)), fleeSourceOf(mover, input.combatants));
    if (flee) fixed.push(flee);
    fixed.push(dodgeOption(scene));
  } else {
    // Rule 7: the Action is spent, so only a plain move toward each hostile no attack reaches is left.
    for (const t of hostiles) {
      if (reached.has(t.instance_id)) continue;
      const move = approachOption("move", scene, names, t, scene.reach);
      if (move) options.push({ option: move, nearness: nearness(t) });
    }
  }
  return capped(options, fixed, [...spellOptionsOf(input, mover, names, { map }), ...healOptionsOf(input, mover, names, { map }), ...breakFreeOptions(input, mover)]);
}

/**
 * Rule 9: Dodge, Disengage, Hide and Flee stay; attacks, dashes and moves against the nearest targets are kept first, up to
 * `MAX_TURN_OPTIONS`. The spell options (rule 11), the heal options (rule 13) and the break-free options (rule 12) sit between the two and are not counted against that cap.
 */
function capped(options: { option: TurnOption; nearness: number }[], fixed: TurnOption[], spells: readonly TurnOption[]): TurnOption[] {
  const room = Math.max(0, MAX_TURN_OPTIONS - fixed.length);
  const byNearness = [...options].sort((a, b) => a.nearness - b.nearness);
  // Of equally near attacks the cut keeps a Multiattack before a single swing (an ally with several weapons lists a set of swings for each, and the sets are the better turns),
  // and the list keeps its own order.
  const isSet = (o: { option: TurnOption }): number => (o.option.attack !== null && o.option.attack.steps !== null ? 1 : 0);
  const survivors = new Set(byNearness.map((o, order) => ({ o, order })).sort((a, b) => a.o.nearness - b.o.nearness || isSet(b.o) - isSet(a.o) || a.order - b.order).slice(0, room).map((r) => r.o));
  const kept = byNearness.filter((o) => survivors.has(o)).map((o) => o.option);
  return [...kept, ...spells, ...fixed];
}
