import { applyLevelChoices, type LevelChoiceRecord } from "@/rules/features/levelUpChoices";
import type { StoredClassResources } from "@/rules/features/characterFeatures";
import type { AbilityKey, AsiMode } from "@/rules/characterCreation";
import { applyMasteryChanges, applySkillChanges, type ResolvedPicks } from "@/levelup/levelPicks";
import type { LevelChoiceEntry, LevelChoices, SkillProficiencies } from "@/types/party.types";

/**
 * Pure halves of the level-1 choices a new character makes (#976): what the
 * creation wizard writes once the book's level-1 choices are answered. Kept free
 * of Vue and Supabase so the same rule that level-up applies (`applyLevelChoices`,
 * `applySkillChanges`, `applyMasteryChanges`) is testable on its own.
 */

const ABILITIES: readonly AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const ABILITY_NAMES: Record<string, AbilityKey> = {
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha",
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
};

type Increases = Record<string, number | string> | null | undefined;

export interface ScoreBonusInput {
  scores: Record<AbilityKey, number>;
  asiMode: AsiMode;
  customAsi: Record<AbilityKey, number>;
  /** Species and subrace `ability_score_increases`, applied in this order. */
  structured: Increases[];
  /** The 2024 background's chosen ability increase (empty when none). */
  background: Partial<Record<AbilityKey, number>>;
}

/**
 * The ability scores a new character ends up with: the typed scores plus species
 * (structured or custom) and background increases, each stopping at 20. The one
 * place this is worked out, so the Done card, the level-1 choices (a pool that
 * scales with Charisma wants the final score) and the save agree.
 */
export function scoresAfterBonuses(input: ScoreBonusInput): Record<AbilityKey, number> {
  const out = { ...input.scores };
  const add = (key: AbilityKey, by: number) => { out[key] = Math.min(20, out[key] + by); };
  if (input.asiMode === "bonus") {
    for (const asi of input.structured) {
      // Free-text increases ("+2 to two scores of your choice") are set by hand, not applied.
      if (!asi || "description" in asi) continue;
      for (const [name, value] of Object.entries(asi)) {
        const key = ABILITY_NAMES[name.toLowerCase()];
        if (key !== undefined && typeof value === "number") add(key, value);
      }
    }
  } else if (input.asiMode === "custom") {
    // Custom replaces every species increase: the player distributes freely.
    for (const key of ABILITIES) if (input.customAsi[key] > 0) add(key, input.customAsi[key]);
  }
  for (const key of ABILITIES) {
    const by = input.background[key];
    if (by !== undefined) add(key, by);
  }
  return out;
}

function isEmptyRecord(record: LevelChoiceRecord): boolean {
  return (
    Object.keys(record.choices).length === 0 &&
    record.feats.length === 0 &&
    Object.keys(record.swaps).length === 0
  );
}

export interface LevelOneInput {
  classChoices: Record<string, unknown>;
  skills: SkillProficiencies;
  masteries: readonly string[];
  picks: ResolvedPicks;
  /** `class_resources` from the projected pools, level 1 maxima. */
  classResources: StoredClassResources;
  className: string;
  /** Null when no class was picked: the history entry needs a definition to point at. */
  classDefinitionId: string | null;
  hpGained: number;
}

export interface LevelOneWrites {
  class_choices: Record<string, unknown>;
  skill_proficiencies: SkillProficiencies;
  weapon_masteries: string[];
  class_resources: StoredClassResources;
  level_choices: LevelChoices;
}

/**
 * The columns level 1's choices write, exactly as a level-up writes them, plus
 * the `level_choices["1"]` entry that makes the history complete (the feature
 * card reads its picks from it). A character with no class has no definition to
 * record the level against, so it gets the effects but no history entry; the
 * level-up that gives it a class writes that level's own.
 */
export function levelOneWrites(input: LevelOneInput): LevelOneWrites {
  const { picks } = input;
  const level_choices: LevelChoices = {};
  if (input.classDefinitionId !== null) {
    const entry: LevelChoiceEntry = {
      class_name: input.className,
      class_definition_id: input.classDefinitionId,
      is_new_class: true,
      hp_gained: input.hpGained,
      record: picks.record,
      skills: picks.skills,
      masteries: picks.masteries,
    };
    level_choices[1] = entry;
  }
  return {
    class_choices: isEmptyRecord(picks.record) ? input.classChoices : applyLevelChoices(input.classChoices, picks.record),
    skill_proficiencies: Object.keys(picks.skills).length > 0
      ? applySkillChanges(input.skills, picks.skills, "apply")
      : input.skills,
    weapon_masteries: applyMasteryChanges(input.masteries, picks.masteries, "apply"),
    class_resources: input.classResources,
    level_choices,
  };
}
