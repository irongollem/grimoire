// What a creature's boons add to its rolls and its armour class (#1021): a spell such as Bless or Shield of Faith is put on each
// creature it targets as a condition named after the spell, carrying `grants` (`AppliedCondition.grants`). Everything that rolls an
// attack or a save, or reads an armour class, asks here, so a boon is read the same way by the server, the DM's runner, the solo
// table and the tactics' estimates.
//
// RULE bless (PHB 2014 and 2024 "Bless"): "Whenever a target makes an attack roll or a saving throw before the spell ends, the
// target can roll a d4 and add the number rolled to the attack roll or saving throw." The d4 is its own roll, after the d20, so a
// natural 20 or 1 is still read on the d20 alone.
// RULE shield-of-faith (PHB 2014 and 2024 "Shield of Faith"): "+2 bonus to AC for the duration."
// RULE combining-effects (PHB 2014 ch. 10 "Combining Magical Effects", PHB 2024 "Combining Effects"): the same spell's effects do not
// add together. A condition is one record per name, so a second Bless replaces the first; two different boons do add.
//
// Pure and edge-importable (relative `.ts` imports only).

import { parseExpression, parsedToCounts, type DieSize } from "../../lib/dice/dice.ts";
import type { AppliedCondition } from "../../types/condition.types.ts";

/** One boon's dice for a roll: what to roll and whether it adds or takes away. */
export interface BoonDie {
  /** The condition (spell) it comes from, for the roll's label: "Bless". */
  name: string;
  counts: Partial<Record<DieSize, number>>;
  /** A flat part of the expression ("1d4+1"), with the sign already applied. */
  flat: number;
  /** 1 adds the roll, -1 takes it away (a "-1d4"). */
  sign: 1 | -1;
  /** The mean the boon adds (negative when it takes away), for the tactics' estimates. */
  mean: number;
}

/** A boon's dice expression read with its sign; null for one that is not dice ("", "lots"), which adds nothing. */
export function boonDie(name: string, expression: string): BoonDie | null {
  const trimmed = expression.trim();
  const sign: 1 | -1 = trimmed.startsWith("-") ? -1 : 1;
  const parsed = parseExpression(trimmed.replace(/^[+-]/, ""));
  if (parsed === null) return null;
  const dice = parsed.terms.reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0);
  return { name, counts: parsedToCounts(parsed.terms), flat: sign * parsed.modifier, sign, mean: sign * (dice + parsed.modifier) };
}

/** The boons a creature adds to its attack rolls, or to its saving throws, in the order its conditions hold them. */
export function boonDice(conditions: readonly AppliedCondition[], roll: "attack" | "save"): BoonDie[] {
  return conditions.flatMap((c) => {
    const expression = c.grants === undefined ? undefined : c.grants[roll];
    if (expression === undefined) return [];
    const die = boonDie(c.name, expression);
    return die === null ? [] : [die];
  });
}

/** The mean its boons add to a roll of that kind: what the tactics add to a bonus when they weigh a chance. */
export function boonMean(conditions: readonly AppliedCondition[], roll: "attack" | "save"): number {
  return boonDice(conditions, roll).reduce((sum, d) => sum + d.mean, 0);
}

/** What its boons add to its armour class (Shield of Faith: 2). */
export function boonArmorClass(conditions: readonly AppliedCondition[]): number {
  return conditions.reduce((sum, c) => sum + (c.grants !== undefined && typeof c.grants.ac === "number" ? c.grants.ac : 0), 0);
}

/**
 * Rolls a creature's boons for one roll with the app's own die and returns what they add altogether: where nobody is asked for the
 * boon's die (a solo death save, whose player gave the d20 only). A caller that can ask a person rolls `boonDice` itself.
 */
export function rolledBoonTotal(conditions: readonly AppliedCondition[], roll: "attack" | "save", rollDie: (sides: number) => number): number {
  return boonDice(conditions, roll).reduce((sum, die) => {
    let faces = 0;
    for (const [sides, count] of Object.entries(die.counts)) for (let i = 0; i < (count === undefined ? 0 : count); i++) faces += rollDie(Number(sides));
    return sum + die.sign * faces + die.flat;
  }, 0);
}

/**
 * What a creature's boons add to a death saving throw it rolled `d20` on, rolled with the app's die: nothing on a natural 1 or 20, which
 * the d20 decides alone (SRD "Death Saving Throws"), else its save boons (PHB "Bless": a death saving throw is a saving throw).
 */
export function deathSaveBoonBonus(d20: number, conditions: readonly AppliedCondition[], rollDie: (sides: number) => number): number {
  return d20 === 1 || d20 === 20 ? 0 : rolledBoonTotal(conditions, "save", rollDie);
}
