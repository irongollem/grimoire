// The numbers on an attack option (#1203): the chance to hit and the damage to expect, so a picker (or a model) can
// weigh one attack against another. A turn option carries `hitChance` and `expectedDamage` as null until this fills
// them in.
//
// What is a book rule here: a natural 1 always misses and a natural 20 always hits (PHB 2014 ch. 9 "Rolling 1 or 20"),
// advantage and disadvantage on the d20 (ch. 9 "Advantage and Disadvantage"), long range and an enemy within 5 feet
// both imposing disadvantage on a ranged attack (ch. 9 "Ranged Attacks"), cover's bonus to AC (ch. 9 "Cover"), and a
// critical hit rolling the damage dice twice (ch. 9 "Critical Hits"). What is app convention: reading a stat block's
// structure to average it, the mean over a Multiattack, and what is left out.
//
// Not modelled: damage resistance, immunity and vulnerability (the numbers are the damage as printed), a hit that is an
// automatic critical against a Paralyzed or Unconscious target, riders that need a saving throw, a creature that
// attacks with a weapon it has not got. Nothing is rounded here; only a summary line rounds, for display.
//
// A spell option (#1021) is weighed with the same arithmetic: an attack spell is `oneAttack` on its entry, a save spell
// is the chance each target fails its save (a natural 20 does not save on a saving throw; PHB 2014 ch. 7 "Saving
// Throws") times the damage, plus the chance it succeeds times half of it when the spell halves. A spell attack is
// weighed with no cover and no enemy-within-5-feet penalty, and a save with no cover bonus: none of the three is known
// to the option.
//
// Pure and edge-importable (relative `.ts` imports only).

import { parseExpression } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackStructure, DamagePart, SaveAbility } from "../../../types/statBlock.types.ts";
import { attackRollMode } from "../../combat/attackRoll.ts";
import { autoFailsSave, saveRollMode } from "../../combat/savingThrow.ts";
import { getExhaustionD20Penalty } from "../../conditions.ts";
import { coverBonus, DEFAULT_REACH_FEET } from "../terrain/sight.ts";
import type { CastNow } from "../spells/castNow.ts";
import type { TurnOption, TurnOptionAttack, TurnOptionSpell, UsableAttack } from "../terrain/turnOptions.ts";

export interface NumbersContext {
  /** The mover's usable attacks: where an option's entry, and a Multiattack's steps, are found by name. */
  attacks: readonly UsableAttack[];
  combatants: readonly RunCombatant[];
  moverId: string;
  /** A target's armor class, or null when it is not known: both numbers of its options stay null. */
  armorClassOf: (target: RunCombatant) => number | null;
  ruleset: RulesetKey;
  /** The mover's castable spells: where a spell option's entry is found. Left out for a creature that casts none. */
  spells?: readonly CastNow[];
  /** A target's bonus on a save of this ability, or null when it is not known (the chance to fail is then `UNKNOWN_SAVE_FAIL_CHANCE`). */
  saveBonusOf?: (target: RunCombatant, ability: SaveAbility) => number | null;
}

/** APP CONVENTION: a target whose save bonus is not known (a character the server could not read) fails half the time. */
export const UNKNOWN_SAVE_FAIL_CHANCE = 0.5;

/**
 * The chance one saving throw fails against `dc`: the faces that reach it with `bonus` save, and unlike an attack roll a
 * natural 20 is no automatic success and a 1 no automatic failure (PHB 2014 ch. 7 "Saving Throws"). Need 14 with +0:
 * faces 14 to 20 are 7 of 20 saving, so it fails 65% of the time.
 */
export function chanceToFail(bonus: number, dc: number, mode: RollMode): number {
  const saving = Math.min(20, Math.max(0, 21 - (dc - bonus))) / 20;
  return 1 - withMode(saving, mode);
}

