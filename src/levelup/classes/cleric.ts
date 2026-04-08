/**
 * Cleric class feature progression — SRD 5.1
 * Full caster (WIS). Prepared spells (WIS mod + level). Subclass (Divine Domain) at level 1.
 * Channel Divinity: 1/rest at level 2, 2/rest at level 6, 3/rest at level 18.
 */

import type { ClassLevelData, ClassResourceDef } from "../types";

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

const STANDARD_ASI    = [4, 8, 12, 16, 19];
const SUBCLASS_LEVELS = [1, 2, 6, 8, 17];

const FEATURES: Record<number, string[]> = {
  1:  ["Spellcasting", "Divine Domain"],
  2:  ["Channel Divinity (1/rest)", "Divine Domain feature"],
  3:  [],
  4:  ["ASI"],
  5:  ["Destroy Undead (CR ½)"],
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
