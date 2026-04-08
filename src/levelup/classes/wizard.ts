/**
 * Wizard class feature progression — SRD 5.1
 * Full caster (INT). Spellbook: learns 2 free spells per level. Prepared = INT mod + level.
 * Arcane Recovery (short rest slot regain) is a class feature, not a tracked resource pool.
 */

import type { ClassLevelData } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const WIZARD_SUBCLASSES = [
  "School of Abjuration",
  "School of Conjuration",
  "School of Divination",
  "School of Enchantment",
  "School of Evocation",
  "School of Illusion",
  "School of Necromancy",
  "School of Transmutation",
] as const;

// ── Feature progression ───────────────────────────────────────────────────────

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [2, 6, 10, 14];

const FEATURES: Record<number, string[]> = {
  1:  ["Spellcasting (Spellbook)", "Arcane Recovery"],
  2:  ["Arcane Tradition"],
  3:  [],
  4:  ["ASI"],
  5:  [],
  6:  ["Arcane Tradition feature"],
  7:  [],
  8:  ["ASI"],
  9:  [],
  10: ["Arcane Tradition feature"],
  11: [],
  12: ["ASI"],
  13: [],
  14: ["Arcane Tradition feature"],
  15: [],
  16: ["ASI"],
  17: [],
  18: ["Spell Mastery (1 × 1st-level + 1 × 2nd-level spell cast at will)"],
  19: ["ASI"],
  20: ["Signature Spells (2 × 3rd-level spells, 1 free cast each per short rest)", "Arcane Tradition feature"],
};

export const WIZARD_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// No class steps or resources:
// - Spell Mastery / Signature Spells require spell DB access — player manages manually.
// - Arcane Recovery restores spell slots (already tracked); it's not a separate resource pool.
