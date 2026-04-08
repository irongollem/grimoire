/**
 * Bard class feature progression — SRD 5.1
 * Full caster (CHA). Spells known. Bardic Inspiration (CHA mod uses).
 * Expertise at levels 3 & 10. Magical Secrets at levels 10, 14, 18.
 */

import { STANDARD_ASI, SKILL_NAMES } from "../types";
import type { ClassLevelData, ClassStep } from "../types";

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

const FEATURES: Record<number, string[]> = {
  1:  ["Spellcasting", "Bardic Inspiration (d6, CHA mod/rest)"],
  2:  ["Jack of All Trades", "Song of Rest (d6)"],
  3:  ["Bard College", "Expertise (×2 skills)"],
  4:  ["ASI"],
  5:  ["Bardic Inspiration (d8, short rest recharge)", "Font of Inspiration"],
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
