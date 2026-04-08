/**
 * Monk class feature progression — SRD 5.1
 * No spellcasting. Ki points = Monk level (short rest). Martial Arts die and
 * Unarmored Movement bonus scale with level (display-only on character sheet).
 */

import type { ClassLevelData, ClassResourceDef } from "../types";

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

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [3, 6, 11, 17];

const FEATURES: Record<number, string[]> = {
  1:  ["Unarmored Defense (10+DEX+WIS)", "Martial Arts (1d4)"],
  2:  ["Ki (2 points)", "Unarmored Movement (+10 ft)"],
  3:  ["Monastic Tradition", "Deflect Missiles"],
  4:  ["ASI", "Slow Fall"],
  5:  ["Extra Attack", "Stunning Strike", "Martial Arts (1d6)"],
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
