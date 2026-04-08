/**
 * Wizard class feature progression — SRD 5.1
 * Full caster (INT). Spellbook: learns 2 free spells per level. Prepared = INT mod + level.
 * Arcane Recovery (short rest slot regain) is a class feature, not a tracked resource pool.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, FeatureEntry } from "../types";

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

const SUBCLASS_LEVELS = [2, 6, 10, 14];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Spellcasting (Spellbook)", description: "You have a spellbook containing 6 1st-level spells. INT is your spellcasting ability. After each long rest, you prepare a number of spells equal to your INT modifier + Wizard level from your spellbook. You can copy new spells into your spellbook (costs 2 hours and 50 gp per spell level). You learn 2 new spells each time you gain a Wizard level." },
    { name: "Arcane Recovery", description: "Once per day when you finish a short rest, you can recover expended spell slots with a combined level equal to or less than half your Wizard level (rounded up), and none of the slots can be 6th level or higher." },
  ],
  2: [
    { name: "Arcane Tradition", description: "Choose an arcane tradition, shaping your practice of magic through one of the schools: Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, or Transmutation. Your choice grants features at 2nd, 6th, 10th, and 14th level." },
  ],
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
