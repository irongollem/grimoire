// The Door tool's "connects which rooms?" question (#1195).
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CartographerDoorEnds from "./CartographerDoorEnds.vue";

const rooms = [
  { id: "hall", name: "Great Hall" },
  { id: "larder", name: "Larder" },
];

function mountPicker() {
  const wrapper = mount(CartographerDoorEnds, { props: { rooms } });
  const [from, to] = wrapper.findAllComponents({ name: "EntityCombobox" });
  const placeButton = wrapper.findAll("button").find((b) => b.text() === "Place door")!;
  return { wrapper, from: from!, to: to!, placeButton };
}

describe("CartographerDoorEnds", () => {
  it("places nothing until the first room is chosen", async () => {
    const { wrapper, placeButton } = mountPicker();
    await placeButton.trigger("click");
    expect(wrapper.emitted("place")).toBeUndefined();
  });

  it("places a door between the two chosen rooms", async () => {
    const { wrapper, from, to, placeButton } = mountPicker();
    await from.vm.$emit("update:modelValue", "hall");
    await to.vm.$emit("update:modelValue", "larder");
    await placeButton.trigger("click");
    expect(wrapper.emitted("place")).toEqual([["hall", "larder"]]);
  });

  it("places a way that leads nowhere yet when the second room is left empty", async () => {
    const { wrapper, from, placeButton } = mountPicker();
    await from.vm.$emit("update:modelValue", "hall");
    await placeButton.trigger("click");
    expect(wrapper.emitted("place")).toEqual([["hall", null]]);
  });

  it("never offers the same room for both ends", async () => {
    const { from, to } = mountPicker();
    await from.vm.$emit("update:modelValue", "hall");
    expect((to.props("options") as { id: string }[]).map((o) => o.id)).toEqual(["larder"]);
    await to.vm.$emit("update:modelValue", "larder");
    expect((from.props("options") as { id: string }[]).map((o) => o.id)).toEqual(["hall"]);
  });

  it("Cancel places nothing", async () => {
    const { wrapper } = mountPicker();
    await wrapper.findAll("button").find((b) => b.text() === "Cancel")!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("place")).toBeUndefined();
  });
});
