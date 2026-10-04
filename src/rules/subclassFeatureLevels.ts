import type { RulesetKey } from "@/types/ruleset.types";

/**
 * The class levels at which each Player's Handbook class's subclass grants
 * features, per edition. A subclass is not on a fixed cadence: a 2014 fighter's
 * archetype adds features at 3, 7, 10, 15 and 18, a rogue's at 3, 9, 13 and 17,
 * a cleric's domain at 1, 2, 6, 8 and 17. The 2024 rules move every class's
 * subclass to level 3 and keep most of the later steps.
 *
 * Read by the archetype generator, so a generated subclass lands its features
 * where the book puts them rather than on one assumed rhythm.
 */
const PHB_2014: Readonly<Record<string, readonly number[]>> = {
  barbarian: [3, 6, 10, 14],
  bard: [3, 6, 14],
  cleric: [1, 2, 6, 8, 17],
  druid: [2, 6, 10, 14],
  fighter: [3, 7, 10, 15, 18],
  monk: [3, 6, 11, 17],
  paladin: [3, 7, 15, 20],
  ranger: [3, 7, 11, 15],
  rogue: [3, 9, 13, 17],
  sorcerer: [1, 6, 14, 18],
  warlock: [1, 6, 10, 14],
  wizard: [2, 6, 10, 14],
};

const PHB_2024: Readonly<Record<string, readonly number[]>> = {
  barbarian: [3, 6, 10, 14],
  bard: [3, 6, 14],
  cleric: [3, 6, 17],
  druid: [3, 6, 10, 14],
  fighter: [3, 7, 10, 15, 18],
  monk: [3, 6, 11, 17],
  paladin: [3, 7, 15, 20],
  ranger: [3, 7, 11, 15],
  rogue: [3, 9, 13, 17],
  sorcerer: [3, 6, 14, 18],
  warlock: [3, 6, 10, 14],
  wizard: [3, 6, 10, 14],
};

/** The book's subclass feature levels for a PHB class, or null for any other class. */
export function publishedSubclassFeatureLevels(
  className: string,
  ruleset: RulesetKey,
): readonly number[] | null {
  const table = ruleset === "2024" ? PHB_2024 : PHB_2014;
  return table[className.trim().toLowerCase()] ?? null;
}