/**
 * The chance one d20 attack hits: the faces that reach `ac` with `bonus`, a natural 20 always, a natural 1 never
 * (PHB 2014 ch. 9 "Rolling 1 or 20"). Need 9 on the die: faces 9 to 19 are 11, plus the 20 is 12 of 20.
 */
export function chanceToHit(bonus: number, ac: number, mode: RollMode): number {
  const need = ac - bonus;
  const faces = Math.max(0, 20 - Math.max(need, 2)) + 1;
  return withMode(faces / 20, mode);
}

/** The chance a natural 20 shows on the kept die. */
export function chanceOfNatural20(mode: RollMode): number {
  return withMode(1 / 20, mode);
}

/** Advantage keeps the better of two dice (1 - (1 - p)^2), disadvantage the worse (p^2). PHB 2014 ch. 9. */
function withMode(p: number, mode: RollMode): number {
  if (mode === "advantage") return 1 - (1 - p) * (1 - p);
  if (mode === "disadvantage") return p * p;
  return p;
}

/** The average of what a hit rolls, and of its dice alone (a critical rolls those twice). Null when a part cannot be read. */
function averageOf(parts: readonly DamagePart[]): { all: number; diceOnly: number } | null {
  let all = 0;
  let diceOnly = 0;
  for (const part of parts) {
    const parsed = parseExpression(part.dice);
    if (parsed === null) return null;
    const dice = parsed.terms.reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0);
    all += dice + parsed.modifier;
    diceOnly += dice;
  }
  return { all, diceOnly };
}

/** The mode of one attack from one square: the existing rule, plus disadvantage at long range. */
function modeOf(attack: AttackStructure, facts: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ruleset: RulesetKey): RollMode {
  const distance = facts.distanceFeet;
  const near = distance !== null && distance <= DEFAULT_REACH_FEET;
  // A melee-or-ranged attack is thrown when the target is beyond the reach it would swing at.
  const reach = attack.reach === undefined ? DEFAULT_REACH_FEET : attack.reach;
  const thrown = attack.delivery === "melee_or_ranged" && distance !== null && distance > reach;
  const delivery = attack.delivery === "ranged" || thrown ? "ranged" : "melee";
  return attackRollMode({
    attackerConditions: mover.conditions,
    targetConditions: target.conditions,
    delivery,
    // Prone asks whether the attacker is within 5 ft of the target; a ranged attack's close combat asks whether any enemy is.
    withinFiveFeet: near || (delivery === "ranged" && facts.closeCombat === true),
    ruleset,
    ...(facts.longRange === true && delivery === "ranged" ? { dmMode: "disadvantage" as const } : {}),
  }).mode;
}

/** One attack's hit chance and the damage it adds (null when a damage part cannot be read). */
function oneAttack(attack: AttackStructure, facts: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ac: number, ruleset: RulesetKey): { hit: number; damage: number | null } {
  // Total cover cannot be targeted at all; no attack option is ever made from such a square, so this is only a guard.
  if (facts.cover === "total") return { hit: 0, damage: 0 };
  const mode = modeOf(attack, facts, mover, target, ruleset);
  // Cover adds to the target's AC (PHB 2014 ch. 9 "Cover"); the 2024 exhaustion penalty lowers the roll.
  const bonus = attack.bonus + getExhaustionD20Penalty(mover.conditions, ruleset);
  const hit = chanceToHit(bonus, ac + coverBonus(facts.cover === null ? "none" : facts.cover).ac, mode);
  const avg = averageOf(attack.hit);
  // A critical hit rolls the dice twice: the extra roll is the dice alone, on a natural 20 (ch. 9 "Critical Hits").
  const damage = avg === null ? null : hit * avg.all + chanceOfNatural20(mode) * avg.diceOnly;
  return { hit, damage };
}

