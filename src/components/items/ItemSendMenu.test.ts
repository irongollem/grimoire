import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItemSendMenu from "./ItemSendMenu.vue";
import type { Item } from "@/types/item.types";

const mocks = vi.hoisted(() => ({ add: vi.fn(), drop: vi.fn(), openChat: vi.fn(), reportFailure: vi.fn() }));

vi.mock("@/composables/items/usePartyInventory", () => ({
  useAddInventoryItem: () => ({ mutateAsync: mocks.add }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendItemDrop: mocks.drop }),
}));
vi.mock("@/composables/campaign/chatSendErrors", () => ({
  useChatSendFailure: () => ({ reportChatFailure: mocks.reportFailure }),
}));
vi.mock("@/composables/party/useActiveParty", async () => {
  const { ref } = await import("vue");
  return { useActiveParty: () => ({ data: ref([{ id: "pm-1", name: "Tamsin" }]) }) };
});
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ openChat: mocks.openChat }) }));

const item = { id: "item-1", name: "Longsword", rarity: "mundane", tags: [] } as unknown as Item;

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** A magic item whose true art and description would spoil what it is. */
const flameTongue = {
  id: "item-2",
  name: "Sword",
  rarity: "rare",
  tags: [],
  image_url: "https://cdn/flame-tongue.webp",
  description: doc("A Flame Tongue: bursts into flame on command."),
  mundane_image_url: "https://cdn/plain-sword.webp",
  mundane_description: doc("A well-made longsword."),
} as unknown as Item;

async function openMenu(forItem: Item = item) {
  const wrapper = mount(ItemSendMenu, { props: { item: forItem } });
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
  mocks.openChat.mockReset();
  mocks.reportFailure.mockReset();
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

describe("ItemSendMenu hands out what the table may see", () => {
  const dropOpts = () => mocks.drop.mock.calls[0]![4] as { imageUrl: string | null; description: string | null; isContainer: boolean };

  it("drops a magic item in chat with its mundane art and description only, so the chat never spoils it", async () => {
    const wrapper = await openMenu(flameTongue);
    await button(wrapper, "Drop in Chat").trigger("click");
    await flushPromises();
    const opts = dropOpts();
    expect(opts.imageUrl).toBe("https://cdn/plain-sword.webp");
    expect(opts.description).toBe("A well-made longsword.");
    expect(JSON.stringify(mocks.drop.mock.calls[0])).not.toContain("Flame Tongue");
    expect(JSON.stringify(mocks.drop.mock.calls[0])).not.toContain("flame-tongue.webp");
  });

  it("shows a mundane item's own art and description", async () => {
    const plain = { ...flameTongue, rarity: "mundane" } as unknown as Item;
    const wrapper = await openMenu(plain);
    await button(wrapper, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(dropOpts().imageUrl).toBe("https://cdn/flame-tongue.webp");
    expect(dropOpts().description).toBe("A Flame Tongue: bursts into flame on command.");
  });

  it("sends no description at all for an item that has none, and cuts a long one to 200 characters", async () => {
    const bare = { ...flameTongue, mundane_description: null } as unknown as Item;
    const first = await openMenu(bare);
    await button(first, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(dropOpts().description).toBeNull();

    mocks.drop.mockClear();
    const long = { ...flameTongue, mundane_description: doc("x".repeat(500)) } as unknown as Item;
    const second = await openMenu(long);
    await button(second, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(dropOpts().description).toHaveLength(200);
  });

  it("marks a container item so the chat drop can be opened", async () => {
    const chest = { ...item, tags: ["container"] } as unknown as Item;
    const wrapper = await openMenu(chest);
    await button(wrapper, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(dropOpts().isContainer).toBe(true);
  });

  it("opens the chat after a drop, and reports a failed one without opening it", async () => {
    const ok = await openMenu();
    await button(ok, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(mocks.openChat).toHaveBeenCalledTimes(1);

    mocks.drop.mockRejectedValueOnce(new Error("offline"));
    const failed = await openMenu();
    await button(failed, "Drop in Chat").trigger("click");
    await flushPromises();
    expect(mocks.reportFailure).toHaveBeenCalledTimes(1);
    expect(mocks.openChat).toHaveBeenCalledTimes(1);
  });

  it("puts a magic item in the stash unidentified and a mundane one identified", async () => {
    const magic = await openMenu(flameTongue);
    await button(magic, "Add to Party Stash").trigger("click");
    await flushPromises();
    expect(mocks.add).toHaveBeenLastCalledWith(expect.objectContaining({ is_identified: false, carried_by: null, quantity: 1 }));
    const plain = await openMenu();
    await button(plain, "Add to Party Stash").trigger("click");
    await flushPromises();
    expect(mocks.add).toHaveBeenLastCalledWith(expect.objectContaining({ is_identified: true }));
  });

  it("assigns an item to the party member picked, unidentified when it is magic", async () => {
    const wrapper = await openMenu(flameTongue);
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text().includes("Assign to Player"))!.trigger("click");
    await button(wrapper, "Tamsin").trigger("click");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ carried_by: "pm-1", is_identified: false, name: "Sword" }));
  });
});
