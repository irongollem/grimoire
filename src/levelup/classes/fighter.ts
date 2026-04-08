/**
 * Fighter class feature progression — SRD 5.1
 * No spellcasting (Eldritch Knight is a third-caster exception, handled in spell.types.ts).
 * Most ASIs of any class: 4, 6, 8, 12, 14, 16, 19.
 */

import type { ClassLevelData, ClassStep, ClassResourceDef, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const FIGHTER_SUBCLASSES = [
  "Champion",
  "Battle Master",
  "Eldritch Knight",
] as const;

export const FIGHTER_FIGHTING_STYLES = [
  "Archery",
  "Defense",
  "Dueling",
  "Great Weapon Fighting",
  "Protection",
  "Two-Weapon Fighting",
] as const;

// ── Class resources ───────────────────────────────────────────────────────────

export const SECOND_WIND: ClassResourceDef = {
  key:        "second_wind",
  label:      "Second Wind",
  rest:       "short",
  maxAtLevel: () => 1,
};

export const ACTION_SURGE: ClassResourceDef = {
  key:        "action_surge",
  label:      "Action Surge",
  rest:       "short",
  maxAtLevel: (level) => level >= 17 ? 2 : 1,
};

export const INDOMITABLE: ClassResourceDef = {
  key:        "indomitable",
  label:      "Indomitable",
  rest:       "long",
  maxAtLevel: (level) => {
    if (level >= 17) return 3;
    if (level >= 13) return 2;
    return 1;
  },
};

// ── Feature progression ───────────────────────────────────────────────────────

const FIGHTER_ASI    = [4, 6, 8, 12, 14, 16, 19];
const SUBCLASS_LEVELS = [3, 7, 10, 15, 18];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Fighting Style", description: "You adopt a particular style of fighting as your specialty. Choose one: Archery (+2 ranged attack rolls), Defense (+1 AC while armored), Dueling (+2 damage with one-handed weapon and no other weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage)." },
    { name: "Second Wind", description: "As a bonus action, you can regain hit points equal to 1d10 + your Fighter level. Once you use this feature, you must finish a short or long rest before you can use it again." },
  ],
  2: [
    { name: "Action Surge (1 use)", description: "On your turn, you can push yourself beyond your normal limits. You take one additional action on top of your regular action and a possible bonus action. Once you use this feature, you must finish a short or long rest before you can use it again. At 17th level you can use it twice before a rest." },
  ],
  3:  ["Martial Archetype"],
  4:  ["ASI"],
  5: [
    { name: "Extra Attack", description: "You can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three at 11th level and four at 20th level." },
  ],
  6:  ["ASI"],
  7:  ["Archetype feature"],
  8:  ["ASI"],
  9:  ["Indomitable (1 use)"],
  10: ["Archetype feature"],
  11: ["Extra Attack (2)"],
  12: ["ASI"],
  13: ["Indomitable (2 uses)"],
  14: ["ASI"],
  15: ["Archetype feature"],
  16: ["ASI"],
  17: ["Action Surge (2 uses)", "Indomitable (3 uses)"],
  18: ["Archetype feature"],
  19: ["ASI"],
  20: ["Extra Attack (3)"],
};

export const FIGHTER_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              FIGHTER_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Fighter levelling to `nextLevel`. */
export function getFighterSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 1) {
    steps.push({
      type:    "select",
      key:     "fighting_style",
      label:   "Fighting Style",
      options: [...FIGHTER_FIGHTING_STYLES],
    });
  }

  // Battle Master maneuvers are subclass-specific — skipped (subclass unknown at step-gen time).

  return steps;
}

/** Returns class resources that should be upserted when levelling to `nextLevel`. */
export function getFighterResources(nextLevel: number): ClassResourceDef[] {
  const resources: ClassResourceDef[] = [SECOND_WIND];
  if (nextLevel >= 2)  resources.push(ACTION_SURGE);
  if (nextLevel >= 9)  resources.push(INDOMITABLE);
  return resources;
}
