// Pure assembly of everything one de-level writes, shaped for `apply_de_level`.
// A level is taken back from the record it kept (`level_choices[n]`): every pick,
// ability increase, skill and mastery goes back exactly, so nothing is left for
// the player to tidy by hand (#976).

import type { AbilityKey } from "@/rules/characterCreation";
import { classResourcesChanged, type StoredClassResources } from "@/rules/features/characterFeatures";
import { revertAbilityScoreIncreases, revertLevelChoices, type LevelChoiceRecord } from "@/rules/features/levelUpChoices";
import type { CharacterClass } from "@/types/multiclass.types";
import { getMulticlassSpellSlots } from "@/types/spell.types";
import { reconcileSpellSlotUsage } from "@/rules/spellSlots";
import type { RulesetKey } from "@/types/ruleset.types";
import type { LevelChoiceEntry, PartyMember, SpellSlotEntry } from "@/types/party.types";
import { applyMasteryChanges, applySkillChanges } from "./levelPicks";

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const NO_RECORD: LevelChoiceRecord = { choices: {}, abilityIncreases: {}, feats: [], swaps: {} };

export interface BuildDeLevelInput {
  member: PartyMember;
  /** The `level_choices` entry of the level being removed. */
  entry: LevelChoiceEntry;
  /** The class row that level was taken in. */
  classRow: CharacterClass;
  characterClasses: CharacterClass[];
  ruleset: RulesetKey;
  /** The class's own slot table, used when it is the only class left (covers custom casters). */
  classSlotTable: number[][] | null;
  /** `class_resources` of the lower state, from the projected pools. */
  classResources: StoredClassResources;
}

export interface DeLevelPayload {
  memberUpdate: Record<string, unknown>;
  classOp: Record<string, unknown>;
  spellIds: string[];
}

export function proficiencyBonusAt(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

export function buildDeLevelPayload(input: BuildDeLevelInput): DeLevelPayload {
  const { member, entry, classRow, characterClasses } = input;
  const record = entry.record ?? NO_RECORD;
  const level = member.level;
  const newTotalLevel = level - 1;
  const newClassLevel = classRow.levels - 1;

  const update: Record<string, unknown> = {
    level: newTotalLevel,
    proficiency_bonus: proficiencyBonusAt(newTotalLevel),
    hit_dice_remaining: Math.max(0, (member.hit_dice_remaining ?? level) - 1),
  };

  // Abilities: subtract exactly what the level added (the record holds the capped amounts).
  const scores: Record<AbilityKey, number> = {
    str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha,
  };
  const lower = revertAbilityScoreIncreases(scores, record.abilityIncreases);
  for (const ability of ABILITIES) if (lower[ability] !== scores[ability]) update[ability] = lower[ability];

  // HP: reverse the base roll AND, if this level's increase touched CON, the
  // retroactive (ΔconMod × level) that level-up added on top.
  const conMod = (score: number) => Math.floor((score - 10) / 2);
  const retroHp = (conMod(scores.con) - conMod(lower.con)) * level;
  const newMaxHp = Math.max(1, member.max_hp - entry.hp_gained - retroHp);
  update.max_hp = newMaxHp;
  update.current_hp = Math.min(member.current_hp, newMaxHp);

  // Picks, feats, swaps, skills, masteries and the tools a new class gave.
  const choicesTouched =
    Object.keys(record.choices).length > 0 || record.feats.length > 0 || Object.keys(record.swaps).length > 0;
  if (choicesTouched) update.class_choices = revertLevelChoices(member.class_choices, record);
  if (entry.skills && Object.keys(entry.skills).length > 0) {
    update.skill_proficiencies = applySkillChanges(member.skill_proficiencies, entry.skills, "revert");
  }
  if (entry.masteries && (entry.masteries.added.length > 0 || entry.masteries.removed.length > 0)) {
    update.weapon_masteries = applyMasteryChanges(member.weapon_masteries, entry.masteries, "revert");
  }
  if (entry.new_class_profs && entry.new_class_profs.length > 0) {
    update.tool_proficiencies = member.tool_proficiencies.filter((p) => !entry.new_class_profs?.includes(p));
  }

  if (classResourcesChanged(member.class_resources, input.classResources)) update.class_resources = input.classResources;

  // Spell slots — recompute over the POST-de-level class list, not just the
  // de-leveled class. A Cleric 5 / Wizard 1 removing the Wizard dip must keep
  // the Cleric's slots.
  const postClasses = characterClasses
    .map((c) => ({ class_name: c.class_name, levels: c.id === classRow.id ? newClassLevel : c.levels }))
    .filter((c) => c.levels > 0);
  let rawSlots: SpellSlotEntry[] = [];
  if (postClasses.length === 1 && postClasses[0].class_name === classRow.class_name && input.classSlotTable) {
    const row = input.classSlotTable[Math.min(postClasses[0].levels, 20) - 1];
    if (row) rawSlots = row.map((max, i) => ({ level: i + 1, max, used: 0 })).filter((s) => s.max > 0);
  } else if (postClasses.length > 0) {
    rawSlots = getMulticlassSpellSlots(postClasses, input.ruleset);
  }
  // Usage carries over per level AND pool (a pact slot and a spellcasting slot
  // can share a level), clamped to the new max; temporary and feature slots stay.
  update.spell_slots = reconcileSpellSlotUsage(rawSlots.filter((s) => s.max > 0), member.spell_slots);

  const remainingChoices = { ...member.level_choices };
  delete remainingChoices[level];
  update.level_choices = remainingChoices;

  // Spells to remove: learned at this level and not also at an earlier level.
  const learnedHere = [...(entry.spells_learned ?? []), ...(entry.cantrips_learned ?? [])];
  const earlier = new Set(
    Object.entries(member.level_choices)
      .filter(([lvl]) => parseInt(lvl, 10) < level)
      .flatMap(([, e]) => [...(e.spells_learned ?? []), ...(e.cantrips_learned ?? [])]),
  );
  const spellIds = learnedHere.filter((id) => !earlier.has(id));

  // character_classes op. A class that empties is deleted; if it was primary the
  // next one is promoted. Removing the last row leaves the character classless.
  let classOp: Record<string, unknown>;
  if (newClassLevel === 0) {
    const remaining = characterClasses.filter((c) => c.id !== classRow.id);
    classOp =
      remaining.length > 0 && classRow.is_primary
        ? { op: "delete", id: classRow.id, promote_id: remaining[0].id }
        : { op: "delete", id: classRow.id };
  } else {
    classOp = { op: "update", id: classRow.id, levels: newClassLevel, clear_subclass: !!entry.subclass };
  }

  return { memberUpdate: update, classOp, spellIds };
}
