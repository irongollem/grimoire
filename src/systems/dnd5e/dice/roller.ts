import { playDiceRollSound } from "@/lib/dice/diceAudio";
import type { DieSize, RollResult } from "@/lib/dice/dice";
import { rollDiceWithMode as rollPure } from "./d20Roll";
import type { RollMode } from "./rollMode";

export type { RollMode } from "./rollMode";

/**
 * Sound-wrapped 5e roll: a pool with a modifier and optional advantage /
 * disadvantage (rules in `./d20Roll`). Plays a single sound, crit/fumble aware.
 * Neutral rolls without 5e rules go through `@/lib/dice/roller`.
 */
export function rollDiceWithMode(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode = "normal",
  options?: { mute?: boolean },
): RollResult {
  const result = rollPure(counts, modifier, mode);
  if (!options?.mute) playDiceRollSound(result.isCrit, result.isFumble);
  return result;
}
