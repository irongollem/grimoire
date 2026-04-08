/**
 * Warlock class feature progression — SRD 5.1
 * Pact Magic: all slots same level, short-rest recharge (handled in spell.types.ts).
 * Spells known. Eldritch Invocations scale with level. Subclass at level 1.
 */

import type { ClassLevelData, ClassStep } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const WARLOCK_SUBCLASSES = [
  "The Archfey",
  "The Fiend",
  "The Great Old One",
] as const;

export const PACT_BOON_OPTIONS = [
  "Pact of the Chain",
  "Pact of the Tome",
  "Pact of the Blade",
] as const;

// SRD Eldritch Invocations (some have prerequisites noted in description)
export const ELDRITCH_INVOCATIONS = [
  "Agonizing Blast",
  "Armor of Shadows",
  "Ascendant Step",
  "Beast Speech",
  "Beguiling Influence",
  "Bewitching Whispers",
  "Book of Ancient Secrets",
  "Chains of Carceri",
  "Devil's Sight",
  "Dreadful Word",
  "Eldritch Sight",
  "Eldritch Spear",
  "Eyes of the Rune Keeper",
  "Fiendish Vigor",
  "Gaze of Two Minds",
  "Lifedrinker",
  "Mask of Many Faces",
  "Master of Myriad Forms",
  "Minions of Chaos",
  "Mire the Mind",
  "Misty Visions",
  "One with Shadows",
  "Otherworldly Leap",
  "Repelling Blast",
  "Sculptor of Flesh",
  "Sign of Ill Omen",
  "Thief of Five Fates",
  "Thirsting Blade",
  "Visions of Distant Realms",
  "Voice of the Chain Master",
  "Whispers of the Grave",
  "Witch Sight",
] as const;

// Spells known per level (index = level - 1)
export const WARLOCK_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 10,  // 1–10
  11, 11, 12, 12, 13, 13, 14, 14, 15, 15, // 11–20
] as const;

// ── Feature progression ───────────────────────────────────────────────────────

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [1, 6, 10, 14];

const FEATURES: Record<number, string[]> = {
  1:  ["Otherworldly Patron", "Spellcasting (Pact Magic, short rest)"],
  2:  ["Eldritch Invocations (2)"],
  3:  ["Pact Boon", "Eldritch Invocations (3)"],
  4:  ["ASI"],
  5:  ["Eldritch Invocations (4)"],
  6:  ["Otherworldly Patron feature"],
  7:  ["Eldritch Invocations (5)"],
  8:  ["ASI"],
  9:  ["Eldritch Invocations (6)"],
  10: ["Otherworldly Patron feature"],
  11: ["Mystic Arcanum (6th-level spell)", "Eldritch Invocations (7)"],
  12: ["ASI"],
  13: ["Mystic Arcanum (7th-level spell)"],
  14: ["Otherworldly Patron feature"],
  15: ["Mystic Arcanum (8th-level spell)", "Eldritch Invocations (8)"],
  16: ["ASI"],
  17: ["Mystic Arcanum (9th-level spell)"],
  18: ["Eldritch Invocations (9)"],
  19: ["ASI"],
  20: ["Eldritch Master"],
};

export const WARLOCK_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
    spells_known:     WARLOCK_SPELLS_KNOWN[i],
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

// Levels where Eldritch Invocations count increases
const INVOCATION_LEVELS = [2, 5, 7, 9, 12, 15, 18];

/** Returns class-specific wizard steps for a Warlock levelling to `nextLevel`. */
export function getWarlockSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 3) {
    steps.push({
      type:    "select",
      key:     "pact_boon",
      label:   "Pact Boon",
      options: [...PACT_BOON_OPTIONS],
    });
  }

  if (INVOCATION_LEVELS.includes(nextLevel)) {
    steps.push({
      type:        "append",
      key:         "eldritch_invocations",
      label:       "Eldritch Invocation",
      description: nextLevel === 2
        ? "Choose 2 Eldritch Invocations. Note: some invocations have level or Pact Boon prerequisites."
        : "Choose 1 new Eldritch Invocation (you may also replace one you know). Note: some invocations have prerequisites.",
      options:     [...ELDRITCH_INVOCATIONS],
      count:       nextLevel === 2 ? 2 : 1,
    });
  }

  // Mystic Arcanum (levels 11, 13, 15, 17) requires a spell picker from the Warlock list.
  // Skipped — needs spell database access; player manages manually from feature list.

  return steps;
}
