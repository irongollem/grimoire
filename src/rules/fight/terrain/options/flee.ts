// Rule 10: Flee, a Dash away (or off the map), and the condition that makes a creature flee one source.

import type { Cell } from "../../../../lib/battlemap/movement.ts";
import type { MapExit } from "../../../../lib/battlemap/mapExits.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { coverCells, type ReachCell, type ReachResult } from "../reach.ts";
import { distanceFeet, type Box, type ProvokedAttack } from "../sight.ts";
import { exposurePhrase, provokesPhrase, wayOffPhrase } from "./phrases.ts";
import { boxOf, byPlace, cellsOf, compareExposure, exposureAt, isLiving, provokesOf, type Scene } from "./scene.ts";
import type { TurnOption } from "./types.ts";

/**
 * Rule 10: Flee, a Dash away (PHB 2014 ch. 9 "Dash"). Only offered when there is a living hostile. The path may
 * provoke: unlike Disengage, this is a Dash. Where it ends depends on whether the map has ways off it (#1203):
 *
 * - A way off is reachable this turn (twice the budget): it ends on the nearest one by movement cost (ties: fewest
 *   opportunity attacks, then top-left) and leaves the map. A creature covers an exit when any square it fills is one.
 * - Ways off exist, none is reachable this turn: it ends on the reachable square that leaves the shortest walk to the
 *   nearest way off. That walk is measured along the cheapest path from where it stands (one search with no budget over
 *   the same terrain, so walls and rock count): the farthest square of that path the Dash reaches, and the rest of
 *   the path is what is left. Never straight-line distance through a wall. A way off nobody can walk to at all, or a
 *   Dash that cannot take even one step along the path, is no way off: the next rule.
 * - No way off: the reachable square farthest from its nearest living hostile; ties go to the most cover, then fewest
 *   opportunity attacks provoked, then fewest feet, then top-left first. Only when some square is farther from it than
 *   where the creature stands.
 */
export function fleeOption(scene: Scene, names: Map<string, string>, dashReach: ReachResult, walkAnywhere: () => ReachResult, from: RunCombatant | null): TurnOption | null {
  // RULE flee-by-spell: a creature made to flee one creature runs from that one alone (not from "its enemies"), and never by a
  // way off the map: it gets as far from the caster as it can, which a door at the caster's back would not do.
  const foes = from === null ? scene.hostiles : scene.others.filter((c) => c.instance_id === from.instance_id);
  if (dashReach.start === null || foes.length === 0) return null;
  if (from === null && scene.map.exits.length > 0) {
    const way = fleeByWayOff(scene, names, dashReach, walkAnywhere);
    if (way !== null) return way;
  }
  const nearest = (box: Box) => Math.min(...foes.map((h) => distanceFeet(box, boxOf(h))));
  const hereAway = nearest({ anchor: dashReach.start, footprint: scene.moverFootprint });
  let best: { rc: ReachCell; away: number; provokes: ProvokedAttack[] } | null = null;
  for (const rc of cellsOf(dashReach)) {
    const away = nearest({ anchor: rc.cell, footprint: scene.moverFootprint });
    const found = { rc, away, provokes: provokesOf(scene, rc) };
    if (best === null || away > best.away) {
      best = found;
    } else if (away === best.away) {
      const exposure = compareExposure(exposureAt(scene, rc.cell), exposureAt(scene, best.rc.cell));
      if (exposure < 0 || (exposure === 0 && (found.provokes.length < best.provokes.length || (found.provokes.length === best.provokes.length && rc.feet < best.rc.feet)))) best = found;
    }
  }
  if (best === null || best.away <= hereAway) return null;
  const exposure = exposureAt(scene, best.rc.cell);
  return {
    id: "flee",
    kind: "flee",
    targetId: null,
    destination: best.rc.cell,
    path: best.rc.path,
    feet: best.rc.feet,
    attack: null,
    distanceFeet: null,
    provokes: best.provokes,
    exposure,
    leavesMap: false,
    exitLabel: null,
    exitKind: null,
    summary: `Flee: dash ${best.rc.feet} ft away, ending ${best.away} ft from ${from === null ? "the nearest enemy" : from.name}${exposurePhrase(names, exposure)}${provokesPhrase(names, best.provokes)}`,
  };
}