function numbersFor(attack: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ac: number, ctx: NumbersContext): { hitChance: number; expectedDamage: number | null } | null {
  const named = (name: string) => ctx.attacks.find((a) => a.entry.name === name)?.entry.structured.attack;
  const steps = attack.steps ?? [{ action: attack.action, count: 1 }];
  let swings = 0;
  let hits = 0;
  let damage: number | null = 0;
  for (const step of steps) {
    const structure = named(step.action);
    if (structure === undefined) return null;
    const one = oneAttack(structure, attack, mover, target, ac, ctx.ruleset);
    swings += step.count;
    hits += one.hit * step.count;
    damage = damage === null || one.damage === null ? null : damage + one.damage * step.count;
  }
  // A Multiattack's hit chance is the mean over its attacks, each weighted by how many it makes.
  return swings === 0 ? null : { hitChance: hits / swings, expectedDamage: damage };
}

/** A spell option's numbers, or null when a target's armor class or the damage cannot be read (the option stays unnumbered). */
function spellNumbers(spell: TurnOptionSpell, mover: RunCombatant, ctx: NumbersContext): { hitChance: number; expectedDamage: number | null } | null {
  const cast = ctx.spells?.find((s) => s.spell === spell.name && s.castLevel === spell.castLevel);
  if (cast === undefined) return null;
  const targets = spell.targetIds.flatMap((id) => ctx.combatants.find((c) => c.instance_id === id) ?? []);
  if (targets.length === 0 || targets.length !== spell.targetIds.length) return null;
  let chance = 0;
  let damage: number | null = 0;
  const attack = cast.entry.structured.attack;
  const save = cast.entry.structured.save;
  if (cast.kind === "attack" && attack !== undefined) {
    const facts: TurnOptionAttack = { list: "actions", action: spell.name, steps: null, distanceFeet: spell.distanceFeet, cover: null, longRange: null, closeCombat: null, hitChance: null, expectedDamage: null };
    for (const target of targets) {
      const ac = ctx.armorClassOf(target);
      if (ac === null) return null;
      const one = oneAttack(attack, facts, mover, target, ac, ctx.ruleset);
      chance += one.hit;
      damage = damage === null || one.damage === null ? null : damage + one.damage;
    }
  } else if (cast.kind === "save" && save !== undefined) {
    const avg = averageOf(save.fail);
    for (const target of targets) {
      const bonus = ctx.saveBonusOf === undefined ? null : ctx.saveBonusOf(target, save.ability);
      let fails: number;
      if (autoFailsSave(target.conditions, save.ability)) fails = 1;
      else if (bonus === null) fails = UNKNOWN_SAVE_FAIL_CHANCE;
      else fails = chanceToFail(bonus, save.dc, saveRollMode({ conditions: target.conditions, ability: save.ability, ruleset: ctx.ruleset }).mode);
      chance += fails;
      damage = damage === null || avg === null ? null : damage + fails * avg.all + (1 - fails) * (save.success === "half" ? avg.all / 2 : 0);
    }
  } else {
    return null;
  }
  return { hitChance: chance / targets.length, expectedDamage: damage };
}

/** The options with the numbers filled in on each attack and each spell. Other options pass through untouched. */
export function withNumbers(options: readonly TurnOption[], ctx: NumbersContext): TurnOption[] {
  const mover = ctx.combatants.find((c) => c.instance_id === ctx.moverId);
  return options.map((option) => {
    if (option.kind === "spell" && option.spell !== undefined && option.spell !== null && mover !== undefined) {
      const found = spellNumbers(option.spell, mover, ctx);
      return found === null ? option : { ...option, spell: { ...option.spell, hitChance: found.hitChance, expectedDamage: found.expectedDamage } };
    }
    if (option.kind !== "attack" || option.attack === null || mover === undefined) return option;
    const target = ctx.combatants.find((c) => c.instance_id === option.targetId);
    if (target === undefined) return option;
    const ac = ctx.armorClassOf(target);
    if (ac === null) return option;
    const found = numbersFor(option.attack, mover, target, ac, ctx);
    return found === null ? option : { ...option, attack: { ...option.attack, hitChance: found.hitChance, expectedDamage: found.expectedDamage } };
  });
}
