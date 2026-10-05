import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const update = vi.fn();
vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: vi.fn() }),
  useUpdateInventoryItem: () => ({ mutateAsync: update }),
}));

import { useInventorySlots } from "./useInventorySlots";

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "i1", item_id: "v1", library_item_id: null, name: "Thing", quantity: 1, location: "backpack",
    slot: null, is_equipped: false, ...over,
  } as PartyInventoryItem;
}

function setup(items: PartyInventoryItem[], library: Array<Partial<Item>>) {
  const myItems = computed(() => items);
  const slots = useInventorySlots({
    equippedItems: computed(() => items.filter((i) => i.location === "equipped")),
    myItems,
    allItems: computed(() => library as Item[]),
    selectedInv: ref(null),
  });
  return slots;
}

describe("useInventorySlots", () => {
  it("fits a wondrous item to the slot its library tag names", () => {
    const { candidatesForSlot } = setup(
      [inv({ id: "i1", item_id: "v1", name: "Cloak of Protection" })],
      [{ id: "v1", item_type: "wondrous_item", subtype: "Wondrous Item", tags: ["shoulders"] }],
    );
    expect(candidatesForSlot("shoulders").map((i) => i.name)).toEqual(["Cloak of Protection"]);
    expect(candidatesForSlot("feet")).toEqual([]);
  });

  it("lets Other take another item when one is already there", async () => {
    update.mockClear();
    const items = [
      inv({ id: "worn", location: "equipped", slot: "other", is_equipped: true }),
      inv({ id: "spare", item_id: "v2" }),
    ];
    const { equipToSlot, slotModal } = setup(items, []);
    await equipToSlot(items[1], "other");
    expect(update).toHaveBeenCalledWith({ id: "spare", update: { location: "equipped", slot: "other", is_equipped: true } });
    expect(slotModal.value).toBeNull();
  });
});
