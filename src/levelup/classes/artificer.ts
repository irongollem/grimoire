/**
 * Artificer class feature progression — Tasha's Cauldron of Everything (hand-coded, non-SRD).
 * Half-caster (INT) with accelerated slot table (rounds up). Prepared spells.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassStep } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ARTIFICER_SUBCLASSES = [
  "Alchemist",
  "Armorer",
  "Artillerist",
  "Battle Smith",
] as const;

// Infusions known and items infused per level (index = level - 1)
const INFUSIONS_KNOWN = [
  0, 4, 4, 4, 6, 6, 6, 6, 8, 8,   // 1–10
  8, 8, 8,10,10,10,10,12,12,12,   // 11–20
] as const;

const ITEMS_INFUSED = [
  0, 2, 2, 2, 3, 3, 3, 3, 4, 4,   // 1–10
  4, 4, 4, 5, 5, 5, 5, 6, 6, 6,   // 11–20
] as const;

// ── Feature progression ────────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 5, 9, 15];

const FEATURES: Record<number, string[]> = {
  1:  ["Magical Tinkering", "Spellcasting"],
  2:  [`Infuse Item (${INFUSIONS_KNOWN[1]} infusions known, ${ITEMS_INFUSED[1]} items)`],
  3:  ["Artificer Specialist", "The Right Tool for the Job"],
  4:  ["ASI"],
  5:  [`Artificer Specialist feature`, `Infusions known: ${INFUSIONS_KNOWN[4]}, items: ${ITEMS_INFUSED[4]}`],
  6:  ["Tool Expertise"],
  7:  ["Flash of Genius"],
  8:  ["ASI"],
  9:  [`Artificer Specialist feature`, `Infusions known: ${INFUSIONS_KNOWN[8]}, items: ${ITEMS_INFUSED[8]}`],
  10: ["Magic Item Adept"],
  11: ["Spell-Storing Item"],
  12: ["ASI"],
  13: [],
  14: [`Magic Item Savant`, `Infusions known: ${INFUSIONS_KNOWN[13]}, items: ${ITEMS_INFUSED[13]}`],
  15: ["Artificer Specialist feature"],
  16: ["ASI"],
  17: [],
  18: [`Magic Item Master`, `Infusions known: ${INFUSIONS_KNOWN[17]}, items: ${ITEMS_INFUSED[17]}`],
  19: ["ASI"],
  20: ["Soul of Artifice"],
};

export const ARTIFICER_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  const infusions = INFUSIONS_KNOWN[i];
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
    infusions_known:  infusions > 0 ? infusions : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for an Artificer levelling to `nextLevel`. */
export function getArtificerSteps(_nextLevel: number): ClassStep[] {
  // Artificer has no mid-level choice prompts beyond subclass (handled by wizard) and ASI.
  // Infusion selection is shown as an informational notice (via infusions_known on ClassLevelData)
  // and tracked in class_choices by the player separately.
  return [];
}
