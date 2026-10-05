import { computed, ref, watch, type Ref } from "vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import type { PartyMember } from "@/types/party.types";
import type { UsesCost } from "@/rules/features/mechanics.types";
import {
  classResourcesChanged,
  classResourcesFor,
  type ResourcePool,
  type StoredClassResources,
} from "@/rules/features/characterFeatures";
import { canPay, payCost, remainingUses, restoreUses, withToggle, type Remaining } from "@/rules/features/uses";

/**
 * Writes a character's feature uses and toggles (#976): the one place the
 * Features tab, the Actions list and the encounter runner spend Rage, Ki or
 * Channel Divinity, so two surfaces cannot disagree about what is left.
 *
 * Writes build on the last value this composable wrote until the character
 * refetches with it, so two quick taps spend two uses rather than writing the
 * same "one fewer" twice.
 */
export function useFeatureUses(member: Ref<PartyMember>, pools: Ref<readonly ResourcePool[]>) {
  const { mutateAsync: updateMember, isPending: isSaving, error } = useUpdatePartyMember();

  const resources = ref<StoredClassResources>(member.value.class_resources);
  const choices = ref<Record<string, unknown>>(member.value.class_choices);
  watch(() => member.value.class_resources, next => { resources.value = next; });
  watch(() => member.value.class_choices, next => { choices.value = next; });

  // The refs are applied before the write so quick taps build on each other; a
  // failed write puts the previous values back, otherwise the sheet would show a
  // spend the database never took. The error is rethrown so callers still toast.
  async function writeResources(next: StoredClassResources) {
    const previous = resources.value;
    resources.value = next;
    try {
      await updateMember({ id: member.value.id, update: { class_resources: next } });
    } catch (e) {
      resources.value = previous;
      throw e;
    }
  }

  async function writeChoicesAndResources(nextChoices: Record<string, unknown>, nextResources: StoredClassResources) {
    const previousChoices = choices.value;
    const previousResources = resources.value;
    choices.value = nextChoices;
    resources.value = nextResources;
    try {
      await updateMember({
        id: member.value.id,
        update: { class_choices: nextChoices, class_resources: nextResources },
      });
    } catch (e) {
      choices.value = previousChoices;
      resources.value = previousResources;
      throw e;
    }
  }

  function remaining(key: string): Remaining {
    return remainingUses(resources.value, pools.value, key);
  }

  function payable(cost: UsesCost | null): boolean {
    return cost === null || canPay(resources.value, pools.value, cost);
  }

  /** Spends a cost. Throws (and writes nothing) when it cannot be paid. */
  async function spend(cost: UsesCost) {
    await writeResources(payCost(resources.value, pools.value, cost));
  }

  async function restore(key: string, amount = 1) {
    await writeResources(restoreUses(resources.value, pools.value, key, amount));
  }

  /** Switches a toggle. Switching it on pays its cost in the same write. */
  async function setToggle(key: string, on: boolean, cost: UsesCost | null) {
    const nextResources = on && cost ? payCost(resources.value, pools.value, cost) : resources.value;
    await writeChoicesAndResources(withToggle(choices.value, key, on), nextResources);
  }

  /**
   * The stored pools as the character's features say they should be: a new
   * pool appears full, a max follows a level or an ability score, a pool no
   * feature grants any more goes. Written only when something differs, and
   * only by someone who may write the character (the caller decides).
   */
  const reconciled = computed(() => classResourcesFor([...pools.value], resources.value));
  const needsReconcile = computed(() => classResourcesChanged(reconciled.value, resources.value));

  async function reconcile() {
    if (needsReconcile.value) await writeResources(reconciled.value);
  }

  function isOn(key: string): boolean {
    return choices.value[`${key}_active`] === true;
  }

  return { remaining, payable, spend, restore, setToggle, isOn, reconcile, needsReconcile, isSaving, error };
}
