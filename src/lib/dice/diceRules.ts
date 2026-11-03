import { ALL_DICE, rollDie } from "./dice";
import type { DieSize, RollResult } from "./dice";

/**
 * The contract a game system's dice rules fill (#934). The neutral dice
 * surfaces (the dice tray, the chat roller, the quick-dice widget, the
 * physical-roll prompt, `usePromptedRoll`, the roll-option picker) know only
 * this; which system fills it is decided in one place, `@/systems/registry`.
 *
 * A system may offer roll options, such as 5e's advantage and disadvantage.
 * `NORMAL_ROLL` is the roll with no option, which every system has.
 */
export const NORMAL_ROLL = "normal";

/** `NORMAL_ROLL` or one of the active system's `RollOption` keys. */
export type RollModeKey = string;

/** Faces per die size, as rolled or as typed in from a physical roll. */
export type RolledFaces = Partial<Record<DieSize, number[]>>;

export interface RollOption {
  key: RollModeKey;
  /** "Advantage" */
  label: string;
  /** The short form for a segmented control: "Adv". */
  short: string;
  /** What the option does, for the physical-roll prompt: "keep higher". */
  hint: string;
  /** How the option reads in colour: a help or a hindrance. */
  tone: "success" | "danger";
}

export interface DiceRules {
  /** Options shown beside Normal, in display order. Empty when the system has none. */
  options: readonly RollOption[];
  /** Whether a roll option changes a roll of this die alone (5e: only a d20). */
  optionAppliesTo(sides: DieSize): boolean;
  /** How many faces a pool needs rolled or typed in (5e: a lone d20 with advantage takes two). */
  facesNeeded(sides: DieSize, count: number, mode: RollModeKey): number;
  /** Scores faces already rolled: total, breakdown, label, and the system's crit and fumble. */
  score(counts: Partial<Record<DieSize, number>>, modifier: number, mode: RollModeKey, faces: RolledFaces): RollResult;
  /** Merges two options picked from different sources into the one that applies. */
  combine(a: RollModeKey, b: RollModeKey): RollModeKey;
  /** Swaps a label's option tag for the option actually rolled, untagged where the option does nothing to this pool. */
  tagLabel(label: string, mode: RollModeKey, counts: Partial<Record<DieSize, number>>): string;
}

/** A digital roll under a system's rules (pure, no sound): rolls the faces it needs, then scores them. */
export function rollWithRules(
  rules: DiceRules,
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollModeKey,
): RollResult {
  const faces: RolledFaces = {};
  for (const sides of ALL_DICE) {
    const n = counts[sides] ?? 0;
    if (n > 0) faces[sides] = Array.from({ length: rules.facesNeeded(sides, n, mode) }, () => rollDie(sides));
  }
  return rules.score(counts, modifier, mode, faces);
}

/** A choice in a roll-option control: one of the system's options, or Normal (`tone: null`). */
export interface RollChoice {
  key: RollModeKey;
  label: string;
  short: string;
  tone: RollOption["tone"] | null;
}

/**
 * The choices a roll-option control shows, in reading order: the hindrances,
 * then Normal, then the helps (5e: Disadvantage / Normal / Advantage). Empty
 * when the system offers no options, so a control can hide itself.
 */
export function rollChoices(rules: DiceRules): RollChoice[] {
  if (rules.options.length === 0) return [];
  const normal: RollChoice = { key: NORMAL_ROLL, label: "Normal", short: "Normal", tone: null };
  const of = (tone: RollOption["tone"]) => rules.options.filter((o) => o.tone === tone);
  return [...of("danger"), normal, ...of("success")];
}
