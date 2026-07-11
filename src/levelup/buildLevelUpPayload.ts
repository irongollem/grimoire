// Pure assembly of everything a single level-up writes, shaped for the
// `apply_level_up` atomic RPC (migration 20260710000002 / ...000003). Keeping
// this free of Vue refs and Supabase calls makes the level-up maths unit-
// testable and lets useLevelUpConfirm stay a thin transport layer: build the
// payload, hand it to one transactional RPC. No partial state is possible
// because nothing is written until the RPC runs, and the RPC is all-or-nothing.

import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import type {
  PartyMember,
  SpellSlotEntry,
  LevelChoiceEntry,
  LevelChoiceASI,
  LevelChoices,
} from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep, ClassResourceDef } from "./types";

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
      subclass_name: string | null;
      levels: number;
      is_primary: boolean;
      hit_dice_used: number;
      sort_order: number;
    }
  | { op: "update"; id: string; levels: number; subclass_name?: string | null };

export interface LevelUpPayload {
  /** party_members column updates (only present keys are applied by the RPC). */
  memberUpdate: Record<string, unknown>;
  /** character_classes op, or null when neither adding nor bumping a class. */
  classOp: ClassOp | null;
  /** character_spells rows to insert (deduped by the RPC's unique index). */
  spellRows: SpellRow[];
}

type ClassEntryRef = { id: string; levels: number; subclass_name?: string | null; is_primary?: boolean };

export interface BuildLevelUpPayloadInput {
  member: PartyMember;
  nextLevel: number;
  newProfBonus: number;
  hpGain: number;
  newHitDiceCount: number;
  postLevelupSpellSlots: SpellSlotEntry[];
  grantsAsi: boolean;
  needsSubclassChoice: boolean;
  classDefs: ClassResourceDef[];
  levelInChosenClass: number;
  classSteps: ClassStep[];
  isAddingNewClass: boolean;
  newClassProficiencyGrants: string[];
  memberClass: string;
  chosenExistingEntry: ClassEntryRef | null;
  existingClassOptions: { id: string; class_name: string; levels: number; is_primary?: boolean }[];
  asiMode: AsiMode;
  asiPrimary: AbilityKey | "";
  asiSecondary: AbilityKey | "";
  featId: string;
  subclassInput: string;
  stepValues: Record<string, string>;
  stepMultiValues: Record<string, string[]>;
  selectedSpellIds: Set<string>;
  selectedCantripIds: Set<string>;
  newClassName: string;
  /** Spell ids the leveled subclass grants (always prepared) at this level. */
  grantedSpellsForThisLevel: string[];
  /** All spell ids the character already has — granted spells skip these. */
  existingSpellIds: Set<string>;
}

