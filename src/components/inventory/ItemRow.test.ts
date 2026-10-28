import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ItemRow from "./ItemRow.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";

function makeItem(overrides: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return {
    id: "inv-1",
    campaign_id: "campaign-1",
    user_id: "dm",
    item_id: "item-1",
    library_item_id: null,
    name: "Bag of Holding",
    quantity: 1,
    carried_by: null,
    location: "stored",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: "",
    is_identified: true,
    quality: "standard",
    sort_order: 0,
    curse_revealed: false,
    ...overrides,
  };
}

function mountRow(item: PartyInventoryItem, extra: Record<string, unknown> = {}) {
  return mount(ItemRow, { props: { item, allContainers: [], ...extra } });
}

describe("ItemRow", () => {
  it("renders a Tiptap-JSON note as plain text, not raw JSON", () => {
    const note = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Whispers when unsheathed" }] }],
    });
    const wrapper = mountRow(makeItem({ notes: note }));

    const caption = wrapper.find("p.italic");
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toBe("Whispers when unsheathed");
    expect(caption.text()).not.toContain("{");
  });

  it("renders a legacy plain-text note as-is", () => {
    const wrapper = mountRow(makeItem({ notes: "Found in the dragon's hoard" }));
    expect(wrapper.find("p.italic").text()).toBe("Found in the dragon's hoard");
  });

  it("shows no note caption when there is no note", () => {
    const wrapper = mountRow(makeItem({ notes: null }));
    expect(wrapper.find("p.italic").exists()).toBe(false);
  });

  it("shows the written-contents icon only when the parent says the item has content", () => {
    const row = makeItem();
    const yes = mount(ItemRow, { props: { item: row, allContainers: [], hasContent: true } });
    const no = mount(ItemRow, { props: { item: row, allContainers: [] } });
    expect(yes.find("[title='Has written contents']").exists()).toBe(true);
    expect(no.find("[title='Has written contents']").exists()).toBe(false);
  });

  describe("overflow menu", () => {
    const pack = makeItem({ id: "pack-1", name: "Rucksack", is_container: true, location: "backpack" });

    async function openMenu(item: PartyInventoryItem, containers: PartyInventoryItem[] = [pack]) {
      const wrapper = mount(ItemRow, {
        props: { item, allContainers: containers },
        attachTo: document.body,
      });
      await wrapper.find("[aria-haspopup='dialog']").trigger("click");
      return wrapper;
    }

    function menuLabels(): string[] {
      return Array.from(document.querySelectorAll("[role='dialog'] button")).map((b) => b.textContent?.trim() ?? "");
    }

    it("offers every place except the one the item is already in", async () => {
      const wrapper = await openMenu(makeItem({ location: "backpack", carried_by: "m1" }));
      const labels = menuLabels();
      expect(labels).toContain("Belt");
      expect(labels).toContain("Rucksack");
      expect(labels).toContain("Party stash");
      expect(labels).not.toContain("Backpack");
      wrapper.unmount();
    });

    it("never offers to put a container inside itself", async () => {
      const wrapper = await openMenu(pack);
      expect(menuLabels()).not.toContain("Rucksack");
      wrapper.unmount();
    });

    it("offers the stash items every place but the stash", async () => {
      const wrapper = await openMenu(makeItem({ location: "backpack", carried_by: null }));
      const labels = menuLabels();
      expect(labels).toContain("Backpack");
      expect(labels).not.toContain("Party stash");
      wrapper.unmount();
    });

    it("offers to use an item that can hold things as a container", async () => {
      const item = makeItem({ location: "backpack", carried_by: "m1" });
      const wrapper = mount(ItemRow, {
        props: { item, allContainers: [], canHoldItems: true },
        attachTo: document.body,
      });
      await wrapper.find("[aria-haspopup='dialog']").trigger("click");
      const use = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
        (b) => b.textContent?.trim() === "Use as a container",
      );
      use?.click();
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("use-as-container")).toEqual([[item]]);
      wrapper.unmount();
    });

    it("does not offer the container switch for an ordinary item", async () => {
      const wrapper = await openMenu(makeItem({ location: "backpack", carried_by: "m1" }));
      expect(menuLabels()).not.toContain("Use as a container");
      wrapper.unmount();
    });

    it("emits move with the chosen place", async () => {
      const item = makeItem({ location: "backpack", carried_by: "m1" });
      const wrapper = await openMenu(item);
      const belt = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")).find(
        (b) => b.textContent?.trim() === "Belt",
      );
      belt?.click();
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("move")).toEqual([[item, "belt", null]]);
      wrapper.unmount();
    });
  });

  it("shows a quality badge for fine stock and nothing for standard", () => {
    expect(mountRow(makeItem({ quality: "fine" })).find('[data-quality="fine"]').text()).toBe("Fine");
    expect(mountRow(makeItem({ quality: "standard" })).find("[data-quality]").exists()).toBe(false);
  });

  it("reads a ruined row as ruined", () => {
    expect(mountRow(makeItem({ quality: "ruined" })).find('[data-quality="ruined"]').exists()).toBe(true);
  });
});

