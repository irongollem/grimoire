/**
 * Ranger class feature progression — SRD 5.1
 * Half-caster (WIS). Spells known (not prepared). Spellcasting begins at level 2.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassStep, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const RANGER_FIGHTING_STYLES = [
  "Archery",
  "Defense",
  "Dueling",
  "Two-Weapon Fighting",
] as const;

export const RANGER_FAVORED_ENEMIES = [
  "Aberrations",
  "Beasts",
  "Celestials",
  "Constructs",
  "Dragons",
  "Elementals",
  "Fey",
  "Fiends",
  "Giants",
  "Monstrosities",
  "Oozes",
  "Plants",
  "Undead",
  "Two humanoid types",
] as const;

export const RANGER_TERRAINS = [
  "Arctic",
  "Coast",
  "Desert",
  "Forest",
  "Grassland",
  "Mountain",
  "Swamp",
  "Underdark",
] as const;

export const RANGER_SUBCLASSES = ["Hunter", "Beast Master"] as const;

// Spells known per level (index = level - 1; 0 at level 1, spellcasting starts at 2)
export const RANGER_SPELLS_KNOWN = [
  0,  // 1
  2,  // 2
  3,  // 3
  3,  // 4
  4,  // 5
  4,  // 6
  5,  // 7
  5,  // 8
  6,  // 9 — note: PHB says no new spell at 9 but cumulative total reaches 6
  6,  // 10 — wait, actually PHB ranger spells known: 2,3,3,4,4,5,5,6,6,7,7,8,8,9,9
  7,  // 11
  7,  // 12
  8,  // 13
  8,  // 14
  9,  // 15
  9,  // 16
  10, // 17
  10, // 18
  11, // 19
  11, // 20
] as const;

// ── Feature progression ────────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 7, 11, 15];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Favored Enemy", description: "Choose a type of favored enemy: aberrations, beasts, celestials, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, or undead. Alternatively, choose two races of humanoid. You have advantage on Survival checks to track them and Intelligence checks to recall information about them. You also learn one language they speak." },
    { name: "Natural Explorer", description: "Choose a favored terrain type: arctic, coast, desert, forest, grassland, mountain, swamp, or the Underdark. When traveling in your favored terrain you gain several benefits: difficult terrain doesn't slow group travel, you can't get lost by non-magical means, you remain alert to danger even while foraging or navigating, you can move stealthily at normal pace alone, you find twice as much food foraging, and you learn the exact number and size of creature groups passing through the area." },
  ],
  2: [
    { name: "Fighting Style", description: "Adopt a fighting style: Archery (+2 ranged attack rolls), Defense (+1 AC while armored), Dueling (+2 damage one-handed weapon), or Two-Weapon Fighting (add ability modifier to off-hand damage)." },
    { name: "Spellcasting", description: "You have learned to use the magical essence of nature to cast spells. WIS is your spellcasting ability. You know a number of spells from the Ranger spell list and can cast them using your spell slots." },
  ],
  3: [
    "Ranger Archetype",
    { name: "Primeval Awareness", description: "As an action, expend one spell slot to focus your awareness on the region around you. For 1 minute per spell slot level, you can sense whether certain types of creatures (aberrations, celestials, dragons, elementals, fey, fiends, or undead) are present within 1 mile of you (or 6 miles if in your favored terrain), though not their exact location or number." },
  ],
  4:  ["ASI"],
  5: [
    { name: "Extra Attack", description: "You can attack twice, instead of once, whenever you take the Attack action on your turn." },
  ],
  6:  ["Favored Enemy improvement", "Natural Explorer improvement"],
  7:  ["Ranger Archetype feature"],
  8:  ["ASI", "Land's Stride"],
  9:  [],
  10: ["Natural Explorer improvement", "Hide in Plain Sight"],
  11: ["Ranger Archetype feature"],
  12: ["ASI"],
  13: [],
  14: ["Favored Enemy improvement", "Vanish"],
  15: ["Ranger Archetype feature"],
  16: ["ASI"],
  17: [],
  18: ["Feral Senses"],
  19: ["ASI"],
  20: ["Foe Slayer"],
};

export const RANGER_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
    spells_known:     RANGER_SPELLS_KNOWN[i] > 0 ? RANGER_SPELLS_KNOWN[i] : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/**
 * Returns the class-specific wizard steps for a Ranger levelling to `nextLevel`.
 * Steps are ordered as they should appear in the wizard.
 */
export function getRangerSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 2) {
    steps.push({
      type: "select",
      key:  "fighting_style",
      label: "Fighting Style",
      description: "Choose one fighting style to adopt.",
      options: [...RANGER_FIGHTING_STYLES],
    });
  }

  if (nextLevel === 1 || nextLevel === 6 || nextLevel === 14) {
    steps.push({
      type: "append",
      key:  "favored_enemies",
      label: "Favored Enemy",
      description: nextLevel === 1
        ? "Choose a type of favored enemy."
        : "Choose an additional favored enemy type.",
      options: [...RANGER_FAVORED_ENEMIES],
    });
  }

  if (nextLevel === 1 || nextLevel === 6 || nextLevel === 10) {
    steps.push({
      type: "append",
      key:  "natural_explorer_terrains",
      label: "Natural Explorer",
      description: nextLevel === 1
        ? "Choose a favored terrain."
        : "Choose an additional favored terrain.",
      options: [...RANGER_TERRAINS],
    });
  }

  return steps;
}
