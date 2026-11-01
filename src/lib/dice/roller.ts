/**
 * Central neutral dice rolling entry point.
 *
 * All game dice rolls — initiative, attacks, skill checks, damage, death saves,
 * hit dice, crafting — must go through here (or the game system's roller) so
 * that sound and future effects (animation, roll history, etc.) are applied in
 * one place. Game-system roll rules (5e advantage) live in
 * `src/systems/dnd5e/dice/roller.ts`, which also goes through `playDiceRollSound`.
 *
 * Rule: never call rollDie / rollDice from @/lib/dice/dice directly in components.
 *       Never call playDiceRollSound directly in components.
 */

import { rollDie as _rollDie, rollDice as _rollDice } from "@/lib/dice/dice";
import { playDiceRollSound } from "@/lib/dice/diceAudio";
import type { DieSize, RollResult, ParsedExpression } from "@/lib/dice/dice";

export type { DieSize, RollResult } from "@/lib/dice/dice";

/**
 * Roll a full dice pool with modifier, no game rules. Plays a single sound.
 */
export function rollDice(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  options?: { mute?: boolean },
): RollResult {
  const result = _rollDice(counts, modifier);
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
