import { ref, type Ref, type ComputedRef } from "vue";
import type {
  PartyInventoryItem,
  InventorySlot,
} from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import {
  useAddInventoryItem,
  useUpdateInventoryItem,
} from "@/composables/usePartyInventory";

interface UseInventorySlotsOptions {
  equippedItems: ComputedRef<PartyInventoryItem[]>;
  myItems: ComputedRef<PartyInventoryItem[]>;
  allItems: ComputedRef<Item[] | undefined>;
  selectedInv: Ref<PartyInventoryItem | null>;
}

export function useInventorySlots({
  equippedItems,
  myItems,
  allItems,
  selectedInv,
}: UseInventorySlotsOptions) {
  const { mutateAsync: addInventoryItem } = useAddInventoryItem();
  const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();

  const slotModal = ref<InventorySlot | null>(null);

  function slotItem(slot: InventorySlot): PartyInventoryItem | null {
    return equippedItems.value.find((i) => i.slot === slot) ?? null;
  }

  function candidatesForSlot(slot: InventorySlot): PartyInventoryItem[] {
    const unequipped = myItems.value.filter((i) => i.location !== "equipped");

    function vaultItem(inv: PartyInventoryItem) {
      return inv.item_id
        ? (allItems.value?.find((it) => it.id === inv.item_id) ?? null)
        : null;
    }

    const TAG_SLOTS: Partial<Record<InventorySlot, string[]>> = {
      clothes: ["clothes", "clothing"],
      neck: ["amulet", "necklace", "pendant"],
      hands: ["gloves", "gauntlets", "bracers"],
      feet: ["boots", "shoes", "sandals", "footwear"],
      head: ["helmet", "hat", "hood", "circlet", "crown"],
      shoulders: ["cloak", "cape", "mantle", "pauldrons"],
      waist: ["belt", "girdle", "sash"],
    };

    function matches(inv: PartyInventoryItem): boolean {
      const vi = vaultItem(inv);
      if (slot === "body") return !!vi && vi.item_type === "armor";
      if (slot === "ring") return !!vi && vi.item_type === "ring";
      const tags = TAG_SLOTS[slot];
      if (tags) {
        if (!vi) return false;
        const sub = vi.subtype?.toLowerCase() ?? "";
        return tags.some((t) => vi.tags.includes(t) || sub.includes(t));
      }
      return true;
    }

    return unequipped.filter(matches);
  }

  function slotCanEquip(slot: InventorySlot): boolean {
    return candidatesForSlot(slot).length > 0;
  }

  function openSlot(slot: InventorySlot) {
    const equipped = slotItem(slot);
    if (equipped) selectedInv.value = equipped;
    else if (slotCanEquip(slot)) slotModal.value = slot;
  }

  async function unequipSelected() {
    if (!selectedInv.value) return;
    await updateInventoryItem({
      id: selectedInv.value.id,
      update: { location: "backpack", slot: null, is_equipped: false },
    });
    selectedInv.value = null;
  }

  async function equipToSlot(item: PartyInventoryItem, slot: InventorySlot) {
    // Re-check occupancy right before writing — a realtime update could have
    // filled the slot since the modal opened, and two items must not share one.
    if (slotItem(slot)) { slotModal.value = null; return; }
    if (item.quantity > 1) {
      // Split one off the stack. Two writes, so guard atomicity: if inserting the
      // equipped copy fails, restore the decremented quantity (best-effort rollback)
      // instead of leaving the item partially lost, as the old Promise.all could.
      await updateInventoryItem({
        id: item.id,
        update: { quantity: item.quantity - 1 },
      });
      try {
        await addInventoryItem({
          item_id: item.item_id,
          name: item.name,
          quantity: 1,
          carried_by: item.carried_by,
          location: "equipped",
          slot,
          is_container: false,
          container_id: null,
          is_attuned: false,
          is_equipped: true,
          notes: item.notes,
          is_ruined: item.is_ruined,
          is_identified: item.is_identified,
        });
      } catch (e) {
        await updateInventoryItem({ id: item.id, update: { quantity: item.quantity } });
        throw e;
      }
    } else {
      await updateInventoryItem({
        id: item.id,
        update: { location: "equipped", slot, is_equipped: true },
      });
    }
    slotModal.value = null;
  }

  async function unequipSlot(slot: InventorySlot) {
    const item = slotItem(slot);
    if (!item) return;
    await updateInventoryItem({
      id: item.id,
      update: { location: "backpack", slot: null, is_equipped: false },
    });
    slotModal.value = null;
  }

  return {
    slotModal,
    slotItem,
    candidatesForSlot,
    slotCanEquip,
    openSlot,
    unequipSelected,
    equipToSlot,
    unequipSlot,
  };
}
