import type { DieSize } from "@/lib/dice/dice";

/** 5e roll modes: advantage / disadvantage apply to a single d20. */
export type RollMode = "normal" | "advantage" | "disadvantage";

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
 * 5e ties Advantage/Disadvantage specifically to the d20: it is how ability
 * checks, saving throws and attack rolls resolve, and no other die is
 * described that way in the rules. "Roll two d6 and keep the higher" for a
 * damage die is a house rule, not RAW — offering the toggle on every die in
 * this row would imply a mechanic the game doesn't have. So only d20 gets it.
 */
export function advantageAppliesTo(sides: DieSize): boolean {
  return sides === 20;
}

/**
 * The mode actually applied for a given die click. A DM can leave the
 * Advantage/Disadvantage toggle set and then click d6; in 5e advantage applies
 * to the d20 only, so resolving it here means the roll never claims a mode that
 * did nothing.
 */
export function effectiveMode(sides: DieSize, mode: RollMode): RollMode {
  return advantageAppliesTo(sides) ? mode : "normal";
}

/** The label tag for a mode: " (Adv)", " (Dis)" or nothing. */
export function modeSuffix(mode: RollMode): " (Adv)" | " (Dis)" | "" {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

/** The label with its "(Adv)" / "(Dis)" tag swapped for the mode actually rolled. */
export function withModeTag(label: string, mode: RollMode): string {
  const bare = label.replace(/ \((Adv|Dis)\)$/, "");
  return `${bare}${modeSuffix(mode)}`;
}
