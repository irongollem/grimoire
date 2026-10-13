import { computed, ref, watch, type Ref } from "vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import type { PartyMember } from "@/types/party.types";
import { useWildshapeDruid } from "@/composables/player/useWildshapeDruid";
import { WILD_SHAPE_KEY, type UsesCost } from "@/rules/features/mechanics.types";
import { wildShapeLeft, wildShapePool } from "@/rules/features/wildShapePool";
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

  // Wild Shape is a pool a feature may spend, but its count is `wildshapes_used`
  // on the character (the Wild Shape tab's own write), not a class resource.
  const druid = useWildshapeDruid(computed(() => member.value.id), () => member.value);
  const wildPool = computed(() => wildShapePool(druid.rules.value));
  const allPools = computed<readonly ResourcePool[]>(() => (wildPool.value ? [...pools.value, wildPool.value] : pools.value));
  const wildUsed = ref(member.value.wildshapes_used ?? 0);
  watch(() => member.value.wildshapes_used, next => { wildUsed.value = next ?? 0; });

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
    if (key === WILD_SHAPE_KEY) return wildPool.value ? wildShapeLeft(wildPool.value, wildUsed.value) : null;
    return remainingUses(resources.value, pools.value, key);
  }

  function payable(cost: UsesCost | null): boolean {
    if (cost === null) return true;
    if (cost.key === WILD_SHAPE_KEY) {
      const left = remaining(cost.key);
      return left !== null && (left === "unlimited" || left >= cost.amount);
    }
    return canPay(resources.value, pools.value, cost);
  }

  /** The spent Wild Shape count after paying `cost`; throws when it cannot be paid. */
  function wildUsedAfter(cost: UsesCost): number {
    if (!payable(cost)) throw new Error("No Wild Shape left");
    return wildPool.value?.max === "unlimited" ? wildUsed.value : wildUsed.value + cost.amount;
  }

  async function writeWildUsed(next: number) {
    const previous = wildUsed.value;
    wildUsed.value = next;
    try {
      await updateMember({ id: member.value.id, update: { wildshapes_used: next } });
    } catch (e) {
      wildUsed.value = previous;
      throw e;
    }
  }

  /** Spends a cost. Throws (and writes nothing) when it cannot be paid. */
  async function spend(cost: UsesCost) {
    if (cost.key === WILD_SHAPE_KEY) {
      await writeWildUsed(wildUsedAfter(cost));
      return;
    }
    await writeResources(payCost(resources.value, pools.value, cost));
  }

  async function restore(key: string, amount = 1) {
    if (key === WILD_SHAPE_KEY) {
      if (wildPool.value) await writeWildUsed(Math.max(0, wildUsed.value - amount));
      return;
    }
    await writeResources(restoreUses(resources.value, pools.value, key, amount));
  }

  /** Switches a toggle. Switching it on pays its cost in the same write. */
  async function setToggle(key: string, on: boolean, cost: UsesCost | null) {
    if (on && cost && cost.key === WILD_SHAPE_KEY) {
      const nextUsed = wildUsedAfter(cost);
      const previousChoices = choices.value;
      const previousUsed = wildUsed.value;
      const nextChoices = withToggle(choices.value, key, on);
      choices.value = nextChoices;
      wildUsed.value = nextUsed;
      try {
        await updateMember({ id: member.value.id, update: { class_choices: nextChoices, wildshapes_used: nextUsed } });
      } catch (e) {
        choices.value = previousChoices;
        wildUsed.value = previousUsed;
        throw e;
      }
      return;
    }
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

  return { remaining, payable, spend, restore, setToggle, isOn, reconcile, needsReconcile, isSaving, error, pools: allPools };
}
