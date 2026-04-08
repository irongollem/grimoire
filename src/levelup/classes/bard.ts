/**
 * Bard class feature progression — SRD 5.1
 * Full caster (CHA). Spells known. Bardic Inspiration (CHA mod uses).
 * Expertise at levels 3 & 10. Magical Secrets at levels 10, 14, 18.
 */

import { STANDARD_ASI, SKILL_NAMES } from "../types";
import type { ClassLevelData, ClassStep, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BARD_SUBCLASSES = [
  "College of Lore",
  "College of Valor",
] as const;

// Spells known per level (index = level - 1)
export const BARD_SPELLS_KNOWN = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14,  // 1–10
  15, 15, 16, 18, 19, 19, 20, 22, 22, 22, // 11–20
] as const;

// Bardic Inspiration die by level
export function bardicInspirationDie(level: number): string {
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5)  return "d8";
  return "d6";
}

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 6, 14];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Spellcasting", description: "You have learned to untangle and reshape the fabric of reality using music, speech, and song. Your spells are drawn from the Bard spell list. You know 4 spells at 1st level. Charisma is your spellcasting ability." },
    { name: "Bardic Inspiration (d6, CHA mod/rest)", description: "As a bonus action, choose one creature (other than yourself) within 60 feet who can hear you. That creature gains a Bardic Inspiration die (d6). Once within the next 10 minutes, the creature can roll the die and add the result to one ability check, attack roll, or saving throw. You can use this a number of times equal to your Charisma modifier (minimum 1), regaining uses on a long rest." },
  ],
  2: [
    { name: "Jack of All Trades", description: "You can add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus." },
    { name: "Song of Rest (d6)", description: "You can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points by spending hit dice at the end of a short rest, each of those creatures regains an extra 1d6 hit points." },
  ],
  3: [
    "Bard College",
    { name: "Expertise (×2 skills)", description: "Choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies. At 10th level, you can choose two more skills to gain this benefit." },
  ],
  4:  ["ASI"],
  5: [
    { name: "Bardic Inspiration (d8, short rest recharge)", description: "Your Bardic Inspiration die increases to a d8. Additionally, Font of Inspiration means you now regain uses on a short or long rest (rather than only on a long rest)." },
    { name: "Font of Inspiration", description: "You now regain your expended Bardic Inspiration uses when you finish a short or long rest." },
  ],
  6:  ["Countercharm", "Bard College feature"],
  7:  [],
  8:  ["ASI"],
  9:  ["Song of Rest (d8)"],
  10: ["Bardic Inspiration (d10)", "Expertise (×2 more skills)", "Magical Secrets (2 spells from any list)"],
  11: [],
  12: ["ASI"],
  13: ["Song of Rest (d10)"],
  14: ["Magical Secrets (2 more spells)", "Bard College feature"],
  15: ["Bardic Inspiration (d12)"],
  16: ["ASI"],
  17: ["Song of Rest (d12)"],
  18: ["Magical Secrets (2 more spells)"],
  19: ["ASI"],
  20: ["Superior Inspiration"],
};

export const BARD_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
    spells_known:     BARD_SPELLS_KNOWN[i],
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Bard levelling to `nextLevel`. */
export function getBardSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 3 || nextLevel === 10) {
    steps.push({
      type:        "append",
      key:         "expertise",
      label:       "Expertise",
      description: "Choose 2 skills to gain Expertise (double proficiency bonus). Must be skills you are already proficient in.",
      options:     [...SKILL_NAMES],
      count:       2,
    });
  }

  // Magical Secrets requires an unrestricted all-class spell picker not yet implemented.
  // Levels 10, 14, 18 — tracked as feature text only; player manages manually.

  return steps;
}
