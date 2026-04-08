/**
 * Sorcerer class feature progression — SRD 5.1
 * Full caster (CHA). Spells known. Sorcery Points = level. Metamagic at 3/10/17.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassStep, ClassResourceDef, FeatureEntry } from "../types";

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

const SUBCLASS_LEVELS = [1, 6, 14, 18];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Spellcasting", description: "An event in your past imbued you with magical power. CHA is your spellcasting ability. You know a fixed number of Sorcerer spells (they are always prepared). You can cast known spells using your spell slots." },
    { name: "Sorcerous Origin", description: "Choose a sorcerous origin that describes the source of your innate magical power, such as Draconic Bloodline or Wild Magic. Your choice grants features at 1st level and again at 6th, 14th, and 18th level." },
  ],
  2: [
    { name: "Font of Magic (2 Sorcery Points)", description: "You tap into a deep wellspring of magic within yourself — Sorcery Points. You have 2 points (equal to your level), regained on a long rest. As a bonus action you can create a spell slot by spending Sorcery Points, or convert a spell slot into Sorcery Points. Also used to fuel Metamagic options." },
  ],
  3: [
    { name: "Metamagic (choose 2)", description: "You gain the ability to twist your spells to suit your needs. Choose 2 Metamagic options: Careful (protect allies from your spells), Distant (double range), Empowered (reroll damage dice, costs 1 point), Extended (double duration), Heightened (impose disadvantage on save, costs 3), Quickened (cast as bonus action, costs 2), Subtle (no verbal/somatic components), or Twinned (target second creature, costs spell level in points)." },
  ],
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
