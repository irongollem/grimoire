/**
 * D&D 5e SRD skill proficiency grants per class.
 *
 * `count`  — how many skills to choose
 * `skills` — allowed skill keys (empty array = any of the 18 skills)
 *
 * Source: 5e SRD / 2024 PHB.
 * For custom/unknown classes the UI falls back to FALLBACK_SKILL_DATA (2 from any).
 */

import type { SkillProficiencies } from "@/types/party.types";

export type SkillKey = keyof SkillProficiencies;

export interface ClassSkillData {
  count: number;
  /** Allowed skill keys; empty means any skill. */
  skills: SkillKey[];
}

export const CLASS_SKILL_CHOICES: Record<string, ClassSkillData> = {
  Artificer: {
    count: 2,
    skills: ["arcana", "history", "investigation", "medicine", "nature", "perception", "sleight_of_hand"],
  },
  Barbarian: {
    count: 2,
    skills: ["animal_handling", "athletics", "intimidation", "nature", "perception", "survival"],
  },
  Bard: {
    // Bards choose 3 from any skill
    count: 3,
    skills: [],
  },
  Cleric: {
    count: 2,
    skills: ["history", "insight", "medicine", "persuasion", "religion"],
  },
  Druid: {
    count: 2,
    skills: ["arcana", "animal_handling", "insight", "medicine", "nature", "perception", "religion", "survival"],
  },
  Fighter: {
    count: 2,
    skills: ["acrobatics", "animal_handling", "athletics", "history", "insight", "intimidation", "perception", "survival"],
  },
  Monk: {
    count: 2,
    skills: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
  },
  Paladin: {
    count: 2,
    skills: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"],
  },
  Ranger: {
    count: 3,
    skills: ["animal_handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
  },
  Rogue: {
    count: 4,
    skills: [
      "acrobatics", "athletics", "deception", "insight", "intimidation",
      "investigation", "perception", "performance", "persuasion", "sleight_of_hand", "stealth",
    ],
  },
  Sorcerer: {
    count: 2,
    skills: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"],
  },
  Warlock: {
    count: 2,
    skills: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
  },
  Wizard: {
    count: 2,
    skills: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
  },
};

/** Fallback for custom / homebrew classes not in the table above. */
export const FALLBACK_SKILL_DATA: ClassSkillData = { count: 2, skills: [] };
