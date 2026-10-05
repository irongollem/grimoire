import type { Ref, ComputedRef } from "vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import type { StoredClassResources } from "@/rules/features/characterFeatures";
import { buildLevelUpPayload } from "./buildLevelUpPayload";
import type { ResolvedPicks } from "./levelPicks";

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
  needsSubclassChoice: ComputedRef<boolean>;
  /** What the level's choices resolved to, and the class_resources once they land. */
  picks: ComputedRef<ResolvedPicks>;
  classResources: ComputedRef<StoredClassResources>;
  isAddingNewClass: ComputedRef<boolean>;
  newClassProficiencyGrants: ComputedRef<string[]>;
  memberClass: ComputedRef<string>;
  chosenExistingEntry: ComputedRef<{ id: string; levels: number; class_definition_id: string; subclass_name?: string | null; is_primary?: boolean } | null>;
  existingClassOptions: ComputedRef<{ id: string; class_name: string; levels: number; is_primary?: boolean }[]>;

  // Mutable state (refs)
  hpMode: Ref<"average" | "roll" | "max">;
  rolledHp: Ref<number | null>;
  subclassInput: Ref<string>;
  subclassDefinitionId: ComputedRef<string | null>;
  selectedSpellIds: Ref<Set<string>>;
  selectedCantripIds: Ref<Set<string>>;
  newClassName: Readonly<Ref<string>>;
  newClassDefinitionId: ComputedRef<string | null>;
  newClassDefinitionKind: ComputedRef<"system" | "custom" | null>;
  /** Spell ids granted (always prepared) by the leveled subclass at this level. */
  grantedSpellsForThisLevel: ComputedRef<string[]>;
  /** All spell ids the character already has — granted spells skip these. */
  existingSpellIds: ComputedRef<Set<string>>;
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") return e.message;
  return fallback;
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
      postLevelupSpellSlots, needsSubclassChoice, picks, classResources,
      isAddingNewClass,
      newClassProficiencyGrants, memberClass, chosenExistingEntry,
      existingClassOptions,
      subclassInput, subclassDefinitionId,
      selectedSpellIds, selectedCantripIds, newClassName,
      newClassDefinitionId, newClassDefinitionKind,
      grantedSpellsForThisLevel, existingSpellIds,
    } = opts;

    // Backstop: a level-up must know which class entry it is bumping, or which
    // class it adds (a classless character adds its first). Without this,
    // party_members would get the new level while character_classes is silently
    // skipped, leaving the two tables out of sync.
    if (!isAddingNewClass.value && !chosenExistingEntry.value) {
      error.value = "Select which class you are leveling in before confirming.";
      return;
    }

    // Assemble the entire level-up as one payload. Nothing is written until the
    // RPC runs, and the RPC applies all three tables in a single transaction —
    // so a failure can never leave a half-leveled character.
    let payload: ReturnType<typeof buildLevelUpPayload>;
    try {
      payload = buildLevelUpPayload({
        member,
        nextLevel: nextLevel.value,
        newProfBonus: newProfBonus.value,
        hpGain: hpGain.value,
        newHitDiceCount: newHitDiceCount.value,
        postLevelupSpellSlots: postLevelupSpellSlots.value,
        needsSubclassChoice: needsSubclassChoice.value,
        picks: picks.value,
        classResources: classResources.value,
        isAddingNewClass: isAddingNewClass.value,
        newClassProficiencyGrants: newClassProficiencyGrants.value,
        memberClass: memberClass.value,
        chosenExistingEntry: chosenExistingEntry.value,
        existingClassOptions: existingClassOptions.value,
        subclassInput: subclassInput.value,
        subclassDefinitionId: subclassDefinitionId.value,
        selectedSpellIds: selectedSpellIds.value,
        selectedCantripIds: selectedCantripIds.value,
        newClassName: newClassName.value,
        newClassDefinitionId: newClassDefinitionId.value,
        newClassDefinitionKind: newClassDefinitionKind.value,
        grantedSpellsForThisLevel: grantedSpellsForThisLevel.value,
        existingSpellIds: existingSpellIds.value,
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not prepare the level up.";
      return;
    }

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
      // A PostgREST error is a plain object with a message, not an Error: the server's own words
      // ("... is not a feat this character can take") are the ones worth showing.
      error.value = errorMessage(e, "Failed to apply level up.");
    } finally {
      isPending.value = false;
    }
  }

  return { confirm, error, isPending };
}
