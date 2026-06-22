import type { Ref, ComputedRef } from "vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useAddCharacterClass, useUpdateCharacterClass } from "@/composables/useCharacterClasses";
import { useAddCharacterSpell, addInvocationSpellGrant } from "@/composables/useCharacterSpells";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import type {
  PartyMember,
  PartyMemberUpdate,
  SpellSlotEntry,
  LevelChoiceEntry,
  LevelChoices,
} from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep, ClassResourceDef } from "./types";

export interface ConfirmOptions {
  member: PartyMember;
  targetLevel?: number;
  backRoute?: string;

  // Derived state
  nextLevel: ComputedRef<number>;
  newProfBonus: ComputedRef<number>;
  hpGain: ComputedRef<number>;
  newHitDiceCount: ComputedRef<number>;
  postLevelupSpellSlots: ComputedRef<SpellSlotEntry[]>;
  grantsAsi: ComputedRef<boolean>;
  needsSubclassChoice: ComputedRef<boolean>;
  classDefs: ComputedRef<ClassResourceDef[]>;
  levelInChosenClass: ComputedRef<number>;
  classSteps: ComputedRef<ClassStep[]>;
  isAddingNewClass: ComputedRef<boolean>;
  newClassProficiencyGrants: ComputedRef<string[]>;
  memberClass: ComputedRef<string>;
  chosenExistingEntry: ComputedRef<{ id: string; levels: number; subclass_name?: string | null; is_primary?: boolean } | null>;
  existingClassOptions: ComputedRef<{ id: string; class_name: string; levels: number; is_primary?: boolean }[]>;

  // Mutable state (refs)
  hpMode: Ref<"average" | "roll" | "max">;
  rolledHp: Ref<number | null>;
  asiMode: Ref<AsiMode>;
  asiPrimary: Ref<AbilityKey | "">;
  asiSecondary: Ref<AbilityKey | "">;
  featId: Ref<string>;
  subclassInput: Ref<string>;
  stepValues: Ref<Record<string, string>>;
  stepMultiValues: Ref<Record<string, string[]>>;
  selectedSpellIds: Ref<Set<string>>;
  selectedCantripIds: Ref<Set<string>>;
  newClassName: Ref<string>;
  /** Spell ids granted (always prepared) by the leveled subclass at this level. */
  grantedSpellsForThisLevel: ComputedRef<string[]>;
}

