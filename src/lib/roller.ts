/**
 * Central dice rolling entry point.
 *
 * All game dice rolls — initiative, attacks, skill checks, damage, death saves,
 * hit dice, crafting — must go through this module so that sound and future
 * effects (animation, roll history, etc.) are applied in one place.
 *
 * Rule: never call rollDie / rollDice from @/lib/dice directly in components.
 *       Never call playDiceRollSound directly in components.
 *       Import from here instead.
 */

import { rollDie as _rollDie, rollDice as _rollDice } from "@/lib/dice";
import { playDiceRollSound } from "@/lib/diceAudio";
import type { DieSize, RollMode, RollResult, ParsedExpression } from "@/lib/dice";

export type { DieSize, RollMode, RollResult } from "@/lib/dice";

/**
 * Combine two roll modes per 5e RAW: any advantage + any disadvantage cancel to
 * normal, regardless of how many of each. Used to merge a player-chosen mode
 * (from the long-press / right-click picker) with a condition-imposed one.
 */
export function combineModes(a: RollMode, b: RollMode): RollMode {
  const adv = a === "advantage" || b === "advantage";
  const dis = a === "disadvantage" || b === "disadvantage";
  if (adv && dis) return "normal";
  if (adv) return "advantage";
  if (dis) return "disadvantage";
  return "normal";
}

/**
 * Roll a full dice pool with modifier and optional advantage/disadvantage.
 * Plays a single sound. Returns a full RollResult (total, breakdown, isCrit, isFumble, label).
 */
export function rollDice(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode = "normal",
  options?: { mute?: boolean },
): RollResult {
  const result = _rollDice(counts, modifier, mode);
  if (!options?.mute) playDiceRollSound(result.isCrit, result.isFumble);
  return result;
}

/**
 * Roll all dice in a ParsedExpression, returning total + per-die breakdown.
 * Plays a single sound. No crit/fumble (damage rolls don't produce those).
 */
export function rollParsed(parsed: ParsedExpression): { total: number; breakdown: { val: number; dropped: boolean }[] } {
  const breakdown: { val: number; dropped: boolean }[] = [];
  let total = parsed.modifier;
  for (const term of parsed.terms) {
    for (let i = 0; i < term.count; i++) {
      const val = _rollDie(term.sides);
      total += val;
      breakdown.push({ val, dropped: false });
    }
  }
  playDiceRollSound(false, false);
  return { total, breakdown };
}
