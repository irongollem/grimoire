import { ALL_DICE, formatCounts, keepOne } from "@/lib/dice/dice";
import type { DieResult, DieSize, RollResult } from "@/lib/dice/dice";
import type { RollModeKey, RolledFaces } from "@/lib/dice/diceRules";
import { modeSuffix, toRollMode } from "./rollMode";

/** 5e advantage and disadvantage change only a lone d20; on any other pool the mode does nothing. */
export function modeTakesEffect(counts: Partial<Record<DieSize, number>>): boolean {
  return (counts[20] ?? 0) === 1;
}

/**
 * Scores faces that were already rolled under the 5e d20 rules (pure). The one
 * copy of these rules: a digital roll and a physical roll typed in by a player
 * both come through here.
 * - A single d20 rolled with advantage / disadvantage has two faces: the higher /
 *   lower is kept and the other marked dropped. The mode does nothing for any
 *   other die, or for several d20s.
 * - Any kept d20 showing 20 is a crit, showing 1 a fumble. With several d20s and
 *   no mode, every d20 counts.
 * - The label gets " (Adv)" / " (Dis)" only where the mode takes effect: a lone d20.
 * Sizes not in `counts` are ignored, so stray faces cannot inflate a total.
 */
export function scoreRoll(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  modeKey: RollModeKey,
  faces: RolledFaces,
): RollResult {
  const mode = toRollMode(modeKey);
  const breakdown: DieResult[] = [];
  let sum = 0;
  let isCrit = false;
  let isFumble = false;

  for (const sides of ALL_DICE) {
    const need = counts[sides] ?? 0;
    const values = faces[sides] ?? [];
    if (need === 0) continue;
    if (sides === 20 && need === 1 && mode !== "normal" && values.length === 2) {
      const [kept, dropped] = keepOne(values, mode === "advantage" ? "highest" : "lowest");
      breakdown.push(kept, dropped);
      sum += kept.val;
      if (kept.val === 20) isCrit = true;
      if (kept.val === 1) isFumble = true;
      continue;
    }
    for (const val of values) {
      breakdown.push({ val, dropped: false });
      sum += val;
      if (sides === 20 && val === 20) isCrit = true;
      if (sides === 20 && val === 1) isFumble = true;
    }
  }

  const suffix = modeTakesEffect(counts) ? modeSuffix(mode) : "";
  return {
    total: sum + modifier,
    label: formatCounts(counts, modifier) + suffix,
    modifier,
    breakdown,
    isCrit,
    isFumble,
  };
}

/** How many faces a pool needs: a lone d20 with advantage or disadvantage takes two. */
export function facesNeeded(sides: DieSize, count: number, mode: RollModeKey): number {
  return sides === 20 && modeTakesEffect({ [sides]: count }) && toRollMode(mode) !== "normal" ? 2 : count;
}
