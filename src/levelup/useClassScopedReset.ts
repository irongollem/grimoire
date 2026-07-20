import { watch } from "vue";
import type { ComputedRef, Ref } from "vue";

export interface ClassScopedSelectionRefs {
  /** Definition id of a subclass just picked this level-up. */
  subclassDefinitionId: Ref<string>;
  /** Name of a subclass just picked this level-up. */
  subclassInput: Ref<string>;
  /** Spell ids picked to fill this level's known-spell gain. */
  selectedSpellIds: Ref<Set<string>>;
  /** Cantrip ids picked to fill this level's known-cantrip gain. */
  selectedCantripIds: Ref<Set<string>>;
  /** Single-value answers to this level's class-specific steps. */
  stepValues: Ref<Record<string, string>>;
  /** Multi-value answers to this level's class-specific steps. */
  stepMultiValues: Ref<Record<string, string[]>>;
}

/**
 * Clears every per-class selection whenever the chosen class identity
 * changes. Without this, switching from class A (subclass already picked)
 * to class B still carries A's subclassDefinitionId alongside B's freshly
 * typed subclass name — buildLevelUpPayload sends both together, and the
 * server's class-name-mismatch trigger (migration 20260720000030) rejects
 * the level-up outright. Spell/cantrip picks and class-step answers are
 * equally class-scoped (they come from the class being leveled) so they are
 * cleared for the same reason, not just for tidiness.
 *
 * `classIdentityKey` should uniquely identify "which class is being leveled
 * this level-up" — e.g. the chosen existing character_classes row id, or
 * `new:<definitionKey>` when adding a new class.
 */
export function useClassScopedReset(
  classIdentityKey: ComputedRef<string>,
  refs: ClassScopedSelectionRefs,
): void {
  watch(classIdentityKey, () => {
    refs.subclassDefinitionId.value = "";
    refs.subclassInput.value = "";
    refs.selectedSpellIds.value = new Set();
    refs.selectedCantripIds.value = new Set();
    refs.stepValues.value = {};
    refs.stepMultiValues.value = {};
  });
}
