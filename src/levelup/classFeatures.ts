/**
 * Static class feature progression tables (SRD-derived; Artificer hand-coded).
 * One entry per level (1–20) for each class.
 *
 * ASI and subclass_feature flags are complete.
 * Feature name arrays are stubs — each class sub-ticket (#84–#96) fills them in
 * by importing and merging into the registry via src/levelup/classes/<class>.ts.
 */

import type { ClassFeatureTable, ClassLevelData } from "./types";

function buildLevels(
  asiLevels: number[],
  subclassLevels: number[],
  featureMap: Record<number, string[]> = {},
): ClassLevelData[] {
  return Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    return {
      level,
      features: featureMap[level] ?? [],
      asi: asiLevels.includes(level),
      subclass_feature: subclassLevels.includes(level) ? true : undefined,
    };
  });
}

const STANDARD_ASI = [4, 8, 12, 16, 19];

// Subclass (Specialist): 3, 5, 9, 15
const artificer = buildLevels(STANDARD_ASI, [3, 5, 9, 15]);
// Subclass (Primal Path): 3, 6, 10, 14
const barbarian = buildLevels(STANDARD_ASI, [3, 6, 10, 14]);
// Subclass (College): 3, 6, 14
const bard      = buildLevels(STANDARD_ASI, [3, 6, 14]);
// Subclass (Divine Domain): 1, 2, 6, 8, 17
const cleric    = buildLevels(STANDARD_ASI, [1, 2, 6, 8, 17]);
// Subclass (Circle): 2, 6, 10, 14
const druid     = buildLevels(STANDARD_ASI, [2, 6, 10, 14]);
// Subclass (Martial Archetype): 3, 7, 10, 15, 18 — extra ASI at 6, 14
const fighter   = buildLevels([4, 6, 8, 12, 14, 16, 19], [3, 7, 10, 15, 18]);
// Subclass (Monastic Tradition): 3, 6, 11, 17
const monk      = buildLevels(STANDARD_ASI, [3, 6, 11, 17]);
// Subclass (Sacred Oath): 3, 7, 15, 20
const paladin   = buildLevels(STANDARD_ASI, [3, 7, 15, 20]);
// Subclass (Ranger Archetype): 3, 7, 11, 15
const ranger    = buildLevels(STANDARD_ASI, [3, 7, 11, 15]);
// Subclass (Roguish Archetype): 3, 9, 13, 17 — extra ASI at 10
const rogue     = buildLevels([4, 8, 10, 12, 16, 19], [3, 9, 13, 17]);
// Subclass (Sorcerous Origin): 1, 6, 14, 18
const sorcerer  = buildLevels(STANDARD_ASI, [1, 6, 14, 18]);
// Subclass (Otherworldly Patron): 1, 6, 10, 14
const warlock   = buildLevels(STANDARD_ASI, [1, 6, 10, 14]);
// Subclass (Arcane Tradition): 2, 6, 10, 14
const wizard    = buildLevels(STANDARD_ASI, [2, 6, 10, 14]);

export const CLASS_FEATURES: ClassFeatureTable = {
  Artificer: artificer,
  Barbarian: barbarian,
  Bard:      bard,
  Cleric:    cleric,
  Druid:     druid,
  Fighter:   fighter,
  Monk:      monk,
  Paladin:   paladin,
  Ranger:    ranger,
  Rogue:     rogue,
  Sorcerer:  sorcerer,
  Warlock:   warlock,
  Wizard:    wizard,
};

/** Returns the level data for a class at `targetLevel` (1-based), or null. */
export function getLevelData(className: string, targetLevel: number): ClassLevelData | null {
  const table = CLASS_FEATURES[className];
  if (!table) return null;
  return table[targetLevel - 1] ?? null;
}

/** Standard D&D proficiency bonus for a given character level. */
export function proficiencyBonusForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}
