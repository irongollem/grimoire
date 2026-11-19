// Rule 1 and 8, Rule 6: an attack as an option, from the best square that makes it possible, or unmeasured when no
// map can say.

import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { AttackStructure, MultiattackStep, StatBlockEntry } from "../../../../types/statBlock.types.ts";
import type { StatBlockListKey } from "../../../statBlock/parseAction.ts";
import { isIncapacitated } from "../../../conditions.ts";
import type { ReachCell } from "../reach.ts";
import { attackFrom, distanceFeet, DEFAULT_REACH_FEET, type Box, type ProvokedAttack } from "../sight.ts";
import { COVER_WORDS, exposurePhrase, movementPart, provokesPhrase, stepsPhrase } from "./phrases.ts";
import { boxOf, byPlace, cellsOf, compareExposure, COVER_RANK, emptyMovement, exposureAt, provokesOf, type Scene } from "./scene.ts";
import type { TurnOption, UsableAttack } from "./types.ts";

/** The farthest an attack reaches: its reach when it is a melee attack, its longest range when it is ranged. */
function farthestFeet(attack: AttackStructure): number {
  const reach = attack.delivery === "ranged" ? 0 : attack.reach === undefined ? DEFAULT_REACH_FEET : attack.reach;
  const range = attack.range === undefined ? 0 : attack.range.long === undefined ? attack.range.normal : attack.range.long;
  return Math.max(reach, range);
}

/** An attack entry resolved to what a position needs: the structure its first (or only) attack has. */
export interface Planned {
  list: StatBlockListKey;
  entry: StatBlockEntry;
  steps: MultiattackStep[] | null;
  /** The attack that governs where the creature may stand. */
  attack: AttackStructure;
}

/**
 * Rule 8: the attacks as the stored structure lets us tie them. A single attack stands as it is. A Multiattack stands
 * only when every step names another usable entry of the stat block that is itself an attack (the structure keeps
 * `{ action, count }`, so the steps are tied by name and nothing is parsed from prose); its first step's attack governs
 * where the creature may stand. A Multiattack with no steps, a step naming nothing, or a first step that is not an
 * attack is left out. Option lists ("one of the following breath weapons") are left out: an option has no entry name
 * of its own for a resolving command to name.
 */
export function plannedAttacks(attacks: readonly UsableAttack[]): Planned[] {
  const out: Planned[] = [];
  for (const { list, entry } of attacks) {
    const s = entry.structured;
    if (s.kind === "attack" && s.attack) {
      out.push({ list, entry, steps: null, attack: s.attack });
    } else if (s.kind === "multiattack" && s.multiattack && s.multiattack.length > 0) {
      const named = s.multiattack.map((step) => attacks.find((a) => a.entry.name === step.action));
      if (named.some((n) => n === undefined)) continue;
      const first = (named[0] as UsableAttack).entry.structured;
      if (!first.attack) continue;
      out.push({ list, entry, steps: s.multiattack, attack: first.attack });
    }
  }
  return out;
}

/**
 * Rule 1's choice of square for one (attack, target): among the squares the creature can end on that make the attack
 * possible, the one with, in order, fewest opportunity attacks provoked; not long range; not close combat; least cover
 * for the target; most cover for the mover; fewest feet; then top-left first. Null when no square makes it possible.
 */
