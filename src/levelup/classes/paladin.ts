/**
 * Paladin class feature progression — SRD 5.1
 * Half-caster (CHA). Prepared spells (CHA mod + half level). Spellcasting at level 2.
 * Lay on Hands: 5 × level HP pool (long rest). Channel Divinity: 1 use (short rest, from level 3).
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassStep, ClassResourceDef, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const PALADIN_SUBCLASSES = [
  "Oath of Devotion",
  "Oath of the Ancients",
  "Oath of Vengeance",
  "Oathbreaker (DMG)",
] as const;

export const PALADIN_FIGHTING_STYLES = [
  "Defense",
  "Dueling",
  "Great Weapon Fighting",
  "Protection",
] as const;

// ── Class resources ───────────────────────────────────────────────────────────

export const LAY_ON_HANDS: ClassResourceDef = {
  key:        "lay_on_hands",
  label:      "Lay on Hands",
  rest:       "long",
  maxAtLevel: (level) => level * 5,
};

export const CHANNEL_DIVINITY: ClassResourceDef = {
  key:        "channel_divinity",
  label:      "Channel Divinity",
  rest:       "short",
  maxAtLevel: () => 1,
};

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [3, 7, 15, 20];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Divine Sense", description: "As an action, you can open your awareness to detect such forces. Until the end of your next turn, you know the location of any celestial, fiend, or undead within 60 feet that is not behind total cover. You can use this feature a number of times equal to 1 + your CHA modifier, regaining uses on a long rest." },
    { name: "Lay on Hands", description: "Your blessed touch can heal wounds. You have a pool of healing power that replenishes on a long rest, with a total number of hit points equal to your Paladin level × 5. As an action, you can touch a creature and restore up to that many hit points. You can also expend 5 hit points from the pool to cure the target of one disease or neutralize one poison." },
  ],
  2: [
    { name: "Fighting Style", description: "Adopt a style of fighting: Defense (+1 AC while armored), Dueling (+2 damage with one-handed weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), or Protection (impose disadvantage on attacks against adjacent allies)." },
    { name: "Spellcasting", description: "Your devotion to your oath allows you to channel divine magic. CHA is your spellcasting ability. You prepare a number of spells equal to your CHA modifier + half your Paladin level (rounded down) after a long rest. You don't gain spells until 2nd level." },
    { name: "Divine Smite", description: "When you hit a creature with a melee weapon attack, you can expend one spell slot to deal extra radiant damage. The damage is 2d8 for a 1st-level slot plus 1d8 for each slot level above 1st, up to 5d8. The damage increases by 1d8 if the target is an undead or a fiend." },
  ],
  3: [
    { name: "Divine Health", description: "The divine magic flowing through you makes you immune to disease." },
    "Sacred Oath",
    { name: "Channel Divinity", description: "You gain the ability to channel divine energy, fueling magical effects. You know Turn the Unholy (force fiends and undead to flee) and an effect determined by your Sacred Oath. You can use Channel Divinity once per short rest." },
  ],
  4:  ["ASI"],
  5: [
    { name: "Extra Attack", description: "You can attack twice, instead of once, whenever you take the Attack action on your turn." },
    { name: "Destroy Undead (CR 1/2)", description: "When an undead fails its saving throw against your Turn the Unholy Channel Divinity, the creature is instantly destroyed if its CR is ½ or lower." },
  ],
  6:  ["Aura of Protection"],
  7:  ["Sacred Oath feature"],
  8:  ["ASI"],
  9:  [],
  10: ["Aura of Courage"],
  11: ["Improved Divine Smite"],
  12: ["ASI"],
  13: [],
  14: ["Cleansing Touch"],
  15: ["Sacred Oath feature"],
  16: ["ASI"],
  17: [],
  18: ["Aura improvements (30 ft.)"],
  19: ["ASI"],
  20: ["Sacred Oath feature"],
};

export const PALADIN_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Wizard step definitions ───────────────────────────────────────────────────

/** Returns class-specific wizard steps for a Paladin levelling to `nextLevel`. */
export function getPaladinSteps(nextLevel: number): ClassStep[] {
  const steps: ClassStep[] = [];

  if (nextLevel === 2) {
    steps.push({
      type:    "select",
      key:     "fighting_style",
      label:   "Fighting Style",
      options: [...PALADIN_FIGHTING_STYLES],
    });
  }

  return steps;
}

/** Returns class resources that should be upserted when levelling to `nextLevel`. */
export function getPaladinResources(nextLevel: number): ClassResourceDef[] {
  const resources: ClassResourceDef[] = [LAY_ON_HANDS];
  if (nextLevel >= 3) resources.push(CHANNEL_DIVINITY);
  return resources;
}