describe("ItemRow actions and labels", () => {
  const buttons = (w: ReturnType<typeof mountRow>) => w.findAllComponents({ name: "AppButton" });
  const byTip = (w: ReturnType<typeof mountRow>, tip: string) => buttons(w).find((b) => b.props("tooltip") === tip)!;

  it("steps the quantity by one, and cannot step a single item down", async () => {
    const one = mountRow(makeItem({ quantity: 1 }));
    const [minus, plus] = buttons(one);
    expect(minus.props("disabled")).toBe(true);
    await plus.trigger("click");
    expect(one.emitted("adjust-qty")).toEqual([[one.props("item"), 1]]);
    const many = mountRow(makeItem({ quantity: 3 }));
    expect(buttons(many)[0].props("disabled")).toBe(false);
    await buttons(many)[0].trigger("click");
    expect(many.emitted("adjust-qty")).toEqual([[many.props("item"), -1]]);
  });

  it("splits only a stack of more than one", async () => {
    const single = mountRow(makeItem({ quantity: 1 }));
    expect(byTip(single, "Split stack").props("disabled")).toBe(true);
    const stack = mountRow(makeItem({ quantity: 4 }));
    expect(byTip(stack, "Split stack").props("disabled")).toBe(false);
    await byTip(stack, "Split stack").trigger("click");
    expect(stack.emitted("split-stack")).toHaveLength(1);
  });

  it("shows the stack's total weight only for a stack, and nothing for a weightless item", () => {
    const stack = mountRow(makeItem({ quantity: 3 }), { weightPerUnit: 2.5 });
    expect(stack.text()).toContain("2.5 (7.5) lb.");
    const single = mountRow(makeItem({ quantity: 1 }), { weightPerUnit: 2 });
    expect(single.text()).toContain("2 lb.");
    expect(single.text()).not.toContain("(");
    expect(mountRow(makeItem(), { weightPerUnit: 0 }).text()).not.toContain("lb.");
  });

  it("marks an attuned item and opens its detail from the name", async () => {
    const w = mountRow(makeItem({ is_attuned: true }));
    expect(w.find('[title="Attuned"]').exists()).toBe(true);
    expect(mountRow(makeItem()).find('[title="Attuned"]').exists()).toBe(false);
    await w.find("button").trigger("click");
    expect(w.emitted("open-detail")).toHaveLength(1);
  });

  it("names who carries it only when the list asks for carriers", () => {
    const row = makeItem({ carried_by: "pm1" });
    const members = [{ id: "pm1", name: "Aria" }];
    expect(mountRow(row, { showCarrier: true, partyMembers: members }).text()).toContain("Aria");
    expect(mountRow(row, { partyMembers: members }).text()).not.toContain("Aria");
  });

  it("offers a sale only on a sellable row", async () => {
    expect(byTip(mountRow(makeItem()), "List for sale")).toBeUndefined();
    const w = mountRow(makeItem(), { sellable: true });
    await byTip(w, "List for sale").trigger("click");
    expect(w.emitted("sell-item")).toHaveLength(1);
  });

  it("drops to chat from the inline action", async () => {
    const w = mountRow(makeItem());
    await byTip(w, "Drop to chat").trigger("click");
    expect(w.emitted("drop-to-chat")).toHaveLength(1);
  });
});
