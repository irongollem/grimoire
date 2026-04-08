/**
 * Monk class feature progression — SRD 5.1
 * No spellcasting. Ki points = Monk level (short rest). Martial Arts die and
 * Unarmored Movement bonus scale with level (display-only on character sheet).
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassResourceDef, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MONK_SUBCLASSES = [
  "Way of the Open Hand",
  "Way of Shadow",
  "Way of the Four Elements",
] as const;

// Martial Arts die by level
export function martialArtsDie(level: number): string {
  if (level >= 17) return "1d10";
  if (level >= 11) return "1d8";
  if (level >= 5)  return "1d6";
  return "1d4";
}

// Unarmored Movement speed bonus by level (0 until level 2)
export function unarmoredMovementBonus(level: number): number {
  if (level >= 18) return 30;
  if (level >= 14) return 25; // level 14 is +25 per the table (15 is also +25)
  if (level >= 10) return 20;
  if (level >= 6)  return 15;
  if (level >= 2)  return 10;
  return 0;
}

// ── Class resources ───────────────────────────────────────────────────────────

export const KI_POINTS: ClassResourceDef = {
  key:        "ki_points",
  label:      "Ki Points",
  rest:       "short",
  maxAtLevel: (level) => level, // equal to Monk level, starts at 2
};

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 6, 11, 17];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Unarmored Defense (10+DEX+WIS)", description: "While you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier." },
    { name: "Martial Arts (1d4)", description: "You can use DEX instead of STR for unarmed strikes and monk weapons. Your unarmed strikes deal 1d4 damage. When you use the Attack action with an unarmed strike or monk weapon, you can make one unarmed strike as a bonus action." },
  ],
  2: [
    { name: "Ki (2 points)", description: "You can spend ki points to fuel special abilities. You have ki points equal to your Monk level, regained on a short or long rest. Flurry of Blows (1 ki): after the Attack action, make two unarmed strikes as a bonus action. Patient Defense (1 ki): take the Dodge action as a bonus action. Step of the Wind (1 ki): take the Disengage or Dash action as a bonus action, and your jump distance is doubled." },
    { name: "Unarmored Movement (+10 ft)", description: "Your speed increases by 10 feet while you are not wearing armor or wielding a shield. This bonus increases at higher levels." },
  ],
  3: [
    "Monastic Tradition",
    { name: "Deflect Missiles", description: "As a reaction when you are hit by a ranged weapon attack, you can deflect or catch the missile. The damage is reduced by 1d10 + your DEX modifier + your Monk level. If you reduce the damage to 0, you can spend 1 ki point to throw the projectile back as a ranged attack (range 20/60 ft, deals 1d6 + DEX damage)." },
  ],
  4: [
    "ASI",
    { name: "Slow Fall", description: "As a reaction when you fall, you can reduce any falling damage you take by an amount equal to five times your Monk level." },
  ],
  5: [
    { name: "Extra Attack", description: "You can attack twice, instead of once, whenever you take the Attack action on your turn." },
    { name: "Stunning Strike", description: "When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a CON saving throw (DC = 8 + proficiency bonus + WIS modifier) or be stunned until the end of your next turn." },
    "Martial Arts (1d6)",
  ],
  6:  ["Ki-Empowered Strikes", "Monastic Tradition feature", "Unarmored Movement (+15 ft)"],
  7:  ["Evasion", "Stillness of Mind"],
  8:  ["ASI"],
  9:  ["Unarmored Movement (run up walls)", "Unarmored Movement (+15 ft)"],
  10: ["Purity of Body", "Martial Arts (1d8)", "Unarmored Movement (+20 ft)"],
  11: ["Monastic Tradition feature"],
  12: ["ASI"],
  13: ["Tongue of Sun and Moon", "Unarmored Movement (+20 ft)"],
  14: ["Diamond Soul", "Unarmored Movement (+25 ft)"],
  15: ["Timeless Body", "Unarmored Movement (+25 ft)"],
  16: ["ASI", "Martial Arts (1d10)"],
  17: ["Monastic Tradition feature", "Unarmored Movement (+25 ft)"],
  18: ["Empty Body", "Unarmored Movement (+30 ft)"],
  19: ["ASI"],
  20: ["Perfect Self", "Martial Arts (1d12)"],
};

export const MONK_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
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
export function getMonkResources(nextLevel: number): ClassResourceDef[] {
  if (nextLevel >= 2) return [KI_POINTS];
  return [];
}
