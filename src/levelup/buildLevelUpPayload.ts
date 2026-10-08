// Pure assembly of everything a single level-up writes, shaped for the
// `apply_level_up` atomic RPC (migration 20260710000002 / ...000003). Keeping
// this free of Vue refs and Supabase calls makes the level-up maths unit-
// testable and lets useLevelUpConfirm stay a thin transport layer: build the
// payload, hand it to one transactional RPC. No partial state is possible
// because nothing is written until the RPC runs, and the RPC is all-or-nothing.

import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import type { AbilityKey } from "@/rules/characterCreation";
import type { FeatureGrants } from "@/rules/features/mechanics.types";
import {
  classResourcesChanged,
  type StoredClassResources,
} from "@/rules/features/characterFeatures";
import {
  applyAbilityScoreIncreases,
  applyLevelChoices,
  type LevelChoiceRecord,
} from "@/rules/features/levelUpChoices";
import type {
  PartyMember,
  SpellSlotEntry,
  LevelChoiceEntry,
  LevelChoices,
} from "@/types/party.types";
import { applyFeatureGrants, mergeSkillChanges, type FeatureSpellInput, featureSpellRows } from "./featureGrants";
import { applyMasteryChanges, applySkillChanges, type ResolvedPicks } from "./levelPicks";

/** One character_spells row to insert (matches apply_level_up's p_spell_rows). */
export interface SpellRow {
  spell_id: string;
  is_prepared?: boolean;
  always_prepared?: boolean;
  source_type?: string;
  source_label?: string;
  uses_per_day?: number | null;
  uses_remaining?: number | null;
  resets_on?: string | null;
}

/** character_classes operation: add a new class entry or bump the leveled one. */
export type ClassOp =
  | {
      op: "add";
      class_name: string;
      class_definition_id: string;
      class_definition_kind: "system" | "custom";
      /** Set together or both null, like the column pair they land in. */
      subclass_name: string | null;
      subclass_definition_id: string | null;
      /**
       * The member's NEW total level when the character has no class rows yet
       * (its first class carries every level it has banked), 1 for a further
       * class: `apply_level_up` requires exactly that.
       */
      levels: number;
      is_primary: boolean;
      hit_dice_used: number;
      sort_order: number;
      /** The option picked from the subclass's `spell_variants`; omitted when none was asked. */
      subclass_variant?: string;
    }
  | {
      op: "update"; id: string; levels: number; subclass_name?: string; subclass_definition_id?: string;
      subclass_variant?: string;
    };

export interface LevelUpPayload {
  /** party_members column updates (only present keys are applied by the RPC). */
  memberUpdate: Record<string, unknown>;
  /** character_classes op, or null when neither adding nor bumping a class. */
  classOp: ClassOp | null;
  /** character_spells rows to insert (deduped by the RPC's unique index). */
  spellRows: SpellRow[];
}

type ClassEntryRef = {
  id: string;
  levels: number;
  class_definition_id: string;
  subclass_name?: string | null;
  is_primary?: boolean;
};

export interface BuildLevelUpPayloadInput {
  member: PartyMember;
  nextLevel: number;
  newProfBonus: number;
  hpGain: number;
  newHitDiceCount: number;
  postLevelupSpellSlots: SpellSlotEntry[];
  needsSubclassChoice: boolean;
  isAddingNewClass: boolean;
  newClassProficiencyGrants: string[];
  memberClass: string;
  chosenExistingEntry: ClassEntryRef | null;
  existingClassOptions: { id: string; class_name: string; levels: number; is_primary?: boolean }[];
  /** Everything the level's choices resolved to; see `resolveLevelPicks`. */
  picks: ResolvedPicks;
  /** The `class_resources` the character holds once the level lands, from the projected pools. */
  classResources: StoredClassResources;
  subclassInput: string;
  subclassDefinitionId: string | null;
  selectedSpellIds: Set<string>;
  selectedCantripIds: Set<string>;
  newClassName: string;
  newClassDefinitionId: string | null;
  newClassDefinitionKind: "system" | "custom" | null;
  /** The option picked from the subclass's `spell_variants` at this level, or null when none was asked. */
  subclassVariant: string | null;
  /** All spell ids the character already has — feature spell picks skip these. */
  existingSpellIds: Set<string>;
  /** The `grants` of every feature newly granted at this level (class, subclass, and the feats taken). */
  featureGrants: (FeatureGrants | undefined)[];
  /** What the level's spell picks need to become rows; `existingSpellIds` is added here. */
  featureSpells: Omit<FeatureSpellInput, "existingSpellIds">;
}

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function isEmptyRecord(record: LevelChoiceRecord): boolean {
  return (
    Object.keys(record.choices).length === 0 &&
    record.feats.length === 0 &&
    Object.keys(record.swaps).length === 0
  );
}

