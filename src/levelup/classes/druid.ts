/**
 * Druid class feature progression — SRD 5.1
 * Full caster (WIS). Prepared spells (WIS mod + level). No class-specific wizard steps.
 */

import { STANDARD_ASI } from "../types";
import type { ClassLevelData, FeatureEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DRUID_SUBCLASSES = [
  "Circle of the Land",
  "Circle of the Moon",
] as const;

// ── Feature progression ───────────────────────────────────────────────────────

const SUBCLASS_LEVELS = [2, 6, 10, 14];

const FEATURES: Record<number, FeatureEntry[]> = {
  1: [
    { name: "Spellcasting", description: "Drawing on the divine essence of nature, you can cast spells from the Druid spell list. Wisdom is your spellcasting ability. You prepare a number of spells equal to your Wisdom modifier + your Druid level after each long rest." },
    { name: "Druidic", description: "You know Druidic, the secret language of druids. You can speak the language and use it to leave hidden messages. You and others who know this language automatically spot such a message. Others spot the message's presence with a DC 15 Wisdom (Perception) check but can't decipher it without magic." },
  ],
  2: [
    { name: "Wild Shape (CR ¼, no swim/fly)", description: "You can use your action to magically assume the shape of a beast you have seen before. You can use this feature twice, regaining uses after a short or long rest. At 2nd level you can transform into beasts of CR ¼ or lower that have no flying or swimming speed." },
    { name: "Druid Circle", description: "You choose to identify with a circle of druids. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level." },
  ],
  3:  [],
  4: [
    "ASI",
    { name: "Wild Shape (CR ½, no fly)", description: "Your Wild Shape improves. You can now transform into beasts of CR ½ or lower. They still can't have a flying speed, but swimming speeds are now allowed." },
  ],
  5:  [],
  6:  ["Druid Circle feature"],
  7:  [],
  8:  ["ASI", "Wild Shape (CR 1)"],
  9:  [],
  10: ["Druid Circle feature"],
  11: [],
  12: ["ASI"],
  13: [],
  14: ["Druid Circle feature"],
  15: [],
  16: ["ASI"],
  17: [],
  18: ["Timeless Body", "Beast Spells"],
  19: ["ASI"],
  20: ["Archdruid"],
};

export const DRUID_DATA: ClassLevelData[] = Array.from({ length: 20 }, (_, i) => {
  const level = i + 1;
  return {
    level,
    features:         FEATURES[level] ?? [],
    asi:              STANDARD_ASI.includes(level),
    subclass_feature: SUBCLASS_LEVELS.includes(level) ? true : undefined,
  };
});
