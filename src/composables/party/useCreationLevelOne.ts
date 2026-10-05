import { computed, ref, watch, type ComputedRef } from "vue";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/rules/useOptionalRules";
import type { CharacterFormState, AbilityKey } from "@/rules/characterCreation";
import type { ChoiceValue } from "@/components/features/choiceValue";
import { armorTrainingOf } from "@/levelup/armorTraining";
import { useLevelUpFeatures } from "@/levelup/useLevelUpFeatures";
import type { FeatureMap } from "@/levelup/levelUpProjection";
import type { PartyMember } from "@/types/party.types";

/** What the wizard needs from the class the player picked. */
export interface CreationClass {
  class_name: string;
  features: FeatureMap | null;
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
}

export interface CreationLevelOneInput {
  f: CharacterFormState;
  /** Null while no class is picked, or while editing (an edit never asks level 1 again). */
  selectedClass: ComputedRef<CreationClass | null>;
  /** The subclass answered at creation, when the class picks one at level 1. */
  pickedSubclass: ComputedRef<{ name: string; features: FeatureMap | null } | null>;
  /** The scores the character will have once species and background increases land. */
  finalScores: ComputedRef<Record<AbilityKey, number>>;
  canCastSpells: ComputedRef<boolean>;
}

const STARTING_PROFICIENCY_BONUS = 2;

/**
 * The level-1 choices of a new character, asked by the same machinery as a
 * level-up (#976): the character is a level-0 member taking its first level in
 * the picked class, so `choicesDue` runs 0 to 1 and the origin feat's own choice
 * (2024 Skilled) is due in the same pass. Everything here is read-only over the
 * form; the save writes the result through `levelOneWrites`.
 */
export function useCreationLevelOne(input: CreationLevelOneInput) {
  const { f } = input;
  const { ruleset } = useRuleset();
  const { data: campaignRulesData } = useOptionalRules();

  const values = ref<Record<string, ChoiceValue>>({});
  const swapPicks = ref<Record<string, string>>({});
  // Starts closed: the choices card reports true as soon as it mounts with nothing owed.
  const complete = ref(false);

  // The level-up machinery reads a stored member. A new character is one at
  // level 0 whose scores are the ones it will end up with.
  const member = computed<PartyMember>(() => ({
    ...f,
    id: "",
    level: 0,
    proficiency_bonus: STARTING_PROFICIENCY_BONUS,
    ...input.finalScores.value,
    weapon_masteries: f.weapon_masteries,
    level_choices: {},
  }) as PartyMember);

  const className = computed(() => input.selectedClass.value?.class_name ?? "");

  const features = useLevelUpFeatures({
    member: () => member.value,
    ruleset,
    rows: computed(() => []),
    chosenRowId: computed(() => null),
    newClass: computed(() => {
      const cls = input.selectedClass.value;
      return cls === null ? null : { className: cls.class_name, classFeatures: cls.features, startLevels: 1 };
    }),
    pickedSubclass: input.pickedSubclass,
    className,
    classLevel: computed(() => 1),
    nextLevel: computed(() => 1),
    newProfBonus: computed(() => STARTING_PROFICIENCY_BONUS),
    weaponProficiencies: computed(() => input.selectedClass.value?.weapon_proficiencies ?? []),
    canCastSpells: input.canCastSpells,
    armorProficiencies: computed(() => armorTrainingOf(input.selectedClass.value?.armor_proficiencies ?? [])),
    tashasOn: computed(() => isRuleEffectivelyEnabled(campaignRulesData.value, "tashas_optional_features")),
    values,
    swapPicks,
  });

  const featsAllowed = computed(
    () => ruleset.value === "2024" || isRuleEffectivelyEnabled(campaignRulesData.value, "feats_2014"),
  );

  // Answers belong to the class and the origin feat they were given for: a
  // different class asks different questions, and a stale answer would be
  // written against a feature the character no longer has.
  const identity = computed(() => [
    ruleset.value,
    className.value,
    input.pickedSubclass.value?.name ?? "",
    typeof f.class_choices.origin_feat_id === "string" ? f.class_choices.origin_feat_id : "",
  ].join("|"));
  watch(identity, () => {
    values.value = {};
    swapPicks.value = {};
  });

  return { ...features, values, swapPicks, complete, featsAllowed };
}