export function buildLevelUpPayload(input: BuildLevelUpPayloadInput): LevelUpPayload {
  const {
    member, nextLevel, newProfBonus, hpGain, newHitDiceCount,
    postLevelupSpellSlots, needsSubclassChoice,
    isAddingNewClass, newClassProficiencyGrants, memberClass,
    chosenExistingEntry, existingClassOptions, picks, classResources,
    subclassInput, subclassDefinitionId,
    selectedSpellIds, selectedCantripIds, newClassName,
    newClassDefinitionId, newClassDefinitionKind,
    subclassVariant, existingSpellIds, featureGrants, featureSpells,
  } = input;

  const update: Record<string, unknown> = {
    level: nextLevel,
    proficiency_bonus: newProfBonus,
    max_hp: member.max_hp + hpGain,
    current_hp: member.current_hp + hpGain,
    hit_dice_remaining: newHitDiceCount,
  };

  // Spell slots — multiclass-aware combined table, preserving used counts.
  if (postLevelupSpellSlots.length > 0) {
    const existing = member.spell_slots ?? [];
    update.spell_slots = postLevelupSpellSlots.map((s) => ({
      ...s,
      used: existing.find((e) => e.level === s.level)?.used ?? 0,
    }));
  }

  // Ability increases arrive already capped (an Ability Score Improvement stops at 20,
  // a feat at its own maximum), so applying them here and subtracting them on a
  // de-level are exact inverses.
  const scoresBefore: Record<AbilityKey, number> = {
    str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha,
  };
  const scoresAfter = applyAbilityScoreIncreases(scoresBefore, picks.record.abilityIncreases);
  for (const ability of ABILITIES) if (scoresAfter[ability] !== scoresBefore[ability]) update[ability] = scoresAfter[ability];

  // A CON increase retroactively raises max HP by the CON-mod delta × total level
  // (5e), not just this level's roll — otherwise the character stays permanently
  // under-HP'd after a CON increase.
  if (scoresAfter.con !== scoresBefore.con) {
    const conMod = (score: number) => Math.floor((score - 10) / 2);
    const retroHp = (conMod(scoresAfter.con) - conMod(scoresBefore.con)) * nextLevel;
    update.max_hp = (update.max_hp as number) + retroHp;
    update.current_hp = (update.current_hp as number) + retroHp;
  }

  if (classResourcesChanged(member.class_resources, classResources)) update.class_resources = classResources;

  // A subclass is its definition: a name with no definition id cannot be
  // stored, so it stays out of level_choices as well as the class row. The pick
  // itself lives on `character_classes` and nowhere in `class_choices`.
  const subclass = subclassDefinitionId ? subclassInput.trim() : "";

  // Multiclass proficiency grants.
  let newProfsGranted: string[] = [];
  if (isAddingNewClass && newClassProficiencyGrants.length > 0) {
    const existingProfs = member.tool_proficiencies ?? [];
    update.tool_proficiencies = Array.from(new Set([...existingProfs, ...newClassProficiencyGrants]));
    // Only the grants the character did not already hold are recorded, so a de-level takes back exactly these.
    newProfsGranted = newClassProficiencyGrants.filter((p) => !existingProfs.includes(p));
  }

  // The level's picks: class_choices, Expertise and new skills, Weapon Mastery.
  if (!isEmptyRecord(picks.record)) update.class_choices = applyLevelChoices(member.class_choices, picks.record);
  // What the features give outright lands on top of the picks, so a skill picked and granted in one level is not counted twice.
  const skillsAfterPicks = applySkillChanges(member.skill_proficiencies, picks.skills, "apply");
  const grants = applyFeatureGrants(
    { skills: skillsAfterPicks, tools: (update.tool_proficiencies as string[] | undefined) ?? member.tool_proficiencies, languages: member.languages },
    featureGrants,
  );
  const levelSkills = mergeSkillChanges(picks.skills, grants.skills);
  if (Object.keys(levelSkills).length > 0) {
    update.skill_proficiencies = applySkillChanges(member.skill_proficiencies, levelSkills, "apply");
  }
  if (grants.granted.tools.length > 0) update.tool_proficiencies = grants.tools;
  if (grants.granted.languages.length > 0) update.languages = grants.languages;
  if (picks.masteries.added.length > 0 || picks.masteries.removed.length > 0) {
    update.weapon_masteries = applyMasteryChanges(member.weapon_masteries, picks.masteries, "apply");
  }

  // Level choices (for de-leveling) — always recorded, folded into the same
  // atomic member update so it can never be skipped by a mid-sequence failure.
  // The definition the level was taken in, so a de-level finds the same class row by id and not by name.
  // A new class must resolve to a definition first: that error is the one a player can act on.
  if (isAddingNewClass && (!newClassName || !newClassDefinitionId || !newClassDefinitionKind)) {
    throw new Error("Pick the class to take a level in before confirming.");
  }
  const levelDefinitionId = isAddingNewClass ? newClassDefinitionId : chosenExistingEntry?.class_definition_id;
  if (!levelDefinitionId) throw new Error("buildLevelUpPayload: the level has no class definition");
  const choiceEntry: LevelChoiceEntry = {
    class_name: memberClass,
    class_definition_id: levelDefinitionId,
    is_new_class: isAddingNewClass,
    hp_gained: hpGain,
    record: picks.record,
    skills: levelSkills,
    masteries: picks.masteries,
  };
  if (grants.granted.tools.length > 0 || grants.granted.languages.length > 0) choiceEntry.granted_profs = grants.granted;
  if (needsSubclassChoice && subclass) choiceEntry.subclass = subclass;
  if (selectedSpellIds.size > 0) choiceEntry.spells_learned = [...selectedSpellIds];
  if (selectedCantripIds.size > 0) choiceEntry.cantrips_learned = [...selectedCantripIds];
  if (newProfsGranted.length > 0) choiceEntry.new_class_profs = newProfsGranted;
  const level_choices: LevelChoices = { ...member.level_choices, [nextLevel]: choiceEntry };
  update.level_choices = level_choices;

  // character_classes op.
  let classOp: ClassOp | null = null;
  if (isAddingNewClass) {
    // Every class row is pinned to the definition it plays; a name that resolved
    // to none is an error, not a row without a pin.
    if (!newClassName || !newClassDefinitionId || !newClassDefinitionKind) {
      throw new Error("Pick the class to take a level in before confirming.");
    }
    classOp = {
      op: "add",
      class_name: newClassName,
      class_definition_id: newClassDefinitionId,
      class_definition_kind: newClassDefinitionKind,
      // A subclass chosen with the class is its definition: both or neither.
      subclass_name: needsSubclassChoice && subclass && subclassDefinitionId ? subclass : null,
      subclass_definition_id: needsSubclassChoice && subclass && subclassDefinitionId ? subclassDefinitionId : null,
      levels: existingClassOptions.length === 0 ? nextLevel : 1,
      is_primary: existingClassOptions.length === 0,
      hit_dice_used: 0,
      sort_order: existingClassOptions.length,
      ...(subclassVariant ? { subclass_variant: subclassVariant } : {}),
    };
  } else if (chosenExistingEntry) {
    classOp = {
      op: "update",
      id: chosenExistingEntry.id,
      levels: chosenExistingEntry.levels + 1,
      // A subclass is its definition: the name never travels without the id.
      ...(needsSubclassChoice && subclass && subclassDefinitionId ? {
        subclass_name: subclass,
        subclass_definition_id: subclassDefinitionId,
      } : {}),
      ...(subclassVariant ? { subclass_variant: subclassVariant } : {}),
    };
  }

  // character_spells rows.
  const spellRows: SpellRow[] = [];
  for (const spell_id of selectedSpellIds) spellRows.push({ spell_id, is_prepared: false });
  for (const spell_id of selectedCantripIds) spellRows.push({ spell_id, is_prepared: false });
  // Subclass-granted spells are not written here: the server derives them from the class row.
  // Auto-granted spells from Eldritch Invocations just picked (a replacement counts: it is added too).
  const invocationsTaken = Object.hasOwn(picks.record.choices, "eldritch_invocations")
    ? picks.record.choices.eldritch_invocations.added
    : [];
  for (const name of invocationsTaken) {
    const inv = ELDRITCH_INVOCATIONS_MAP.get(name);
    if (!inv?.grants_spell) continue;
    const usesPerDay = inv.spell_uses_per_day ?? null;
    spellRows.push({
      spell_id: inv.grants_spell,
      is_prepared: false,
      source_type: "feat",
      source_label: `Invocation: ${name}`,
      uses_per_day: usesPerDay,
      uses_remaining: usesPerDay,
      resets_on: usesPerDay !== null ? "long_rest" : null,
    });
  }

  // Spells a feature's pick adds (a feat's cantrip, a class feature's "counts as a cleric spell").
  const taken = new Set(spellRows.map((r) => r.spell_id));
  const fromFeatures = featureSpellRows({ ...featureSpells, existingSpellIds: new Set([...existingSpellIds, ...taken]) });
  spellRows.push(...fromFeatures.rows);
  if (fromFeatures.spellIds.length > 0) {
    choiceEntry.feature_spells = fromFeatures.spellIds;
  }

  return { memberUpdate: update, classOp, spellRows };
}
