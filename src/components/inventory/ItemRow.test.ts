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
});
