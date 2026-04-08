/**
 * Druid class feature progression — SRD 5.1
 * Full caster (WIS). Prepared spells (WIS mod + level). No class-specific wizard steps.
 */

import type { ClassLevelData } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DRUID_SUBCLASSES = [
  "Circle of the Land",
  "Circle of the Moon",
] as const;

// ── Feature progression ───────────────────────────────────────────────────────

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [2, 6, 10, 14];

const FEATURES: Record<number, string[]> = {
  1:  ["Spellcasting", "Druidic"],
  2:  ["Wild Shape (CR ¼, no swim/fly)", "Druid Circle"],
  3:  [],
  4:  ["ASI", "Wild Shape (CR ½, no fly)"],
  5:  [],
  6:  ["Druid Circle feature"],
  7:  [],
  8:  ["ASI", "Wild Shape (CR 1)"],
  9:  [],
  10: ["Druid Circle feature"],
  11: [],
  12: ["ASI"],
  13: [],
  14: ["Druid Circle feature"],
  15: [],
  16: ["ASI"],
  17: [],
  18: ["Timeless Body", "Beast Spells"],
  19: ["ASI"],
  20: ["Archdruid"],
};

export const DRUID_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});
