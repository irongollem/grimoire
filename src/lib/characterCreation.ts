// Pure constants, types, and helpers for the character creation/edit wizard.
// Shared by useCharacterCreationForm and its composed sub-composables, plus the
// step/tab components that render off these tables directly.

import type { PartyMemberInsert, SaveKey, SkillProfLevel } from "@/types/party.types";

/**
 * Shape of the reactive `f` form-state object built by
 * `useCharacterCreationForm`'s `buildFormState()`. Shared here so the composed
 * sub-composables (equipment seeding, background selection) can type the form
 * state they're handed without importing the orchestrator itself.
 */
export type CharacterFormState = Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "spell_slots"> & {
  sort_order: number;
};

export const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

export const EDIT_TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats",    label: "Stats" },
  { id: "profs",    label: "Proficiencies" },
] as const;

export const WIZARD_STEPS = [
  { id: "basics",     label: "Basics" },
  { id: "abilities",  label: "Abilities" },
  { id: "background", label: "Background" },
  { id: "class",      label: "Class" },
  { id: "equipment",  label: "Equipment" },
  { id: "done",       label: "Done" },
] as const;

/** Edit mode skips the equipment step — character already has gear. */
export const WIZARD_STEPS_EDIT = [
  { id: "basics",     label: "Basics" },
  { id: "abilities",  label: "Abilities" },
  { id: "background", label: "Background" },
  { id: "class",      label: "Class" },
  { id: "done",       label: "Done" },
] as const;

export type AsiMode = "bonus" | "custom" | "manual";
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

export const SAVE_STATS = [
  { key: "str" as SaveKey, label: "Strength" },
  { key: "dex" as SaveKey, label: "Dexterity" },
  { key: "con" as SaveKey, label: "Constitution" },
  { key: "int" as SaveKey, label: "Intelligence" },
  { key: "wis" as SaveKey, label: "Wisdom" },
  { key: "cha" as SaveKey, label: "Charisma" },
];

export const PROF_LEVELS: { value: SkillProfLevel; label: string }[] = [
  { value: "none",       label: "–" },
  { value: "proficient", label: "P" },
  { value: "expertise",  label: "E" },
];

export const SCORE_MODES = [
  { id: "pointbuy" as const, label: "Point Buy" },
  { id: "array"    as const, label: "Standard Array" },
  { id: "roll"     as const, label: "Roll 4d6" },
  { id: "manual"   as const, label: "Manual" },
];

export type ScoreMode = (typeof SCORE_MODES)[number]["id"];

export const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_TOTAL = 27;

/** Standard array per 5e PHB, highest first. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Roll 4d6 and drop the lowest die. Returns the sum of the three kept dice. */
export function roll4d6DropLowest(): number {
  const rolls = [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

/**
 * Split a free-text equipment list into individual entries. Open5e ships
 * background equipment as prose: "a holy symbol, a prayer book, vestments,
 * a set of common clothes, and a belt pouch containing 15 gp".
 * We split on commas + " and " (case-insensitive), trim, and drop empties.
 */
export function parseEquipmentList(prose: string): string[] {
  if (!prose.trim()) return [];
  return prose
    .split(/,| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
