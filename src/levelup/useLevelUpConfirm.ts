import type { Ref, ComputedRef } from "vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep, ClassResourceDef } from "./types";
import { buildLevelUpPayload } from "./buildLevelUpPayload";

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
  /** All spell ids the character already has — granted spells skip these. */
  existingSpellIds: ComputedRef<Set<string>>;
}

export function useLevelUpConfirm(opts: ConfirmOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const error = ref("");
  const isPending = ref(false);

  async function confirm() {
    error.value = "";
    const {
      member, targetLevel, backRoute,
      nextLevel, newProfBonus, hpGain, newHitDiceCount,
      postLevelupSpellSlots, grantsAsi, needsSubclassChoice,
      classDefs, levelInChosenClass, classSteps, isAddingNewClass,
      newClassProficiencyGrants, memberClass, chosenExistingEntry,
      existingClassOptions,
      asiMode, asiPrimary, asiSecondary, featId,
      subclassInput, stepValues, stepMultiValues,
      selectedSpellIds, selectedCantripIds, newClassName,
      grantedSpellsForThisLevel, existingSpellIds,
    } = opts;

    // Backstop: a level-up must know which class entry it is bumping. Without
    // this, party_members would get the new level while character_classes is
    // silently skipped, leaving the two tables out of sync.
    if (!isAddingNewClass.value && !chosenExistingEntry.value && existingClassOptions.value.length > 0) {
      error.value = "Select which class you are leveling in before confirming.";
      return;
    }

    // Assemble the entire level-up as one payload. Nothing is written until the
    // RPC runs, and the RPC applies all three tables in a single transaction —
    // so a failure can never leave a half-leveled character.
    const payload = buildLevelUpPayload({
      member,
      nextLevel: nextLevel.value,
      newProfBonus: newProfBonus.value,
      hpGain: hpGain.value,
      newHitDiceCount: newHitDiceCount.value,
      postLevelupSpellSlots: postLevelupSpellSlots.value,
      grantsAsi: grantsAsi.value,
      needsSubclassChoice: needsSubclassChoice.value,
      classDefs: classDefs.value,
      levelInChosenClass: levelInChosenClass.value,
      classSteps: classSteps.value,
      isAddingNewClass: isAddingNewClass.value,
      newClassProficiencyGrants: newClassProficiencyGrants.value,
      memberClass: memberClass.value,
      chosenExistingEntry: chosenExistingEntry.value,
      existingClassOptions: existingClassOptions.value,
      asiMode: asiMode.value,
      asiPrimary: asiPrimary.value,
      asiSecondary: asiSecondary.value,
      featId: featId.value,
      subclassInput: subclassInput.value,
      stepValues: stepValues.value,
      stepMultiValues: stepMultiValues.value,
      selectedSpellIds: selectedSpellIds.value,
      selectedCantripIds: selectedCantripIds.value,
      newClassName: newClassName.value,
      grantedSpellsForThisLevel: grantedSpellsForThisLevel.value,
      existingSpellIds: existingSpellIds.value,
    });

    isPending.value = true;
    try {
      const { error: rpcError } = await supabase.rpc("apply_level_up", {
        p_member_id: member.id,
        p_member_update: payload.memberUpdate,
        p_class_op: payload.classOp,
        p_spell_rows: payload.spellRows,
      });
      if (rpcError) throw rpcError;

      // One RPC replaces the old per-table mutation hooks, so invalidate the
      // caches those hooks used to refresh.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["party"] }),
        queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
        queryClient.invalidateQueries({ queryKey: ["character_classes", member.id] }),
        queryClient.invalidateQueries({ queryKey: ["characterSpells", member.id] }),
        queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", member.id] }),
      ]);

      // Multi-level loop or done. The parent route refetches the (now updated)
      // member and re-mounts the wizard for the next level.
      if (targetLevel && nextLevel.value < targetLevel) {
        // Preserve memberId across the loop — without it the next hop falls back
        // to auth.linkedPartyMemberId and a DM's XP catch-up jumps to the wrong
        // (or no) character after level 1.
        void router.push(`/play/character/levelup?targetLevel=${targetLevel}&memberId=${member.id}`);
      } else {
        void router.push(backRoute ?? "/play");
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to apply level up.";
    } finally {
      isPending.value = false;
    }
  }

  return { confirm, error, isPending };
}
