/**
 * Paladin class feature progression — SRD 5.1
 * Half-caster (CHA). Prepared spells (CHA mod + half level). Spellcasting at level 2.
 * Lay on Hands: 5 × level HP pool (long rest). Channel Divinity: 1 use (short rest, from level 3).
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassStep, ClassResourceDef } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PALADIN_SUBCLASSES = [
  "Oath of Devotion",
  "Oath of the Ancients",
  "Oath of Vengeance",
  "Oathbreaker (DMG)",
] as const;

export const PALADIN_FIGHTING_STYLES = [
  "Defense",
  "Dueling",
  "Great Weapon Fighting",
  "Protection",
] as const;

// ── Class resources ───────────────────────────────────────────────────────────

export const LAY_ON_HANDS: ClassResourceDef = {
  key:        "lay_on_hands",
  label:      "Lay on Hands",
  rest:       "long",
  maxAtLevel: (level) => level * 5,
};

export const CHANNEL_DIVINITY: ClassResourceDef = {
  key:        "channel_divinity",
  label:      "Channel Divinity",
  rest:       "short",
  maxAtLevel: () => 1,
};

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 7, 15, 20];

const FEATURES: Record<number, string[]> = {
  1:  ["Divine Sense", "Lay on Hands"],
  2:  ["Fighting Style", "Spellcasting", "Divine Smite"],
  3:  ["Divine Health", "Sacred Oath", "Channel Divinity"],
  4:  ["ASI"],
  5:  ["Extra Attack", "Destroy Undead (CR 1/2)"],
  6:  ["Aura of Protection"],
  7:  ["Sacred Oath feature"],
  8:  ["ASI"],
  9:  [],
  10: ["Aura of Courage"],
  11: ["Improved Divine Smite"],
  12: ["ASI"],
  13: [],
  14: ["Cleansing Touch"],
  15: ["Sacred Oath feature"],
  16: ["ASI"],
  17: [],
  18: ["Aura improvements (30 ft.)"],
  19: ["ASI"],
  20: ["Sacred Oath feature"],
};

export const PALADIN_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Paladin levelling to `nextLevel`. */
export function getPaladinSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 2) {
    steps.push({
      type:    "select",
      key:     "fighting_style",
      label:   "Fighting Style",
      options: [...PALADIN_FIGHTING_STYLES],
    });
  }

  return steps;
}

/** Returns class resources that should be upserted when levelling to `nextLevel`. */
export function getPaladinResources(nextLevel: number): ClassResourceDef[] {
  const resources: ClassResourceDef[] = [LAY_ON_HANDS];
  if (nextLevel >= 3) resources.push(CHANNEL_DIVINITY);
  return resources;
}
