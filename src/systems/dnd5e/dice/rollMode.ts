import type { DieSize } from "@/lib/dice/dice";
import type { RollModeKey } from "@/lib/dice/diceRules";

/** 5e roll modes: advantage / disadvantage apply to a single d20. */
export type RollMode = "normal" | "advantage" | "disadvantage";

/** Reads an option key as a 5e mode; a key 5e does not offer is a normal roll. */
export function toRollMode(key: RollModeKey): RollMode {
  return key === "advantage" || key === "disadvantage" ? key : "normal";
}

/**
 * Combine two roll modes per 5e RAW: any advantage + any disadvantage cancel to
 * normal, regardless of how many of each. Used to merge a player-chosen mode
 * (from the long-press / right-click picker) with a condition-imposed one.
 */
export function combineModes(a: RollModeKey, b: RollModeKey): RollMode {
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

/** The label tag for a mode: " (Adv)", " (Dis)" or nothing. */
export function modeSuffix(mode: RollModeKey): " (Adv)" | " (Dis)" | "" {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

/** The label with its "(Adv)" / "(Dis)" tag swapped for the mode actually rolled. */
export function withModeTag(label: string, mode: RollModeKey): string {
  const bare = label.replace(/ \((Adv|Dis)\)$/, "");
  return `${bare}${modeSuffix(mode)}`;
}
