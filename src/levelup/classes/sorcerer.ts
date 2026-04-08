/**
 * Sorcerer class feature progression — SRD 5.1
 * Full caster (CHA). Spells known. Sorcery Points = level. Metamagic at 3/10/17.
 */

import type { ClassLevelData, ClassStep, ClassResourceDef } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const SORCERER_SUBCLASSES = ["Draconic Bloodline", "Wild Magic"] as const;

export const METAMAGIC_OPTIONS = [
  "Careful Spell",
  "Distant Spell",
  "Empowered Spell",
  "Extended Spell",
  "Heightened Spell",
  "Quickened Spell",
  "Subtle Spell",
  "Twinned Spell",
] as const;

// Spells known per level (index = level - 1)
export const SORCERER_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11,  // 1–10
  12, 12, 13, 13, 14, 14, 15, 15, 15, 15, // 11–20
] as const;

// ── Class resources ───────────────────────────────────────────────────────────

export const SORCERY_POINTS: ClassResourceDef = {
  key:          "sorcery_points",
  label:        "Sorcery Points",
  rest:         "long",
  maxAtLevel:   (level) => level, // equal to character level, starts at 2
};

// ── Feature progression ────────────────────────────────────────────────────────

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [1, 6, 14, 18];

const FEATURES: Record<number, string[]> = {
  1:  ["Spellcasting", "Sorcerous Origin"],
  2:  ["Font of Magic (2 Sorcery Points)"],
  3:  ["Metamagic (choose 2)"],
  4:  ["ASI"],
  5:  [],
  6:  ["Sorcerous Origin feature"],
  7:  [],
  8:  ["ASI"],
  9:  [],
  10: ["Metamagic (choose 1 more)"],
  11: [],
  12: ["ASI"],
  13: [],
  14: ["Sorcerous Origin feature"],
  15: [],
  16: ["ASI"],
  17: ["Metamagic (choose 1 more)"],
  18: ["Sorcerous Origin feature"],
  19: ["ASI"],
  20: ["Sorcerous Restoration"],
};

export const SORCERER_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
    spells_known:     SORCERER_SPELLS_KNOWN[i],
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Sorcerer levelling to `nextLevel`. */
export function getSorcererSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 3) {
    steps.push({
      type:        "append",
      key:         "metamagic",
      label:       "Metamagic",
      description: "Choose 2 Metamagic options.",
      options:     [...METAMAGIC_OPTIONS],
      count:       2,
    });
  }

  if (nextLevel === 10 || nextLevel === 17) {
    steps.push({
      type:        "append",
      key:         "metamagic",
      label:       "Metamagic",
      description: "Choose 1 additional Metamagic option.",
      options:     [...METAMAGIC_OPTIONS],
    });
  }

  return steps;
}

/** Returns the class resources that should be upserted when levelling to `nextLevel`. */
export function getSorcererResources(nextLevel: number): ClassResourceDef[] {
  // Sorcery Points begin at level 2 and always equal the character level
  if (nextLevel >= 2) return [SORCERY_POINTS];
  return [];
}