/**
 * RULE flee-by-spell (app convention implementing SRD 5.1 Fear: "must take the Dash action and move away from you by the
 * safest available route on each of its turns, unless there is nowhere to move"; Turn Undead: "must spend its turns trying to
 * move as far away from you as it can"): the creature a condition on the mover makes it flee, or null. It is the source of the
 * first condition whose source says `mustFlee`, and only while that creature is still in the fight and standing; once it is
 * gone or down the creature is no longer forced. Not built: dropping what it holds, or withholding its reactions (Turn Undead says it cannot take them); `reactionUsed` is read in this file only to tell whether an enemy still has its reaction.
 */
export function fleeSourceOf(mover: RunCombatant, combatants: readonly RunCombatant[]): RunCombatant | null {
  for (const c of mover.conditions) {
    if (c.source?.mustFlee !== true) continue;
    const source = combatants.find((x) => x.instance_id === c.source?.id);
    if (source !== undefined && source.instance_id !== mover.instance_id && isLiving(source)) return source;
  }
  return null;
}

/** The exit a creature standing with its anchor here covers, the named one when it covers several; null when it covers none. */
function exitCovered(scene: Scene, anchor: Cell): MapExit | null {
  let found: MapExit | null = null;
  for (const c of coverCells(anchor, scene.moverFootprint)) {
    const exit = scene.exitsByCell.get(`${c.x},${c.y}`);
    if (exit === undefined) continue;
    if (exit.label !== null) return exit;
    if (found === null) found = exit;
  }
  return found;
}

/** Rule 10, the two ways-off cases (see `fleeOption`). Null when no way off is within any walk, or the Dash cannot start one. */
function fleeByWayOff(scene: Scene, names: Map<string, string>, dashReach: ReachResult, walkAnywhere: () => ReachResult): TurnOption | null {
  // 1. A way off the Dash reaches: the nearest by cost.
  let leave: { rc: ReachCell; exit: MapExit; provokes: ProvokedAttack[] } | null = null;
  for (const rc of cellsOf(dashReach)) {
    const exit = exitCovered(scene, rc.cell);
    if (exit === null) continue;
    const found = { rc, exit, provokes: provokesOf(scene, rc) };
    if (
      leave === null || rc.feet < leave.rc.feet ||
      (rc.feet === leave.rc.feet && (found.provokes.length < leave.provokes.length || (found.provokes.length === leave.provokes.length && byPlace(rc.cell, leave.rc.cell) < 0)))
    ) leave = found;
  }
  if (leave !== null) {
    const { rc, exit, provokes } = leave;
    const way = wayOffPhrase(exit.kind, exit.label, true);
    return {
      id: "flee",
      kind: "flee",
      targetId: null,
      destination: rc.cell,
      path: rc.path,
      feet: rc.feet,
      attack: null,
      distanceFeet: null,
      provokes,
      exposure: exposureAt(scene, rc.cell),
      leavesMap: true,
      exitLabel: exit.label,
      exitKind: exit.kind,
      summary: `Flee: ${rc.feet === 0 ? "" : `dash ${rc.feet} ft and `}leave the map ${way}${provokesPhrase(names, provokes)}`,
    };
  }
  // 2. None this turn: along the cheapest whole walk to the nearest way off, as far as the Dash goes.
  const far = walkAnywhere();
  let goal: ReachCell | null = null;
  for (const rc of cellsOf(far)) {
    if (exitCovered(scene, rc.cell) === null) continue;
    if (goal === null || rc.feet < goal.feet || (rc.feet === goal.feet && byPlace(rc.cell, goal.cell) < 0)) goal = rc;
  }
  if (goal === null) return null;
  const exit = exitCovered(scene, goal.cell) as MapExit;
  const key = (c: Cell) => `${c.x},${c.y}`;
  // The last square of the walk the Dash can end on (the start, index 0, is no progress).
  let at = -1;
  for (let i = goal.path.length - 1; i > 0; i--) {
    if (dashReach.cells.has(key(goal.path[i]))) { at = i; break; }
  }
  if (at < 0) return null;
  const rc = dashReach.cells.get(key(goal.path[at])) as ReachCell;
  const walked = far.cells.get(key(rc.cell));
  const short = walked === undefined ? goal.feet - rc.feet : goal.feet - walked.feet;
  const provokes = provokesOf(scene, rc);
  return {
    id: "flee",
    kind: "flee",
    targetId: null,
    destination: rc.cell,
    path: rc.path,
    feet: rc.feet,
    attack: null,
    distanceFeet: null,
    provokes,
    exposure: exposureAt(scene, rc.cell),
    leavesMap: false,
    exitLabel: null,
    exitKind: null,
    summary: `Flee: dash ${rc.feet} ft toward ${wayOffPhrase(exit.kind, exit.label, false)}, ${short} ft short of it${provokesPhrase(names, provokes)}`,
  };
}
