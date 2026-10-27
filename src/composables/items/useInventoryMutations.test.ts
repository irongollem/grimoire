import { computed, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  confirm: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  sendItemDrop: vi.fn(),
  reportChatFailure: vi.fn(),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: mocks.add }),
  useAddInventoryItems: () => ({ mutateAsync: vi.fn() }),
  useUpdateInventoryItem: () => ({ mutateAsync: mocks.update }),
  useRemoveInventoryItem: () => ({ mutateAsync: mocks.remove }),
  useReorderInventoryItems: () => ({ mutate: mocks.reorder }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendItemDrop: mocks.sendItemDrop }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: mocks.reportChatFailure }) }));

import { useInventoryMutations } from "./useInventoryMutations";

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "i1", item_id: null, library_item_id: null, name: "Thing", quantity: 1, location: "backpack",
    carried_by: "m1", container_id: null, is_container: false, slot: null, is_equipped: false, ...over,
  } as PartyInventoryItem;
}

function setup(items: PartyInventoryItem[], partyMembers: PartyMember[] = []) {
  return useInventoryMutations({
    resolvedMemberId: computed(() => "m1"),
    member: computed(() => null),
    myItems: computed(() => items),
    allItems: computed(() => []),
    catalogue: computed(() => []),
    partyMembers: computed(() => partyMembers),
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
    // A stale pointer on an item that is no longer inside anything is not the pouch's content.
    const stale = inv({ id: "stale", location: "backpack", container_id: "pouch" });
    await setup([pouch, gem, elsewhere, stale]).makePlainItem(pouch);
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

describe("the everyday inventory writes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("a quantity never drops below one", async () => {
    const rope = inv({ id: "rope", quantity: 2 });
    const { adjustQty } = setup([rope]);
    await adjustQty(rope, -1);
    await adjustQty(rope, -5);
    await adjustQty(rope, 3);
    expect(mocks.update.mock.calls.map(([call]) => call.update.quantity)).toEqual([1, 1, 5]);
  });

  it("moving to the stash puts it in the party's pile with no carrier, and moving elsewhere puts it on this character", async () => {
    const sword = inv({ id: "sword", is_equipped: true, slot: "hands" });
    const { moveItem } = setup([sword]);
    await moveItem(sword, "stash", null);
    expect(mocks.update).toHaveBeenLastCalledWith({
      id: "sword", update: { location: "backpack", container_id: null, carried_by: null, is_equipped: false, slot: null },
    });
    await moveItem(sword, "equipped", null);
    // Equipped keeps its slot and flag; they are set by the equip flow, not cleared by a move.
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "sword", update: { location: "equipped", container_id: null, carried_by: "m1" } });
    await moveItem(sword, "container", "bag");
    expect(mocks.update).toHaveBeenLastCalledWith({
      id: "sword", update: { location: "container", container_id: "bag", carried_by: "m1", is_equipped: false, slot: null },
    });
  });

  it("a drag-reorder writes only the rows whose position changed", () => {
    const a = inv({ id: "a", sort_order: 0 });
    const b = inv({ id: "b", sort_order: 100 });
    const c = inv({ id: "c", sort_order: 200 });
    const { handleReorder } = setup([a, b, c]);
    handleReorder([a, b, c]);
    expect(mocks.reorder).not.toHaveBeenCalled();
    handleReorder([a, c, b]);
    expect(mocks.reorder).toHaveBeenCalledWith([{ id: "c", sort_order: 100 }, { id: "b", sort_order: 200 }]);
  });

  it("removing an item asks first, and says so when it is linked to an active infusion", async () => {
    const holder = { name: "Ilse", active_infusions: [{ inv_item_id: "staff" }] } as unknown as PartyMember;
    const { removeItem } = setup([], [holder]);
    mocks.confirm.mockResolvedValue(false);
    await removeItem("staff");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.confirm.mock.calls[0]?.[0]).toContain("Ilse");

    mocks.confirm.mockResolvedValue(true);
    await removeItem("staff");
    expect(mocks.remove).toHaveBeenCalledWith("staff");
    await removeItem("rope");
    expect(mocks.confirm.mock.calls.at(-1)?.[0]).not.toContain("infusion");
  });

  it("dropping to chat asks first, posts before removing, and keeps the item when the post fails", async () => {
    const gem = inv({ id: "gem", name: "Ruby", quantity: 2 });
    const { dropItemToChat } = setup([gem]);

    mocks.confirm.mockResolvedValue(false);
    await dropItemToChat(gem);
    expect(mocks.sendItemDrop).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.confirm.mockResolvedValue(true);
    mocks.sendItemDrop.mockRejectedValueOnce(new Error("offline"));
    await dropItemToChat(gem);
    expect(mocks.reportChatFailure).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.sendItemDrop.mockResolvedValueOnce(undefined);
    await dropItemToChat(gem);
    expect(mocks.remove).toHaveBeenCalledWith("gem");
  });

  describe("splitting a stack", () => {
    const stack = inv({ id: "arrows", name: "Arrows", quantity: 10, item_id: "v1", library_item_id: null });

    const alert = vi.fn();
    function answer(raw: string | null) {
      alert.mockClear();
      vi.stubGlobal("prompt", vi.fn(() => raw));
      vi.stubGlobal("alert", alert);
    }
    afterEach(() => vi.unstubAllGlobals());

    it("takes n off the stack and adds a new row of n carrying the same reference", async () => {
      answer("3");
      await setup([stack]).splitStack(stack);
      expect(mocks.update).toHaveBeenCalledWith({ id: "arrows", update: { quantity: 7 } });
      expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ name: "Arrows", quantity: 3, item_id: "v1", is_attuned: false }));
    });

    it("a library-sourced stack keeps its library reference on the half split off", async () => {
      const library = inv({ id: "torches", name: "Torch", quantity: 5, item_id: null, library_item_id: "srd_torch" });
      answer("2");
      await setup([library]).splitStack(library);
      expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ item_id: null, library_item_id: "srd_torch", quantity: 2 }));
    });

    it.each([["0"], ["10"], ["11"], ["-2"], ["abc"]])("refuses %s, with a message, and writes nothing", async (raw) => {
      answer(raw);
      await setup([stack]).splitStack(stack);
      expect(alert).toHaveBeenCalledOnce();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.add).not.toHaveBeenCalled();
    });

    it("accepts splitting all but one, and a cancelled prompt does nothing at all", async () => {
      answer("9");
      await setup([stack]).splitStack(stack);
      expect(mocks.update).toHaveBeenCalledWith({ id: "arrows", update: { quantity: 1 } });

      mocks.update.mockClear();
      answer(null);
      await setup([stack]).splitStack(stack);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    });
  });
});