export function useLevelUpConfirm(opts: ConfirmOptions) {
  const router = useRouter();
  const { mutateAsync: updateMember, isPending } = useUpdatePartyMember();
  const { mutateAsync: addCharacterClass } = useAddCharacterClass();
  const { mutateAsync: updateCharacterClass } = useUpdateCharacterClass();
  const { mutateAsync: addSpell } = useAddCharacterSpell();

  const error = ref("");

  async function confirm() {
    error.value = "";
    const {
      member, targetLevel, backRoute,
      nextLevel, newProfBonus, hpGain, newHitDiceCount,
      postLevelupSpellSlots, grantsAsi, needsSubclassChoice,
      classDefs, levelInChosenClass, classSteps, isAddingNewClass,
      newClassProficiencyGrants, memberClass, chosenExistingEntry,
      existingClassOptions,
      hpMode: _hpMode, rolledHp: _rolledHp,
      asiMode, asiPrimary, asiSecondary, featId,
      subclassInput, stepValues, stepMultiValues,
      selectedSpellIds, selectedCantripIds, newClassName,
      grantedSpellsForThisLevel,
    } = opts;

    // Backstop: a level-up must know which class entry it is bumping. Without
    // this, party_members gets the new level while character_classes is
    // silently skipped, leaving the two tables out of sync.
    if (!isAddingNewClass.value && !chosenExistingEntry.value && existingClassOptions.value.length > 0) {
      error.value = "Select which class you are leveling in before confirming.";
      return;
    }

    const update: Record<string, unknown> = {
      level: nextLevel.value,
      proficiency_bonus: newProfBonus.value,
      max_hp: member.max_hp + hpGain.value,
      current_hp: member.current_hp + hpGain.value,
      hit_dice_remaining: newHitDiceCount.value,
    };

    // Spell slots — multiclass-aware combined table
    if (postLevelupSpellSlots.value.length > 0) {
      const existing = member.spell_slots ?? [];
      update.spell_slots = postLevelupSpellSlots.value.map(s => ({
        ...s,
        used: existing.find(e => e.level === s.level)?.used ?? 0,
      }));
    }

    // ASI or feat
    if (grantsAsi.value) {
      if (asiMode.value === "plus2" && asiPrimary.value) {
        update[asiPrimary.value] = (member[asiPrimary.value as keyof PartyMember] as number) + 2;
      } else if (asiMode.value === "plus1plus1") {
        if (asiPrimary.value) update[asiPrimary.value] = (member[asiPrimary.value as keyof PartyMember] as number) + 1;
        if (asiSecondary.value) update[asiSecondary.value] = (member[asiSecondary.value as keyof PartyMember] as number) + 1;
      }
    }

    // Class resources
    const defs = classDefs.value;
    if (defs.length > 0) {
      const newResources = { ...member.class_resources };
      for (const def of defs) {
        const newMax = def.maxAtLevel(levelInChosenClass.value);
        const existing = newResources[def.key];
        newResources[def.key] = {
          max: newMax,
          current: existing ? Math.min(existing.current, newMax) : newMax,
          rest: def.rest,
        };
      }
      update.class_resources = newResources;
    }

    // Subclass + class_choices
    const newChoices: Record<string, unknown> = { ...member.class_choices };
    const subclass = subclassInput.value.trim();
    const leveledEntryIsPrimary =
      chosenExistingEntry.value?.is_primary ??
      (isAddingNewClass.value && existingClassOptions.value.length === 0);

    if (needsSubclassChoice.value && subclass && leveledEntryIsPrimary) {
      update.subclass = subclass;
      newChoices.subclass = subclass;
    }

    // Multiclass proficiency grants
    if (isAddingNewClass.value && newClassProficiencyGrants.value.length > 0) {
      const existingProfs = member.tool_proficiencies ?? [];
      const merged = Array.from(new Set([...existingProfs, ...newClassProficiencyGrants.value]));
      update.tool_proficiencies = merged;
    }

    // Feat choice
    if (grantsAsi.value && asiMode.value === "feat" && featId.value) {
      const existing = Array.isArray(newChoices.feats) ? (newChoices.feats as string[]) : [];
      newChoices.feats = [...existing, featId.value];
    }

    // Class-specific step values
    for (const step of classSteps.value) {
      const count = step.count ?? 1;
      if (count > 1) {
        const picks = (stepMultiValues.value[step.key] ?? []).filter(Boolean);
        if (picks.length === 0) continue;
        if (step.type === "append") {
          const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
          newChoices[step.key] = [...existing, ...picks];
        } else {
          newChoices[step.key] = picks;
        }
      } else {
        const val = stepValues.value[step.key];
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
      classSteps.value.length > 0 ||
      (needsSubclassChoice.value && subclass) ||
      (grantsAsi.value && asiMode.value === "feat" && featId.value)
    ) {
      update.class_choices = newChoices;
    }

    try {
      await updateMember({ id: member.id, update: update as PartyMemberUpdate });

      // Persist character_classes
      if (isAddingNewClass.value && newClassName.value) {
        await addCharacterClass({
          party_member_id: member.id,
          class_name: newClassName.value,
          subclass_name: null,
          levels: 1,
          is_primary: existingClassOptions.value.length === 0,
          hit_dice_used: 0,
          sort_order: existingClassOptions.value.length,
        });
      } else if (chosenExistingEntry.value) {
        const entry = chosenExistingEntry.value;
        const patch: { levels: number; subclass_name?: string | null } = {
          levels: entry.levels + 1,
        };
        if (needsSubclassChoice.value && subclass) {
          patch.subclass_name = subclass;
        }
        await updateCharacterClass({ id: entry.id, update: patch });
      }

      // Add selected spells and cantrips
      for (const spellId of selectedSpellIds.value) {
        await addSpell({ partyMemberId: member.id, spellId, isPrepared: false });
      }
      for (const spellId of selectedCantripIds.value) {
        await addSpell({ partyMemberId: member.id, spellId, isPrepared: false });
      }

      // Subclass-granted spells (oath / domain / circle) — always prepared,
      // excluded from the prepared limit. Skip any the character already has.
      const grantIds = grantedSpellsForThisLevel.value;
      if (grantIds.length > 0) {
        const { data: existingRows } = await supabase
          .from("character_spells")
          .select("spell_id")
          .eq("party_member_id", member.id);
        const have = new Set((existingRows ?? []).map((r) => r.spell_id as string));
        for (const spellId of grantIds) {
          if (have.has(spellId)) continue;
          await addSpell({ partyMemberId: member.id, spellId, alwaysPrepared: true });
        }
      }

      // Auto-grant spells from Eldritch Invocations just picked
      for (const step of classSteps.value) {
        if (step.key !== "eldritch_invocations") continue;
        const count = step.count ?? 1;
        const picks =
          count > 1
            ? (stepMultiValues.value[step.key] ?? []).filter(Boolean)
            : stepValues.value[step.key]
              ? [stepValues.value[step.key]]
              : [];
        for (const name of picks) {
          const inv = ELDRITCH_INVOCATIONS_MAP.get(name);
          if (!inv?.grants_spell) continue;
          await addInvocationSpellGrant(
            member.id,
            inv.grants_spell,
            name,
            inv.spell_uses_per_day ?? null,
          );
        }
      }

      // Persist this level's choices for de-leveling
      const choiceEntry: LevelChoiceEntry = {
        class_name: memberClass.value,
        is_new_class: isAddingNewClass.value,
        hp_gained: hpGain.value,
      };
      if (grantsAsi.value) {
        choiceEntry.asi = {
          mode: asiMode.value,
          ...(asiPrimary.value ? { primary: asiPrimary.value } : {}),
          ...(asiMode.value === "plus1plus1" && asiSecondary.value ? { secondary: asiSecondary.value } : {}),
          ...(asiMode.value === "feat" && featId.value ? { feat_id: featId.value } : {}),
        };
      }
      if (needsSubclassChoice.value && subclassInput.value.trim()) {
        choiceEntry.subclass = subclassInput.value.trim();
      }
      if (selectedSpellIds.value.size > 0) {
        choiceEntry.spells_learned = [...selectedSpellIds.value];
      }
      if (selectedCantripIds.value.size > 0) {
        choiceEntry.cantrips_learned = [...selectedCantripIds.value];
      }
      const allStepChoices: Record<string, string | string[]> = {};
      for (const step of classSteps.value) {
        if ((step.count ?? 1) > 1) {
          const picks = (stepMultiValues.value[step.key] ?? []).filter(Boolean);
          if (picks.length) allStepChoices[step.key] = picks;
        } else if (stepValues.value[step.key]) {
          allStepChoices[step.key] = stepValues.value[step.key];
        }
      }
      if (Object.keys(allStepChoices).length) choiceEntry.step_choices = allStepChoices;
      if (isAddingNewClass.value && newClassProficiencyGrants.value.length > 0) {
        choiceEntry.new_class_profs = newClassProficiencyGrants.value;
      }
      const newLevelChoices: LevelChoices = {
        ...member.level_choices,
        [nextLevel.value]: choiceEntry,
      };
      await updateMember({ id: member.id, update: { level_choices: newLevelChoices } });

      // Multi-level loop or done
      if (targetLevel && nextLevel.value < targetLevel) {
        void router.push(`/play/character/levelup?targetLevel=${targetLevel}`);
      } else {
        void router.push(backRoute ?? "/play");
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to apply level up.";
    }
  }

  return { confirm, error, isPending };
}
