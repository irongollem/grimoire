import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const update = vi.fn();
const add = vi.fn();
vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: add }),
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
  const selectedInv = ref<PartyInventoryItem | null>(null);
  const slots = useInventorySlots({
    equippedItems: computed(() => items.filter((i) => i.location === "equipped")),
    myItems,
    allItems: computed(() => library as Item[]),
    selectedInv,
  });
  return { ...slots, selectedInv };
}

describe("useInventorySlots", () => {
  beforeEach(() => {
    update.mockReset();
    add.mockReset();
  });

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

  it("never puts a second item in an occupied slot, even if the modal opened before another device filled it", async () => {
    const items = [
      inv({ id: "worn", location: "equipped", slot: "head", is_equipped: true }),
      inv({ id: "spare", item_id: "v2" }),
    ];
    const { equipToSlot, slotModal } = setup(items, []);
    slotModal.value = "head";
    await equipToSlot(items[1], "head");
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(slotModal.value).toBeNull();
  });

  it("equips one off a stack: the stack drops by one and a single equipped copy keeps the item's references", async () => {
    const stack = inv({ id: "arrows", item_id: "v3", library_item_id: "srd_arrow", name: "Arrows", quantity: 20 });
    const { equipToSlot } = setup([stack], []);
    await equipToSlot(stack, "other");
    expect(update).toHaveBeenCalledWith({ id: "arrows", update: { quantity: 19 } });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "v3", library_item_id: "srd_arrow", quantity: 1, location: "equipped", slot: "other", is_equipped: true }),
    );
  });

  it("puts the stack back at full size when the equipped copy cannot be added, and still reports the failure", async () => {
    const stack = inv({ id: "arrows", quantity: 20 });
    add.mockRejectedValue(new Error("insert failed"));
    const { equipToSlot } = setup([stack], []);
    await expect(equipToSlot(stack, "other")).rejects.toThrow("insert failed");
    expect(update).toHaveBeenLastCalledWith({ id: "arrows", update: { quantity: 20 } });
  });

  it("unequips the item in a slot back to the backpack, and does nothing for an empty slot", async () => {
    const worn = inv({ id: "worn", location: "equipped", slot: "head", is_equipped: true });
    const { unequipSlot } = setup([worn], []);
    await unequipSlot("feet");
    expect(update).not.toHaveBeenCalled();
    await unequipSlot("head");
    expect(update).toHaveBeenCalledWith({ id: "worn", update: { location: "backpack", slot: null, is_equipped: false } });
  });

  it("tapping an occupied slot selects its item; an empty slot with something to wear opens the picker; an empty slot with nothing does neither", () => {
    const worn = inv({ id: "worn", location: "equipped", slot: "head", is_equipped: true });
    const ring = inv({ id: "ring", item_id: "v9", name: "Ring" });
    const { openSlot, slotModal, selectedInv } = setup([worn, ring], [{ id: "v9", item_type: "ring", tags: [], subtype: null }]);
    openSlot("feet");
    expect(slotModal.value).toBeNull();
    openSlot("ring");
    expect(slotModal.value).toBe("ring");
    openSlot("head");
    expect(selectedInv.value?.id).toBe("worn");
  });

  it("splits a stack of two, and moves a single item whole", async () => {
    const pair = inv({ id: "pair", quantity: 2 });
    const { equipToSlot } = setup([pair], []);
    await equipToSlot(pair, "other");
    expect(update).toHaveBeenCalledWith({ id: "pair", update: { quantity: 1 } });
    expect(add).toHaveBeenCalledOnce();
  });

  it("Other always offers to add another item, even when something is already worn there", () => {
    const worn = inv({ id: "worn", location: "equipped", slot: "other", is_equipped: true });
    const spare = inv({ id: "spare", item_id: "v2" });
    const { openSlot, slotModal, selectedInv } = setup([worn, spare], []);
    openSlot("other");
    expect(slotModal.value).toBe("other");
    expect(selectedInv.value).toBeNull();
  });

  it("offers only armor for the body slot, and never an item that is already worn", () => {
    const mail = inv({ id: "mail", item_id: "v1", name: "Chain Mail" });
    const ring = inv({ id: "ring", item_id: "v2", name: "Ring" });
    const wornMail = inv({ id: "worn-mail", item_id: "v1", name: "Plate", location: "equipped", slot: "body", is_equipped: true });
    const { candidatesForSlot } = setup(
      [mail, ring, wornMail],
      [
        { id: "v1", item_type: "armor", tags: [], subtype: null },
        { id: "v2", item_type: "ring", tags: [], subtype: null },
      ],
    );
    expect(candidatesForSlot("body").map((i) => i.name)).toEqual(["Chain Mail"]);
  });
});
