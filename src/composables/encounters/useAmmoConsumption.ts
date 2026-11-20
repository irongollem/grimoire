import { computed, type Ref } from "vue";
import { useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/items/usePartyInventory";
import { inventoryItemRef } from "@/lib/itemRef";
import {
  ammoWrite, availableAmmoFor as availableAmmo, chargeWrite, remainingOf, takeUnit, weaponChargesLeft, weaponMaxCharges as maxChargesOf,
  type CarriedGear, type GearWrite,
} from "@/rules/fight/pcAttacks/gear";
import type { WeaponAmmoTag } from "@/rules/ammunition";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

/** The mutations that write a stack back; what `runGearWrite` and `consumeOneFromStack` need. */
export interface StackMutators {
  updateInventoryItem: ReturnType<typeof useUpdateInventoryItem>;
  removeInventoryItem: ReturnType<typeof useRemoveInventoryItem>;
}

/** Runs one write the shared ammunition rules (`rules/fight/pcAttacks/gear.ts`) worked out. */
export function runGearWrite(write: GearWrite, mutators: StackMutators) {
  if (write.kind === "remove") mutators.removeInventoryItem.mutate(write.inventoryId);
  else mutators.updateInventoryItem.mutate({ id: write.inventoryId, update: write.kind === "quantity" ? { quantity: write.quantity } : { current_charges: write.charges } });
}

/** Spends one unit of a stackable inventory item (a thrown weapon), removing the row when it was the last. */
export function consumeOneFromStack(inv: PartyInventoryItem, mutators: StackMutators) {
  runGearWrite(takeUnit(inv), mutators);
}

/**
 * Ammunition selection + consumption for a single combatant, shared by the DM encounter runner (`RunnerPcAttacks`) and
 * the player's own combat tab (`PlayerCombatTab`). The rules (which stack, what a shot costs) are
 * `rules/fight/pcAttacks/gear.ts`, the same ones the server uses for an ally; this only supplies the reactive inventory and
 * runs the writes. Each caller supplies its own vault-item lookup, because they source the vault differently.
 *
 * An item is found through `inventoryItemRef`, so a stack sourced from the shared library resolves its item (tags, charges)
 * as a campaign item's does. The browser used to read `item_id` alone, which left a library stack unclassified by its item.
 */
export function useAmmoConsumption(
  memberInventory: Ref<PartyInventoryItem[]>,
  vaultItemMap: Ref<Map<string, Item>>,
) {
  const updateInventoryItem = useUpdateInventoryItem();
  const removeInventoryItem = useRemoveInventoryItem();
  const mutators: StackMutators = { updateInventoryItem, removeInventoryItem };

  const gear = computed<CarriedGear>(() => ({
    inventory: memberInventory.value,
    itemOf: (inv) => {
      const ref = inventoryItemRef(inv);
      return ref === null ? undefined : vaultItemMap.value.get(ref);
    },
  }));

  const availableAmmoFor = (ammoTag: WeaponAmmoTag) => availableAmmo(ammoTag, gear.value);
  const ammoRemainingCount = (inv: PartyInventoryItem | null) => (inv === null ? 0 : remainingOf(inv, gear.value));

  function consumeAmmo(ammoTag: WeaponAmmoTag) {
    const write = ammoWrite(ammoTag, gear.value);
    if (write !== null) runGearWrite(write, mutators);
  }

  const weaponMaxCharges = (weaponInvId: string) => maxChargesOf(weaponInvId, gear.value);
  const weaponSelfChargesRemaining = (weaponInvId: string, maxCharges: number) => weaponChargesLeft(weaponInvId, gear.value, maxCharges);
  const consumeWeaponCharge = (weaponInvId: string, maxCharges: number) => runGearWrite(chargeWrite(weaponInvId, gear.value, maxCharges), mutators);

  return { availableAmmoFor, ammoRemainingCount, consumeAmmo, weaponMaxCharges, weaponSelfChargesRemaining, consumeWeaponCharge };
}
