import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContainerSection from "./ContainerSection.vue";
import { VueDraggable } from "vue-draggable-plus";
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

describe("ContainerSection moving and adding", () => {
  const bag = () => inv({ id: "bag", name: "Sack", library_item_id: "srd_sack", location: "backpack", container_id: null, is_container: true });
  const rope = () => inv({ id: "rope", library_item_id: "srd_rope" });

  it("reports a drop from another list as a move into this container", () => {
    const wrapper = mountSection(bag(), [rope()], 10);
    const target = wrapper.findComponent(VueDraggable);
    target.vm.$emit("add", { from: document.createElement("div"), to: document.createElement("div"), newIndex: 0 });
    expect(wrapper.emitted("move")).toEqual([[rope(), "container", "bag"]]);
    expect(wrapper.emitted("reorder")).toHaveLength(1);
    wrapper.unmount();
  });

  it("reports a reorder only when the drag ended in the same list", () => {
    const wrapper = mountSection(bag(), [rope()], 10);
    const target = wrapper.findComponent(VueDraggable);
    const a = document.createElement("div");
    target.vm.$emit("end", { from: a, to: document.createElement("div") });
    expect(wrapper.emitted("reorder")).toBeUndefined();
    target.vm.$emit("end", { from: a, to: a });
    expect(wrapper.emitted("reorder")).toHaveLength(1);
    wrapper.unmount();
  });

  it("adds the item picked from the catalogue and closes the form", async () => {
    const wrapper = mount(ContainerSection, {
      props: {
        label: "Sack", items: [], allContainers: [bag()], allItems: library,
        catalogue: [{ id: "srd_rope", name: "Rope", subtype: null, tags: [] }] as never,
        resolvedMemberId: "m1", location: "container", container: bag(), containerId: "bag", weight: 0,
      },
      attachTo: document.body,
    });
    await wrapper.findAll("button").find((b) => b.text() === "+ Add")!.trigger("click");
    expect(wrapper.find("form").exists()).toBe(true);
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "srd_rope");
    await wrapper.vm.$nextTick();
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("add")).toEqual([["Rope", "srd_rope"]]);
    expect(wrapper.find("form").exists()).toBe(false);
    wrapper.unmount();
  });
});
