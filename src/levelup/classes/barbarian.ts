/**
 * Barbarian class feature progression — SRD 5.1
 * No spellcasting. Rage uses scale with level (long rest).
 * Rage damage: +2 (levels 1–8), +3 (9–15), +4 (16–20).
 * Unarmored Defense: AC = 10 + DEX mod + CON mod.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassResourceDef, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BARBARIAN_SUBCLASSES = [
  "Path of the Berserker",
  "Path of the Totem Warrior",
] as const;

// Rage uses per long rest by level (99 = unlimited at level 20)
const RAGE_USES = [
  2, 2, 3, 3, 3, 4, 4, 4, 4, 4,  // 1–10
  4, 5, 5, 5, 5, 5, 6, 6, 6, 99, // 11–20
] as const;

export function rageDamageBonus(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9)  return 3;
  return 2;
}

// ── Class resources ───────────────────────────────────────────────────────────

export const RAGE: ClassResourceDef = {
  key:        "rage",
  label:      "Rage",
  rest:       "long",
  maxAtLevel: (level) => RAGE_USES[level - 1],
};

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 6, 10, 14];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Rage (2 uses, +2 dmg)", description: "As a bonus action, enter a rage for up to 1 minute. While raging you have advantage on STR checks and saves, deal +2 damage on STR melee attacks, and gain resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging. Ends early if you are knocked unconscious, or if your turn ends without attacking or taking damage." },
    { name: "Unarmored Defense (10+DEX+CON)", description: "While you are not wearing any armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit." },
  ],
  2: [
    { name: "Reckless Attack", description: "When you make your first attack on your turn, you can decide to attack recklessly. Doing so gives you advantage on melee weapon attack rolls using STR during this turn, but attack rolls against you have advantage until your next turn." },
    { name: "Danger Sense", description: "You gain an uncanny sense of danger. You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. This benefit is denied if you are blinded, deafened, or incapacitated." },
  ],
  3:  ["Primal Path"],
  4:  ["ASI"],
  5: [
    { name: "Extra Attack", description: "You can attack twice, instead of once, whenever you take the Attack action on your turn." },
    { name: "Fast Movement", description: "Your speed increases by 10 feet while you aren't wearing heavy armor." },
  ],
  6:  ["Path feature", "Rage (4 uses)"],
  7:  ["Feral Instinct"],
  8:  ["ASI"],
  9:  ["Brutal Critical (1 die)", "Rage damage +3"],
  10: ["Path feature"],
  11: ["Relentless Rage"],
  12: ["ASI", "Rage (5 uses)"],
  13: ["Brutal Critical (2 dice)"],
  14: ["Path feature"],
  15: ["Persistent Rage"],
  16: ["ASI", "Rage damage +4"],
  17: ["Brutal Critical (3 dice)", "Rage (6 uses)"],
  18: ["Indomitable Might"],
  19: ["ASI"],
  20: ["Primal Champion (+4 STR, +4 CON)", "Rage (unlimited)"],
};

export const BARBARIAN_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Resource definitions ──────────────────────────────────────────────────────

/** Returns class resources that should be upserted when levelling to `nextLevel`. */
export function getBarbarianResources(nextLevel: number): ClassResourceDef[] {
  return nextLevel >= 1 ? [RAGE] : [];
}
