/**
 * Rogue class feature progression — SRD 5.1
 * No spellcasting (Arcane Trickster is a third-caster exception, handled in spell.types.ts).
 * Extra ASI schedule: 4, 8, 10, 12, 16, 19. Expertise at levels 1 and 6.
 */

import { SKILL_NAMES } from "../types";
import type { ClassLevelData, ClassStep, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROGUE_SUBCLASSES = [
  "Thief",
  "Assassin",
  "Arcane Trickster",
] as const;

// All skills + Thieves' Tools (valid Expertise targets)
const EXPERTISE_OPTIONS = [...SKILL_NAMES, "Thieves' Tools"] as const;

// Sneak Attack dice by level (index = level - 1): 1d6 at 1, +1d6 every 2 levels
export const SNEAK_ATTACK_DICE = Array.from({ length: 20 }, (_, i) =>
  Math.ceil((i + 1) / 2),
) as readonly number[];

// ── Feature progression ───────────────────────────────────────────────────────

const ROGUE_ASI    = [4, 8, 10, 12, 16, 19];
const SUBCLASS_LEVELS = [3, 9, 13, 17];

function sneakDice(level: number): string {
  return `${Math.ceil(level / 2)}d6`;
}

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Expertise (×2 skills)", description: "Choose two of your skill proficiencies, or one skill proficiency and your proficiency with thieves' tools. Your proficiency bonus is doubled for any ability check using either chosen proficiency." },
    { name: "Sneak Attack (1d6)", description: "Once per turn, you can deal extra 1d6 damage to one creature you hit with an attack if you have advantage on the roll, or if another enemy of the target is within 5 feet and you don't have disadvantage. This extra damage increases as you level up." },
    { name: "Thieves' Cant", description: "You have learned thieves' cant, a secret mix of dialect, jargon, and code that allows you to hide messages in seemingly normal conversation. You also understand a set of secret signs and symbols used to convey short, simple messages." },
  ],
  2: [
    { name: "Cunning Action", description: "Your quick thinking lets you act faster. As a bonus action, you can take the Dash, Disengage, or Hide action." },
  ],
  3:  ["Roguish Archetype", `Sneak Attack (${sneakDice(3)})`],
  4:  ["ASI"],
  5: [
    { name: "Uncanny Dodge", description: "When an attacker that you can see hits you with an attack, you can use your reaction to halve the attack's damage against you." },
    `Sneak Attack (${sneakDice(5)})`,
  ],
  6:  ["Expertise (×2 more skills)"],
  7:  [`Evasion`, `Sneak Attack (${sneakDice(7)})`],
  8:  ["ASI"],
  9:  [`Archetype feature`, `Sneak Attack (${sneakDice(9)})`],
  10: ["ASI"],
  11: [`Reliable Talent`, `Sneak Attack (${sneakDice(11)})`],
  12: ["ASI"],
  13: [`Archetype feature`, `Sneak Attack (${sneakDice(13)})`],
  14: ["Blindsense"],
  15: [`Slippery Mind`, `Sneak Attack (${sneakDice(15)})`],
  16: ["ASI"],
  17: [`Archetype feature`, `Sneak Attack (${sneakDice(17)})`],
  18: ["Elusive"],
  19: [`ASI`, `Sneak Attack (${sneakDice(19)})`],
  20: ["Stroke of Luck"],
};

export const ROGUE_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              ROGUE_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Rogue levelling to `nextLevel`. */
export function getRogueSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 1 || nextLevel === 6) {
    steps.push({
      type:        "append",
      key:         "expertise",
      label:       "Expertise",
      description: "Choose 2 skills (or Thieves' Tools) to gain Expertise (double proficiency bonus). Must be skills you are already proficient in.",
      options:     [...EXPERTISE_OPTIONS],
      count:       2,
    });
  }

  return steps;
}
