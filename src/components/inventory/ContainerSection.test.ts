import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContainerSection from "./ContainerSection.vue";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

function inv(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "i1", item_id: null, library_item_id: null, name: "Thing", quantity: 1, location: "container",
    carried_by: "m1", container_id: "bag", is_container: false, slot: null, is_equipped: false, notes: null,
    is_attuned: false, ...over,
  } as PartyInventoryItem;
}

const library = [
  { id: "srd_sack", weight: "0.5 lb", tags: ["container"], content: null },
  { id: "srd_holding", weight: "15 lb", tags: ["container", "extradimensional"], content: null },
  { id: "srd_rope", weight: "10 lb", tags: [], content: null },
] as unknown as Item[];

function mountSection(container: PartyInventoryItem, items: PartyInventoryItem[], weight: number, containers = [container]) {
  return mount(ContainerSection, {
    props: {
      label: container.name, items, allContainers: containers, allItems: library, catalogue: [],
      resolvedMemberId: "m1", location: "container", container, containerId: container.id, weight,
    },
    attachTo: document.body,
  });
}

function headerMeta(wrapper: ReturnType<typeof mountSection>): string {
  return wrapper.find("button span.text-label").text();
}

describe("ContainerSection header", () => {
  it("weighs the container with its contents and says what it weighs empty", () => {
    const bag = inv({ id: "bag", name: "Sack", library_item_id: "srd_sack", location: "backpack", container_id: null, is_container: true });
    const rope = inv({ id: "rope", library_item_id: "srd_rope" });
    const wrapper = mountSection(bag, [rope], 10);
    expect(headerMeta(wrapper)).toBe("(1 item · 10.5 lb · 0.5 lb empty)");
    wrapper.unmount();
  });

  it("says an extradimensional container's contents weigh nothing", () => {
    const bag = inv({ id: "bag", name: "Bag of Holding", library_item_id: "srd_holding", location: "backpack", container_id: null, is_container: true });
    const wrapper = mountSection(bag, [inv({ id: "rope", library_item_id: "srd_rope" })], 0);
    expect(headerMeta(wrapper)).toBe("(1 item · 15 lb · contents weigh nothing)");
    wrapper.unmount();
  });

  it("says where a container is when it is not in the backpack", () => {
    const pack = inv({ id: "pack", name: "Pack", location: "backpack", container_id: null, is_container: true });
    const bag = inv({ id: "bag", name: "Sack", library_item_id: "srd_sack", location: "container", container_id: "pack", is_container: true });
    const wrapper = mountSection(bag, [], 0, [pack, bag]);
    expect(headerMeta(wrapper)).toBe("(empty · 0.5 lb · in Pack)");
    wrapper.unmount();
  });

  it("offers to make the container a plain item again", async () => {
    const bag = inv({ id: "bag", name: "Sack", location: "belt", container_id: null, is_container: true });
    const wrapper = mountSection(bag, [], 0);
    await wrapper.find("[aria-haspopup='dialog']").trigger("click");
    const labels = Array.from(document.querySelectorAll("[role='dialog'] button")).map((b) => b.textContent?.trim());
    expect(labels).toContain("Use as a plain item");
    expect(labels).toContain("Backpack");
    expect(labels).not.toContain("Belt");
    expect(labels).not.toContain("Drop to chat");
    Array.from(document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button"))
      .find((b) => b.textContent?.trim() === "Use as a plain item")
      ?.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("use-as-item")).toEqual([[bag]]);
    wrapper.unmount();
  });
});
