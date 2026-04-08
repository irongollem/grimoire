/**
 * Cleric class feature progression — SRD 5.1
 * Full caster (WIS). Prepared spells (WIS mod + level). Subclass (Divine Domain) at level 1.
 * Channel Divinity: 1/rest at level 2, 2/rest at level 6, 3/rest at level 18.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, ClassResourceDef, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const CLERIC_SUBCLASSES = [
  "Life Domain",
  "Light Domain",
  "Trickery Domain",
  "Knowledge Domain",
  "Nature Domain",
  "Tempest Domain",
  "War Domain",
] as const;

// ── Class resources ───────────────────────────────────────────────────────────

export const CHANNEL_DIVINITY: ClassResourceDef = {
  key:        "channel_divinity",
  label:      "Channel Divinity",
  rest:       "short",
  maxAtLevel: (level) => {
    if (level >= 18) return 3;
    if (level >= 6)  return 2;
    return 1;
  },
};

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [1, 2, 6, 8, 17];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Spellcasting", description: "You have learned to draw on divine magic through prayer and devotion. Your spells are drawn from the Cleric spell list. Wisdom is your spellcasting ability. You prepare a number of spells equal to your Wisdom modifier + your Cleric level after each long rest." },
    { name: "Divine Domain", description: "Choose a domain related to your deity. Your choice grants you domain spells and other features at levels 1, 2, 6, 8, and 17. Domain spells are always prepared and don't count against your prepared spells total." },
  ],
  2: [
    { name: "Channel Divinity (1/rest)", description: "You gain the ability to channel divine energy directly from your deity. You know two Channel Divinity options: Turn Undead and an option determined by your domain. When you use Channel Divinity, choose which option to use. You regain the ability to use it after a short or long rest." },
    "Divine Domain feature",
  ],
  3:  [],
  4:  ["ASI"],
  5: [
    { name: "Destroy Undead (CR ½)", description: "When an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below CR ½. This threshold increases as you gain levels." },
  ],
  6:  ["Channel Divinity (2/rest)", "Divine Domain feature"],
  7:  [],
  8:  ["ASI", "Destroy Undead (CR 1)", "Divine Domain feature"],
  9:  [],
  10: ["Divine Intervention"],
  11: ["Destroy Undead (CR 2)"],
  12: ["ASI"],
  13: [],
  14: ["Destroy Undead (CR 3)"],
  15: [],
  16: ["ASI"],
  17: ["Destroy Undead (CR 4)", "Divine Domain feature"],
  18: ["Channel Divinity (3/rest)"],
  19: ["ASI"],
  20: ["Divine Intervention improvement"],
};

export const CLERIC_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});

// ── Resource definitions ──────────────────────────────────────────────────────

/** Returns class resources that should be upserted when levelling to `nextLevel`. */
export function getClericResources(nextLevel: number): ClassResourceDef[] {
  if (nextLevel >= 2) return [CHANNEL_DIVINITY];
  return [];
}
