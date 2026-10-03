import { computed } from "vue";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/rules/useCustomClasses";
import { hitDieForClassRow, type HitDieDefinitions } from "@/rules/classHitDie";
import type { CharacterClass } from "@/types/multiclass.types";

/**
 * The loaded class definitions in the shape `hitDieForClassRow` reads, so the
 * rest dialog and the character header resolve a hit die the same way: from
 * the definition a class row is pinned to.
 */
export function useClassHitDice() {
  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  const definitions = computed<HitDieDefinitions>(() => ({
    system: systemClasses.value ?? [],
    custom: customClasses.value ?? [],
  }));
  const hitDieOf = (row: Pick<CharacterClass, "class_definition_id" | "class_definition_kind">) =>
    hitDieForClassRow(row, definitions.value);
  return { hitDieOf };
}
