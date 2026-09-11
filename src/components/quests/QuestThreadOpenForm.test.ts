import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestThreadOpenForm from "./QuestThreadOpenForm.vue";

const options = [{ id: "b1", name: "Confront Ser Vallis" }];

function mountForm(overrides: Record<string, unknown> = {}) {
  return mount(QuestThreadOpenForm, {
    props: {
      options,
      beatId: "",
      label: "",
      reason: "",
      "onUpdate:beatId": () => {},
      "onUpdate:label": () => {},
      "onUpdate:reason": () => {},
      ...overrides,
    },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestThreadOpenForm", () => {
  it("disables Open thread until a beat and a label are both present", async () => {
    const wrapper = mountForm();
    const openButton = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open thread")!;
    expect(openButton.props("disabled")).toBe(true);

    await wrapper.setProps({ beatId: "b1", label: "The sealed crypt" });
    expect(wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open thread")!.props("disabled")).toBe(false);
  });

  it("emits submit and cancel", async () => {
    const wrapper = mountForm({ beatId: "b1", label: "The sealed crypt" });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open thread")!.trigger("click");
    expect(wrapper.emitted("submit")).toHaveLength(1);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Cancel")!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("passes the pending state through to the Open thread button's loading state", () => {
    const wrapper = mountForm({ pending: true });
    expect(wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open thread")!.props("loading")).toBe(true);
  });

  it("emits update:beatId/label/reason from the underlying fields", async () => {
    const wrapper = mountForm();
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "b1");
    expect(wrapper.emitted("update:beatId")).toEqual([["b1"]]);

    await wrapper.find("input[placeholder='What is this thread?']").setValue("The sealed crypt");
    expect(wrapper.emitted("update:label")).toEqual([["The sealed crypt"]]);

    await wrapper.find("input[placeholder='Why open it now? (optional)']").setValue("A lead came up");
    expect(wrapper.emitted("update:reason")).toEqual([["A lead came up"]]);
  });

  it("applies the stacked layout's 44px inputs and full-width buttons", () => {
    const wrapper = mountForm({ layout: "stack" });
    expect(wrapper.get("input[placeholder='What is this thread?']").element.className).toContain("min-h-11");
    const openButton = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open thread")!;
    expect(openButton.classes()).toContain("min-h-11");
  });

  it("defaults to the row layout, with no 44px sizing forced on the inputs", () => {
    const wrapper = mountForm();
    expect(wrapper.get("input[placeholder='What is this thread?']").element.className).not.toContain("min-h-11");
  });
});
