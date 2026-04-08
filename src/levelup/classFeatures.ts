/**
 * Static class feature progression tables (SRD-derived; Artificer hand-coded).
 * One entry per level (1–20) for each class.
 *
 * ASI and subclass_feature flags are complete.
 * Feature name arrays are stubs — each class sub-ticket (#84–#96) fills them in
 * by importing and merging into the registry via src/levelup/classes/<class>.ts.
 */

import type { ClassFeatureTable, ClassLevelData, ClassStep, ClassResourceDef } from "./types";
import { RANGER_DATA,    getRangerSteps                          } from "./classes/ranger";
import { ARTIFICER_DATA, getArtificerSteps                      } from "./classes/artificer";
import { SORCERER_DATA,  getSorcererSteps, getSorcererResources  } from "./classes/sorcerer";
import { PALADIN_DATA,   getPaladinSteps,  getPaladinResources   } from "./classes/paladin";
import { DRUID_DATA                                              } from "./classes/druid";
import { ROGUE_DATA,    getRogueSteps                           } from "./classes/rogue";
import { MONK_DATA,    getMonkResources                        } from "./classes/monk";
import { CLERIC_DATA,  getClericResources                      } from "./classes/cleric";
import { BARD_DATA,       getBardSteps                            } from "./classes/bard";
import { BARBARIAN_DATA,  getBarbarianResources                   } from "./classes/barbarian";
import { WARLOCK_DATA,    getWarlockSteps                         } from "./classes/warlock";

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

const artificer = ARTIFICER_DATA;
const barbarian = BARBARIAN_DATA;
const bard      = BARD_DATA;
const cleric    = CLERIC_DATA;
const druid     = DRUID_DATA;
// Subclass (Martial Archetype): 3, 7, 10, 15, 18 — extra ASI at 6, 14
const fighter   = buildLevels([4, 6, 8, 12, 14, 16, 19], [3, 7, 10, 15, 18]);
const monk      = MONK_DATA;
// Subclass (Sacred Oath): 3, 7, 15, 20
const paladin   = PALADIN_DATA;
const ranger    = RANGER_DATA;
const rogue     = ROGUE_DATA;
const sorcerer  = SORCERER_DATA;
const warlock   = WARLOCK_DATA;
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

/**
 * Returns the class-specific wizard steps for a character levelling to `nextLevel`.
 * Returns an empty array for classes not yet implemented.
 */
export function getClassSteps(className: string, nextLevel: number): ClassStep[] {
  switch (className) {
    case "Artificer": return getArtificerSteps(nextLevel);
    case "Bard":      return getBardSteps(nextLevel);
    case "Warlock":   return getWarlockSteps(nextLevel);
    case "Paladin":   return getPaladinSteps(nextLevel);
    case "Ranger":    return getRangerSteps(nextLevel);
    case "Rogue":     return getRogueSteps(nextLevel);
    case "Sorcerer":  return getSorcererSteps(nextLevel);
    default:          return [];
  }
}

/**
 * Returns class resource definitions that should be upserted on level-up.
 * Returns an empty array for classes with no trackable resources.
 */
export function getClassResources(className: string, nextLevel: number): ClassResourceDef[] {
  switch (className) {
    case "Barbarian": return getBarbarianResources(nextLevel);
    case "Cleric":    return getClericResources(nextLevel);
    case "Monk":     return getMonkResources(nextLevel);
    case "Paladin":  return getPaladinResources(nextLevel);
    case "Sorcerer": return getSorcererResources(nextLevel);
    default:         return [];
  }
}
