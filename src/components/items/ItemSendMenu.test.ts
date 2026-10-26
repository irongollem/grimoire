import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItemSendMenu from "./ItemSendMenu.vue";
import type { Item } from "@/types/item.types";

const mocks = vi.hoisted(() => ({ add: vi.fn(), drop: vi.fn() }));

vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: mocks.add }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendItemDrop: mocks.drop }),
}));
vi.mock("@/composables/campaign/chatSendErrors", () => ({
  useChatSendFailure: () => ({ reportChatFailure: vi.fn() }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({
  useActiveParty: () => ({ data: { value: [{ id: "pm-1", name: "Tamsin" }] } }),
}));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ openChat: vi.fn() }) }));

const item = { id: "item-1", name: "Longsword", rarity: "mundane", tags: [] } as unknown as Item;

async function openMenu() {
  const wrapper = mount(ItemSendMenu, { props: { item } });
  await wrapper.find("button").trigger("click");
  return wrapper;
}

function button(wrapper: Awaited<ReturnType<typeof openMenu>>, label: string) {
  const b = wrapper.findAllComponents({ name: "AppButton" }).find((c) => c.props("label") === label);
  if (!b) throw new Error(`no button ${label}`);
  return b;
}

beforeEach(() => {
  mocks.add.mockReset().mockResolvedValue(undefined);
  mocks.drop.mockReset().mockResolvedValue(undefined);
});

describe("ItemSendMenu quality (#1102)", () => {
  it("adds to the stash at standard by default", async () => {
    const wrapper = await openMenu();
    await button(wrapper, "Add to Party Stash").trigger("click");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ quality: "standard" }));
  });

  it("writes the chosen quality into the stash row and the chat drop", async () => {
    const wrapper = await openMenu();
    await wrapper.find('select[aria-label="Quality to hand out"]').setValue("masterwork");
    await button(wrapper, "Add to Party Stash").trigger("click");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ quality: "masterwork" }));

    const again = await openMenu();
    await again.find('select[aria-label="Quality to hand out"]').setValue("poor");
    await button(again, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(mocks.drop.mock.calls[0]?.[4]?.quality).toBe("poor");
  });
});
