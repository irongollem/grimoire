/**
 * Static class feature progression tables (SRD-derived; Artificer hand-coded).
 * One entry per level (1–20) for each class.
 *
 * All 13 classes implemented in src/levelup/classes/<class>.ts.
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
import { FIGHTER_DATA,   getFighterSteps, getFighterResources    } from "./classes/fighter";
import { WIZARD_DATA                                             } from "./classes/wizard";

const artificer = ARTIFICER_DATA;
const barbarian = BARBARIAN_DATA;
const bard      = BARD_DATA;
const cleric    = CLERIC_DATA;
const druid     = DRUID_DATA;
const fighter   = FIGHTER_DATA;
const monk      = MONK_DATA;
// Subclass (Sacred Oath): 3, 7, 15, 20
const paladin   = PALADIN_DATA;
const ranger    = RANGER_DATA;
const rogue     = ROGUE_DATA;
const sorcerer  = SORCERER_DATA;
const warlock   = WARLOCK_DATA;
const wizard    = WIZARD_DATA;

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
 * Returns all features a character has gained from levels 1 through `currentLevel`,
 * keyed by level. Levels with no features are omitted.
 */
export function getCharacterFeatures(className: string, currentLevel: number): Record<number, string[]> {
  const table = CLASS_FEATURES[className];
  if (!table) return {};
  const result: Record<number, string[]> = {};
  for (let lvl = 1; lvl <= currentLevel; lvl++) {
    const features = table[lvl - 1]?.features ?? [];
    if (features.length > 0) result[lvl] = features;
  }
  return result;
}

/**
 * Returns the class-specific wizard steps for a character levelling to `nextLevel`.
 * Returns an empty array for classes not yet implemented.
 */
export function getClassSteps(className: string, nextLevel: number): ClassStep[] {
  switch (className) {
    case "Artificer": return getArtificerSteps(nextLevel);
    case "Bard":      return getBardSteps(nextLevel);
    case "Fighter":   return getFighterSteps(nextLevel);
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
    case "Fighter":   return getFighterResources(nextLevel);
    case "Monk":     return getMonkResources(nextLevel);
    case "Paladin":  return getPaladinResources(nextLevel);
    case "Sorcerer": return getSorcererResources(nextLevel);
    default:         return [];
  }
}
