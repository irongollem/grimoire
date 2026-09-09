import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TriggerBeatPrompt from "./TriggerBeatPrompt.vue";

describe("TriggerBeatPrompt", () => {
  it("names the beat and asks whether to advance, never firing on its own", () => {
    const wrapper = mount(TriggerBeatPrompt, { props: { beat: { title: "Descend the Drowned Vault" } } });
    expect(wrapper.text()).toContain("Descend the Drowned Vault");
    expect(wrapper.text()).toContain("is staged on this floor — advance?");
    expect(wrapper.emitted("advance")).toBeUndefined();
  });

  it("falls back to 'This beat' when the beat has no title", () => {
    const wrapper = mount(TriggerBeatPrompt, { props: { beat: { title: null } } });
    expect(wrapper.text()).toContain("This beat is staged on this floor — advance?");
  });

  it("emits advance from its own button, and nothing else", async () => {
    const wrapper = mount(TriggerBeatPrompt, { props: { beat: { title: "Descend the Drowned Vault" } } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Advance")!.trigger("click");
    expect(wrapper.emitted("advance")).toHaveLength(1);
    expect(wrapper.emitted("dismiss")).toBeUndefined();
  });

  it("emits dismiss from its own button, and nothing else", async () => {
    const wrapper = mount(TriggerBeatPrompt, { props: { beat: { title: "Descend the Drowned Vault" } } });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Dismiss")!.trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(wrapper.emitted("advance")).toBeUndefined();
  });
});
