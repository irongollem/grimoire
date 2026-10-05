import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";

/**
 * A character's class rows with the class and subclass definitions each one is
 * pinned to. The Features and Wild Shape tabs need these for spell slots and
 * level-up steps; the features themselves come from `useCharacterFeatures`.
 */
export function useClassDefinitionLookup(member: Ref<PartyMember>) {
  const memberId = computed(() => member.value.id);
  const { data: characterClasses } = useCharacterClasses(memberId);
  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  const { data: customSubclasses } = useAllCustomSubclasses();

  function classDefinitionFor(entry: CharacterClass) {
    const definitions = entry.class_definition_kind === "custom" ? customClasses.value : systemClasses.value;
    return (definitions ?? []).find(definition => definition.id === entry.class_definition_id) ?? null;
  }

  function subclassDefinitionFor(entry: CharacterClass) {
    return (customSubclasses.value ?? []).find(definition => definition.id === entry.subclass_definition_id) ?? null;
  }

  return { characterClasses, classDefinitionFor, subclassDefinitionFor };
}
