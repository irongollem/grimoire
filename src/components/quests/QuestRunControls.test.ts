import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunControls from "./QuestRunControls.vue";

describe("QuestRunControls", () => {
  it("keeps resume and end available while paused but disables story movement", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "paused", hasPrevious: true } });
    const buttons = new Map(wrapper.findAll("button").map((button) => [button.text(), button]));
    expect(buttons.get("Previous")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Jump…")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Resume")?.attributes("disabled")).toBeUndefined();
    expect(buttons.get("End")?.attributes("disabled")).toBeUndefined();
  });

  it("offers jump, pause, and end while running", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false } });
    expect(wrapper.text()).toContain("Jump…");
    expect(wrapper.text()).toContain("Pause");
    expect(wrapper.text()).not.toContain("Resume");
  });

  it("emits the session-wide commands rather than guessing an outcome", async () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: true } });
    await wrapper.findAll("button").find((button) => button.text() === "Previous")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Jump…")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Pause")!.trigger("click");
    expect(wrapper.emitted("previous")).toHaveLength(1);
    expect(wrapper.emitted("jump")).toHaveLength(1);
    expect(wrapper.emitted("pause")).toHaveLength(1);
  });

  it("disables Previous at the start of the chain", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false } });
    const previous = wrapper.findAll("button").find((button) => button.text() === "Previous");
    expect(previous?.attributes("disabled")).toBeDefined();
  });
});
