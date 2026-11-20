// Wiring only: which stack a shot comes from and what a shot costs are the rules of `rules/fight/pcAttacks/gear.ts` (tested there,
// in allies/statBlock.test.ts). Here: the composable hands the rules the member's inventory and runs the writes they return.
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const update = vi.fn();
const remove = vi.fn();
vi.mock("@/composables/items/usePartyInventory", () => ({
  useUpdateInventoryItem: () => ({ mutate: update }),
  useRemoveInventoryItem: () => ({ mutate: remove }),
}));

import { useAmmoConsumption } from "./useAmmoConsumption";

const stack = (over: Partial<PartyInventoryItem>) =>
  ({ id: "s1", item_id: null, library_item_id: null, name: "Arrows", quantity: 3, location: "belt", is_container: false, container_id: null, current_charges: null, ...over }) as PartyInventoryItem;

describe("useAmmoConsumption", () => {
  // Bug caught: the shot's write never run, or run against the wrong mutation (a last arrow updated to 0 instead of the row removed).
  it("runs an update for a stack with some left and a removal for the last one", () => {
    update.mockClear(); remove.mockClear();
    useAmmoConsumption(ref([stack({})]), ref(new Map())).consumeAmmo("arrow");
    expect(update).toHaveBeenCalledWith({ id: "s1", update: { quantity: 2 } });
    useAmmoConsumption(ref([stack({ quantity: 1 })]), ref(new Map())).consumeAmmo("arrow");
    expect(remove).toHaveBeenCalledWith("s1");
  });

  // Bug caught: a stack from the shared library read through `item_id` alone, so its item (here a charged arrow) was never found and
  // a unit of quantity was spent instead of a charge.
  it("finds a library-sourced stack's item through its reference", () => {
    update.mockClear();
    const cell = { id: "lib-arrow", name: "Energy Arrow", tags: ["arrow"], charges: 6, properties: [] } as unknown as Item;
    const row = stack({ name: "Energy Arrow", library_item_id: "lib-arrow", current_charges: 4 });
    useAmmoConsumption(ref([row]), ref(new Map([["lib-arrow", cell]]))).consumeAmmo("arrow");
    expect(update).toHaveBeenCalledWith({ id: "s1", update: { current_charges: 3 } });
  });
});
