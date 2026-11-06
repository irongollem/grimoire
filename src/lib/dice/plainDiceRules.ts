import { ALL_DICE, formatCounts } from "./dice";
import type { DieResult } from "./dice";
import { NORMAL_ROLL, type DiceRules } from "./diceRules";

/**
 * Dice with no game system's rules on them (#934): every die is summed, no roll
 * options, no criticals or fumbles. A system that adds none of its own (Generic)
 * rolls with these.
 */
export const plainDiceRules: DiceRules = {
  options: [],
  optionAppliesTo: () => false,
  facesNeeded: (_sides, count) => count,
  score(counts, modifier, _mode, faces) {
    const breakdown: DieResult[] = [];
    let sum = 0;
    for (const sides of ALL_DICE) {
      if ((counts[sides] ?? 0) === 0) continue;
      for (const val of faces[sides] ?? []) {
        breakdown.push({ val, dropped: false });
        sum += val;
      }
    }
    return { total: sum + modifier, label: formatCounts(counts, modifier), modifier, breakdown, isCrit: false, isFumble: false };
  },
  combine: () => NORMAL_ROLL,
  tagLabel: (label) => label,
};
