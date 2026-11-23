import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import InventoryCatalogueActions from "./InventoryCatalogueActions.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";

const updateLink = vi.hoisted(() => vi.fn());
vi.mock("@/composables/items/usePartyInventory", () => ({
  useLinkInventoryCatalogueItem: () => ({ mutateAsync: updateLink }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ fromError: (error: Error) => error.message, success: vi.fn() }),
}));

it("retries attaching an already generated item without creating it twice", async () => {
  const item = { id: "row", campaign_id: "camp", name: "Frost Lantern", notes: null } as PartyInventoryItem;
  const linked = { ...item, item_id: "new-item" };
  updateLink.mockReset().mockRejectedValueOnce(new Error("Could not link")).mockResolvedValueOnce(linked);
  const wrapper = mount(InventoryCatalogueActions, {
    props: { item, catalogue: [], aiEnabled: true },
    global: { stubs: { InventoryCatalogueCreate: {
      emits: ["created"],
      template: '<button @click="$emit(\'created\', { id: \'new-item\', name: \'Frost Lantern\' })">Complete generation</button>',
    } } },
  });
  function button(label: string) {
    const match = wrapper.findAll("button").find((element) => element.text() === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }
  try {
    await button("Generate with AI").trigger("click");
    await flushPromises();
    await vi.waitFor(() => button("Complete generation"));
    await button("Complete generation").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Could not link");
    expect(wrapper.text()).not.toContain("Complete generation");
    await button("Retry link").trigger("click");
    await flushPromises();
    expect(updateLink.mock.calls).toEqual(Array.from({ length: 2 }, () => [
      { inventoryId: "row", campaignId: "camp", catalogueId: "new-item" },
    ]));
    expect(wrapper.emitted("linked")).toEqual([[linked]]);
  } finally { wrapper.unmount(); }
});
