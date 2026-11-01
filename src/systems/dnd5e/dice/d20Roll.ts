import { ALL_DICE, formatCounts, keepOne, rollDie } from "@/lib/dice/dice";
import type { DieResult, DieSize, RollResult } from "@/lib/dice/dice";
import { modeSuffix, type RollMode } from "./rollMode";

/** Faces per die size, as rolled or as typed in from a physical roll. */
export type RolledFaces = Partial<Record<DieSize, number[]>>;

/**
 * Scores faces that were already rolled under the 5e d20 rules (pure). The one
 * copy of these rules: a digital roll and a physical roll typed in by a player
 * both come through here.
 * - A single d20 rolled with advantage / disadvantage has two faces: the higher /
 *   lower is kept and the other marked dropped. The mode does nothing for any
 *   other die, or for several d20s.
 * - Any kept d20 showing 20 is a crit, showing 1 a fumble. With several d20s and
 *   no mode, every d20 counts.
 * - The label gets " (Adv)" / " (Dis)" only when the pool holds a d20.
 * Sizes not in `counts` are ignored, so stray faces cannot inflate a total.
 */
export function scoreRoll(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode,
  faces: RolledFaces,
): RollResult {
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

  const suffix = (counts[20] ?? 0) > 0 ? modeSuffix(mode) : "";
  return {
    total: sum + modifier,
    label: formatCounts(counts, modifier) + suffix,
    modifier,
    breakdown,
    isCrit,
    isFumble,
  };
}

/** How many faces a pool needs: a lone d20 with a mode takes two. */
function facesNeeded(sides: DieSize, n: number, mode: RollMode): number {
  return sides === 20 && n === 1 && mode !== "normal" ? 2 : n;
}

/** A digital pool roll under the 5e d20 rules (pure, no sound): rolls the faces, then `scoreRoll`. */
export function rollDiceWithMode(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode,
): RollResult {
  const faces: RolledFaces = {};
  for (const sides of ALL_DICE) {
    const n = counts[sides] ?? 0;
    if (n > 0) faces[sides] = Array.from({ length: facesNeeded(sides, n, mode) }, () => rollDie(sides));
  }
  return scoreRoll(counts, modifier, mode, faces);
}
