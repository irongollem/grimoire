import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useFeaturesByIds } from "@/composables/rules/useFeatures";
import {
  actionsByActivation,
  activeToggles as activeTogglesOf,
  damageRidersFor,
  featureIdsNeeded,
  grantedFeatures,
  resourcePools,
  type GrantedClassInput,
} from "@/rules/features/characterFeatures";
import type { AttackShape } from "@/rules/features/resolve";
import type { PartyMember } from "@/types/party.types";

/**
 * Everything a character has from its features and feats, as the sheet, the
 * roller and the rest handler need it. Definitions resolve by stored id and the
 * features by `useFeaturesByIds` (no edition filter), so a table that names a
 * feature always finds it.
 */
export function useCharacterFeatures(member: Ref<PartyMember>) {
  const memberId = computed(() => member.value.id);
  const classesQuery = useCharacterClasses(memberId);
  const systemQuery = useAllSystemClasses();
  const customQuery = useAllCustomClasses();
  const subclassQuery = useAllCustomSubclasses();

  const classInputs = computed<GrantedClassInput[]>(() =>
    (classesQuery.data.value ?? []).map((cc) => {
      const definitions = cc.class_definition_kind === "custom" ? customQuery.data.value : systemQuery.data.value;
      const classDef = (definitions ?? []).find((d) => d.id === cc.class_definition_id);
      const subclassDef = cc.subclass_definition_id
        ? (subclassQuery.data.value ?? []).find((d) => d.id === cc.subclass_definition_id)
        : undefined;
      return {
        className: cc.class_name,
        subclassName: cc.subclass_name,
        levels: cc.levels,
        classMap: classDef ? classDef.features : null,
        subclassMap: subclassDef ? subclassDef.features : null,
      };
    }),
  );

  const featureIds = computed(() => featureIdsNeeded(classInputs.value, member.value.class_choices));
  const featuresQuery = useFeaturesByIds(featureIds);
  const featuresById = computed(() => new Map((featuresQuery.data.value ?? []).map((f) => [f.id, f])));

  const granted = computed(() =>
    grantedFeatures({
      classes: classInputs.value,
      featuresById: featuresById.value,
      classChoices: member.value.class_choices,
      levelChoices: member.value.level_choices,
      characterLevel: member.value.level,
    }),
  );

  const pools = computed(() =>
    resourcePools(granted.value, {
      proficiencyBonus: member.value.proficiency_bonus,
      abilityScores: {
        str: member.value.str,
        dex: member.value.dex,
        con: member.value.con,
        int: member.value.int,
        wis: member.value.wis,
        cha: member.value.cha,
      },
      characterLevel: member.value.level,
    }),
  );

  const actions = computed(() => actionsByActivation(granted.value));
  const activeToggles = computed(() => activeTogglesOf(member.value.class_choices));

  function riders(attack: AttackShape, slotLevel?: number) {
    return damageRidersFor(granted.value, attack, activeToggles.value, slotLevel);
  }

  const error = computed(
    () =>
      classesQuery.error.value ??
      systemQuery.error.value ??
      customQuery.error.value ??
      subclassQuery.error.value ??
      featuresQuery.error.value ??
      null,
  );
  const isPending = computed(
    () => classesQuery.isPending.value || systemQuery.isPending.value || customQuery.isPending.value ||
      subclassQuery.isPending.value || (featureIds.value.length > 0 && featuresQuery.isPending.value),
  );

  return { granted, pools, actions, activeToggles, riders, isPending, error };
}