export function buildLevelUpPayload(input: BuildLevelUpPayloadInput): LevelUpPayload {
  const {
    member, nextLevel, newProfBonus, hpGain, newHitDiceCount,
    postLevelupSpellSlots, grantsAsi, needsSubclassChoice,
    classDefs, levelInChosenClass, classSteps, isAddingNewClass,
    newClassProficiencyGrants, memberClass, chosenExistingEntry, existingClassOptions,
    asiMode, asiPrimary, asiSecondary, featId,
    subclassInput, stepValues, stepMultiValues,
    selectedSpellIds, selectedCantripIds, newClassName,
    grantedSpellsForThisLevel, existingSpellIds,
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

  // ASI ability bumps.
  if (grantsAsi) {
    if (asiMode === "plus2" && asiPrimary) {
      update[asiPrimary] = (member[asiPrimary as keyof PartyMember] as number) + 2;
    } else if (asiMode === "plus1plus1") {
      if (asiPrimary) update[asiPrimary] = (member[asiPrimary as keyof PartyMember] as number) + 1;
      if (asiSecondary) update[asiSecondary] = (member[asiSecondary as keyof PartyMember] as number) + 1;
    }
  }

  // Class resources.
  if (classDefs.length > 0) {
    const newResources = { ...member.class_resources };
    for (const def of classDefs) {
      const newMax = def.maxAtLevel(levelInChosenClass);
      const existing = newResources[def.key];
      newResources[def.key] = {
        max: newMax,
        current: existing ? Math.min(existing.current, newMax) : newMax,
        rest: def.rest,
      };
    }
    update.class_resources = newResources;
  }

  // Subclass + class_choices.
  const newChoices: Record<string, unknown> = { ...member.class_choices };
  const subclass = subclassInput.trim();
  const leveledEntryIsPrimary =
    chosenExistingEntry?.is_primary ?? (isAddingNewClass && existingClassOptions.length === 0);

  if (needsSubclassChoice && subclass && leveledEntryIsPrimary) {
    update.subclass = subclass;
    newChoices.subclass = subclass;
  }

  // Multiclass proficiency grants.
  if (isAddingNewClass && newClassProficiencyGrants.length > 0) {
    const existingProfs = member.tool_proficiencies ?? [];
    update.tool_proficiencies = Array.from(new Set([...existingProfs, ...newClassProficiencyGrants]));
  }

  // Feat choice.
  if (grantsAsi && asiMode === "feat" && featId) {
    const existing = Array.isArray(newChoices.feats) ? (newChoices.feats as string[]) : [];
    newChoices.feats = [...existing, featId];
  }

  // Class-specific step values.
  for (const step of classSteps) {
    const count = step.count ?? 1;
    if (count > 1) {
      const picks = (stepMultiValues[step.key] ?? []).filter(Boolean);
      if (picks.length === 0) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, ...picks];
      } else {
        newChoices[step.key] = picks;
      }
    } else {
      const val = stepValues[step.key];
      if (!val) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, val];
      } else {
        newChoices[step.key] = val;
      }
    }
  }

  if (
    Object.keys(newChoices).length > Object.keys(member.class_choices).length ||
    classSteps.length > 0 ||
    (needsSubclassChoice && subclass) ||
    (grantsAsi && asiMode === "feat" && featId)
  ) {
    update.class_choices = newChoices;
  }

  // Level choices (for de-leveling) — always recorded, folded into the same
  // atomic member update so it can never be skipped by a mid-sequence failure.
  const choiceEntry: LevelChoiceEntry = {
    class_name: memberClass,
    is_new_class: isAddingNewClass,
    hp_gained: hpGain,
  };
  if (grantsAsi) {
    const asi: LevelChoiceASI = { mode: asiMode };
    if (asiPrimary) asi.primary = asiPrimary;
    if (asiMode === "plus1plus1" && asiSecondary) asi.secondary = asiSecondary;
    if (asiMode === "feat" && featId) asi.feat_id = featId;
    choiceEntry.asi = asi;
  }
  if (needsSubclassChoice && subclass) choiceEntry.subclass = subclass;
  if (selectedSpellIds.size > 0) choiceEntry.spells_learned = [...selectedSpellIds];
  if (selectedCantripIds.size > 0) choiceEntry.cantrips_learned = [...selectedCantripIds];
  const allStepChoices: Record<string, string | string[]> = {};
  for (const step of classSteps) {
    if ((step.count ?? 1) > 1) {
      const picks = (stepMultiValues[step.key] ?? []).filter(Boolean);
      if (picks.length) allStepChoices[step.key] = picks;
    } else if (stepValues[step.key]) {
      allStepChoices[step.key] = stepValues[step.key];
    }
  }
  if (Object.keys(allStepChoices).length) choiceEntry.step_choices = allStepChoices;
  if (isAddingNewClass && newClassProficiencyGrants.length > 0) {
    choiceEntry.new_class_profs = newClassProficiencyGrants;
  }
  const level_choices: LevelChoices = { ...member.level_choices, [nextLevel]: choiceEntry };
  update.level_choices = level_choices;

  // character_classes op.
  let classOp: ClassOp | null = null;
  if (isAddingNewClass && newClassName) {
    classOp = {
      op: "add",
      class_name: newClassName,
      subclass_name: null,
      levels: 1,
      is_primary: existingClassOptions.length === 0,
      hit_dice_used: 0,
      sort_order: existingClassOptions.length,
    };
  } else if (chosenExistingEntry) {
    classOp = {
      op: "update",
      id: chosenExistingEntry.id,
      levels: chosenExistingEntry.levels + 1,
      ...(needsSubclassChoice && subclass ? { subclass_name: subclass } : {}),
    };
  }

  // character_spells rows.
  const spellRows: SpellRow[] = [];
  for (const spell_id of selectedSpellIds) spellRows.push({ spell_id, is_prepared: false });
  for (const spell_id of selectedCantripIds) spellRows.push({ spell_id, is_prepared: false });
  // Subclass-granted spells — always prepared, excluded from the prepared limit.
  for (const spell_id of grantedSpellsForThisLevel) {
    if (existingSpellIds.has(spell_id)) continue;
    spellRows.push({ spell_id, is_prepared: true, always_prepared: true });
  }
  // Auto-granted spells from Eldritch Invocations just picked.
  for (const step of classSteps) {
    if (step.key !== "eldritch_invocations") continue;
    const count = step.count ?? 1;
    const picks =
      count > 1
        ? (stepMultiValues[step.key] ?? []).filter(Boolean)
        : stepValues[step.key]
          ? [stepValues[step.key]]
          : [];
    for (const name of picks) {
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
  }

  return { memberUpdate: update, classOp, spellRows };
}