export function bestAttackSquare(scene: Scene, planned: Planned, target: RunCombatant): { rc: ReachCell; facts: ReturnType<typeof attackFrom>; provokes: ProvokedAttack[] } | null {
  const targetBox = boxOf(target);
  const limit = farthestFeet(planned.attack);
  const blockers = scene.others.filter((o) => o.instance_id !== target.instance_id).map(boxOf);
  const hostileBoxes = scene.hostiles.map((h) => ({ box: boxOf(h), incapacitated: isIncapacitated(h.conditions) }));
  let best: { rc: ReachCell; facts: ReturnType<typeof attackFrom>; provokes: ProvokedAttack[] } | null = null;
  const better = (a: NonNullable<typeof best>, b: NonNullable<typeof best>): boolean => {
    const keys: [number, number][] = [
      [a.provokes.length, b.provokes.length],
      [Number(a.facts.longRange), Number(b.facts.longRange)],
      [Number(a.facts.closeCombat), Number(b.facts.closeCombat)],
      [COVER_RANK[a.facts.cover], COVER_RANK[b.facts.cover]],
    ];
    for (const [x, y] of keys) if (x !== y) return x < y;
    const exposure = compareExposure(exposureAt(scene, a.rc.cell), exposureAt(scene, b.rc.cell));
    if (exposure !== 0) return exposure < 0;
    return a.rc.feet !== b.rc.feet ? a.rc.feet < b.rc.feet : byPlace(a.rc.cell, b.rc.cell) < 0;
  };
  for (const rc of cellsOf(scene.reach)) {
    const attacker: Box = { anchor: rc.cell, footprint: scene.moverFootprint };
    if (distanceFeet(attacker, targetBox) > limit) continue;
    const facts = attackFrom({ attacker, attack: planned.attack, target: targetBox, occluders: scene.map.occluders, others: blockers, hostiles: hostileBoxes });
    if (!facts.possible) continue;
    const found = { rc, facts, provokes: provokesOf(scene, rc) };
    if (best === null || better(found, best)) best = found;
  }
  return best;
}

export function attackOption(scene: Scene, names: Map<string, string>, planned: Planned, target: RunCombatant, square: NonNullable<ReturnType<typeof bestAttackSquare>>): TurnOption {
  const { rc, facts, provokes } = square;
  const targetName = names.get(target.instance_id);
  const withWhat = planned.steps === null ? planned.entry.name : `${planned.entry.name} (${stepsPhrase(planned.steps)})`;
  const notes = [
    facts.cover === "none" ? null : `${targetName} has ${COVER_WORDS[facts.cover]}`,
    facts.longRange ? "at long range" : null,
    facts.closeCombat ? "with an enemy within 5 ft" : null,
  ].filter((n): n is string => n !== null);
  const feet = rc.feet;
  const stays = feet === 0 ? ` from where ${scene.mover.name} stands` : "";
  const exposure = exposureAt(scene, rc.cell);
  return {
    id: `attack:${planned.list}:${planned.entry.name}:${target.instance_id}`,
    kind: "attack",
    targetId: target.instance_id,
    destination: rc.cell,
    path: rc.path,
    feet,
    attack: { list: planned.list, action: planned.entry.name, steps: planned.steps, distanceFeet: facts.distanceFeet, cover: facts.cover, longRange: facts.longRange, closeCombat: facts.closeCombat, hitChance: null, expectedDamage: null },
    distanceFeet: null,
    provokes,
    exposure,
    summary: `${movementPart(feet)}${feet === 0 ? "A" : "a"}ttack ${targetName} with ${withWhat}${stays}${notes.map((n) => `; ${n}`).join("")}${exposurePhrase(names, exposure)}${provokesPhrase(names, provokes)}`,
  };
}

/** Rule 6: the shape when nothing can be measured. No movement, no facts, and a summary that says so. */
export function unmeasuredAttack(planned: Planned, target: RunCombatant): TurnOption {
  const withWhat = planned.steps === null ? planned.entry.name : `${planned.entry.name} (${stepsPhrase(planned.steps)})`;
  return {
    id: `attack:${planned.list}:${planned.entry.name}:${target.instance_id}`,
    kind: "attack",
    targetId: target.instance_id,
    ...emptyMovement(),
    attack: { list: planned.list, action: planned.entry.name, steps: planned.steps, distanceFeet: null, cover: null, longRange: null, closeCombat: null, hitChance: null, expectedDamage: null },
    summary: `Attack ${target.name} with ${withWhat}; the distance is not known, so no movement is offered`,
  };
}

/** Whether an attack of this list can still be made: the Action is spent by `action_used`, the Bonus Action by `bonus_used`. */
export function listIsOpen(mover: RunCombatant, list: StatBlockListKey): boolean {
  if (list === "actions") return mover.action_used !== true;
  if (list === "bonus_actions") return mover.bonus_used !== true;
  return false;
}
