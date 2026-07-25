import { computed, type Ref } from "vue";
import { useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { AMMO_TAGS, ANY_AMMO_TAG, ammoTagFromName, type AmmoTag, type WeaponAmmoTag } from "@/lib/ammunition";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

/**
 * Decrements an inventory stack's quantity by one, or removes the row
 * entirely when it was the last one. Shared by anything that spends one unit
 * of a stackable inventory item (ammo, thrown weapons).
 */
export interface StackMutators {
  updateInventoryItem: ReturnType<typeof useUpdateInventoryItem>;
  removeInventoryItem: ReturnType<typeof useRemoveInventoryItem>;
}

export function consumeOneFromStack(inv: PartyInventoryItem, mutators: StackMutators) {
  if (inv.quantity > 1) {
    mutators.updateInventoryItem.mutate({ id: inv.id, update: { quantity: inv.quantity - 1 } });
  } else {
    mutators.removeInventoryItem.mutate(inv.id);
  }
}

/**
 * Ammunition selection + consumption for a single combatant, shared by the DM
 * encounter runner (`RunnerPcAttacks`) and the player's own combat tab
 * (`PlayerCombatTab`). Both supply their own reactive view of the member's
 * inventory and a vault-item lookup, because they source the vault differently
 * (full vault vs. player-visible items).
 */
export function useAmmoConsumption(
  memberInventory: Ref<PartyInventoryItem[]>,
  vaultItemMap: Ref<Map<string, Item>>,
) {
  const updateInventoryItem = useUpdateInventoryItem();
  const removeInventoryItem = useRemoveInventoryItem();

  const memberContainerIds = computed<Set<string>>(() => {
    const s = new Set<string>();
    for (const i of memberInventory.value) if (i.is_container) s.add(i.id);
    return s;
  });

  /** Classifies an inventory stack's own ammo kind — the same tag `weaponAmmoTag` would want to match. */
  function ammoStackTag(inv: PartyInventoryItem): AmmoTag | null {
    const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    if (vaultItem) {
      if (vaultItem.tags.includes("firearm")) return "firearm-bullet";
      return AMMO_TAGS.find((t) => vaultItem.tags.includes(t)) ?? null;
    }
    return ammoTagFromName(inv.name);
  }

  /** The best matching, non-empty ammo stack for `ammoTag`: quiver/container → belt → backpack. */
  function availableAmmoFor(ammoTag: WeaponAmmoTag): PartyInventoryItem | null {
    const candidates = memberInventory.value.filter((inv) => {
      const tag = ammoStackTag(inv);
      if (tag === null) return false;
      // The generic "any" tag (weapon needs ammo, kind unknown) matches any recognized ammo stack.
      if (ammoTag !== ANY_AMMO_TAG && tag !== ammoTag) return false;
      const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
      const maxCharges = vaultItem?.charges ?? null;
      const remaining = inv.current_charges !== null ? inv.current_charges : maxCharges;
      if (remaining !== null && remaining <= 0) return false;
      if (remaining === null && inv.quantity <= 0) return false;
      return true;
    });
    const inContainer = candidates.filter((i) => i.location === "container" && memberContainerIds.value.has(i.container_id ?? ""));
    const onBelt = candidates.filter((i) => i.location === "belt");
    const inBackpack = candidates.filter((i) => i.location === "backpack");
    return inContainer[0] ?? onBelt[0] ?? inBackpack[0] ?? null;
  }

  function ammoRemainingCount(inv: PartyInventoryItem | null): number {
    if (!inv) return 0;
    const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    const maxCharges = vaultItem?.charges ?? null;
    if (inv.current_charges !== null) return inv.current_charges;
    if (maxCharges !== null) return maxCharges;
    return inv.quantity;
  }

  /** Spends one unit of ammo from the best matching stack — a charge, or a stack quantity. */
  function consumeAmmo(ammoTag: WeaponAmmoTag) {
    const inv = availableAmmoFor(ammoTag);
    if (!inv) return;
    const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    const maxCharges = vaultItem?.charges ?? null;
    if (maxCharges !== null) {
      const current = inv.current_charges !== null ? inv.current_charges : maxCharges;
      updateInventoryItem.mutate({ id: inv.id, update: { current_charges: Math.max(0, current - 1) } });
    } else {
      consumeOneFromStack(inv, { updateInventoryItem, removeInventoryItem });
    }
  }

  // ── Self-charged weapons (laser rifle, internal-magazine firearms, etc.) ────
  function weaponMaxCharges(weaponInvId: string): number {
    const inv = memberInventory.value.find((i) => i.id === weaponInvId);
    const vaultItem = inv?.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    return vaultItem?.charges ?? 0;
  }

  function weaponSelfChargesRemaining(weaponInvId: string, maxCharges: number): number {
    const inv = memberInventory.value.find((i) => i.id === weaponInvId);
    if (!inv) return 0;
    return inv.current_charges !== null ? inv.current_charges : maxCharges;
  }

  function consumeWeaponCharge(weaponInvId: string, maxCharges: number) {
    const remaining = weaponSelfChargesRemaining(weaponInvId, maxCharges);
    updateInventoryItem.mutate({ id: weaponInvId, update: { current_charges: Math.max(0, remaining - 1) } });
  }

  return {
    availableAmmoFor,
    ammoRemainingCount,
    consumeAmmo,
    weaponMaxCharges,
    weaponSelfChargesRemaining,
    consumeWeaponCharge,
  };
}
