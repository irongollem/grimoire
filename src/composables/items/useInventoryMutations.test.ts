import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), confirm: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: vi.fn() }),
  useAddInventoryItems: () => ({ mutateAsync: vi.fn() }),
  useUpdateInventoryItem: () => ({ mutateAsync: mocks.update }),
  useRemoveInventoryItem: () => ({ mutateAsync: vi.fn() }),
  useReorderInventoryItems: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({}) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({}) }));

import { useInventoryMutations } from "./useInventoryMutations";

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "i1", item_id: null, library_item_id: null, name: "Thing", quantity: 1, location: "backpack",
    carried_by: "m1", container_id: null, is_container: false, slot: null, is_equipped: false, ...over,
  } as PartyInventoryItem;
}

function setup(items: PartyInventoryItem[]) {
  return useInventoryMutations({
    resolvedMemberId: computed(() => "m1"),
    member: computed(() => null),
    myItems: computed(() => items),
    allItems: computed(() => []),
    catalogue: computed(() => []),
    partyMembers: computed(() => []),
    selectedInv: ref(null),
  });
}

describe("makePlainItem", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.confirm.mockReset();
  });

  it("turns an empty container into an item without asking", async () => {
    const sack = inv({ id: "sack", name: "Sack", is_container: true });
    await setup([sack]).makePlainItem(sack);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls).toEqual([[{ id: "sack", update: { is_container: false } }]]);
  });

  it("tips the contents out where the container sits, then clears the flag", async () => {
    mocks.confirm.mockResolvedValue(true);
    const pouch = inv({ id: "pouch", name: "Pouch", is_container: true, location: "belt" });
    const gem = inv({ id: "gem", location: "container", container_id: "pouch" });
    const elsewhere = inv({ id: "rope", location: "container", container_id: "other" });
    await setup([pouch, gem, elsewhere]).makePlainItem(pouch);
    expect(mocks.confirm).toHaveBeenCalledWith('Use "Pouch" as a plain item? What it holds (1 item) moves to your belt.');
    expect(mocks.update.mock.calls).toEqual([
      [{ id: "gem", update: { location: "belt", container_id: null } }],
      [{ id: "pouch", update: { is_container: false } }],
    ]);
  });

  it("moves the contents into the container it is nested in", async () => {
    mocks.confirm.mockResolvedValue(true);
    const pack = inv({ id: "pack", name: "Explorer's Pack", is_container: true });
    const box = inv({ id: "box", name: "Tinderbox", is_container: true, location: "container", container_id: "pack" });
    const flint = inv({ id: "flint", location: "container", container_id: "box" });
    await setup([pack, box, flint]).makePlainItem(box);
    expect(mocks.confirm.mock.calls[0][0]).toContain("moves to Explorer's Pack");
    expect(mocks.update.mock.calls[0]).toEqual([{ id: "flint", update: { location: "container", container_id: "pack" } }]);
  });

  it("empties a worn container into the backpack", async () => {
    mocks.confirm.mockResolvedValue(true);
    const quiver = inv({ id: "quiver", is_container: true, location: "equipped" });
    const arrows = inv({ id: "arrows", location: "container", container_id: "quiver" });
    await setup([quiver, arrows]).makePlainItem(quiver);
    expect(mocks.update.mock.calls[0]).toEqual([{ id: "arrows", update: { location: "backpack", container_id: null } }]);
  });

  it("changes nothing when the player cancels", async () => {
    mocks.confirm.mockResolvedValue(false);
    const sack = inv({ id: "sack", is_container: true });
    const coin = inv({ id: "coin", location: "container", container_id: "sack" });
    await setup([sack, coin]).makePlainItem(sack);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
