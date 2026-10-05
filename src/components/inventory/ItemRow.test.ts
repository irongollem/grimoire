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
    is_ruined: false,
    sort_order: 0,
    curse_revealed: false,
    ...overrides,
  };
}

function mountRow(item: PartyInventoryItem) {
  return mount(ItemRow, { props: { item, allContainers: [] } });
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
});
