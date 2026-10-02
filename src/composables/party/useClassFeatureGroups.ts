import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { mapFeatureIds, type FeatureEntry } from "@/levelup/types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";
import type { ClassFeatureGroup } from "@/components/player/PlayerClassFeaturesList.vue";

/**
 * Groups a character's class features (and subclass features) by class, for
 * `PlayerClassFeaturesList`. Every row is pinned to a class (and subclass)
 * definition, so definitions are resolved by id; a classless character has no
 * rows and no groups.
 */
export function useClassFeatureGroups(member: Ref<PartyMember>) {
  const { data: allFeatures, isPending: featuresPending } = useAllFeatures();
  const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

  const memberIdRef = computed(() => member.value.id);
  const { data: characterClasses, isPending: classesPending } = useCharacterClasses(memberIdRef);
  const { data: allSystemClasses } = useAllSystemClasses();
  const { data: allCustomClasses } = useAllCustomClasses();
  const { data: allCustomSubclassEntries } = useAllCustomSubclasses();

  const featureDataPending = computed(() => featuresPending.value || classesPending.value);

  function classDefinitionFor(entry: CharacterClass) {
    const definitions = entry.class_definition_kind === "custom"
      ? (allCustomClasses.value ?? [])
      : (allSystemClasses.value ?? []);
    return definitions.find(definition => definition.id === entry.class_definition_id) ?? null;
  }

  function subclassDefinitionFor(entry: CharacterClass) {
    return (allCustomSubclassEntries.value ?? []).find(
      definition => definition.id === entry.subclass_definition_id,
    ) ?? null;
  }

  function buildFeaturesByLevel(
    cls: { features: Record<string, string[]> } | null | undefined,
    maxLevel: number,
  ): Record<number, FeatureEntry[]> {
    if (!cls) return {};
    const result: Record<number, FeatureEntry[]> = {};
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      const entries = mapFeatureIds(cls.features[lvl.toString()] ?? [], featureObjectMap.value);
      if (entries.length > 0) result[lvl] = entries;
    }
    return result;
  }

  const classFeatureGroups = computed<ClassFeatureGroup[]>(() => {
    return (characterClasses.value ?? []).map(cc => ({
      class_name: cc.class_name,
      subclass_name: cc.subclass_name,
      levels: cc.levels,
      featuresByLevel: buildFeaturesByLevel(classDefinitionFor(cc), cc.levels),
      subclassFeaturesByLevel: buildFeaturesByLevel(subclassDefinitionFor(cc), cc.levels),
    }));
  });

  return {
    characterClasses,
    classFeatureGroups,
    featureDataPending,
    classDefinitionFor,
    subclassDefinitionFor,
  };
}
