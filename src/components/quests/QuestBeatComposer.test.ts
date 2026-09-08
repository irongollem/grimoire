import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatComposer from "./QuestBeatComposer.vue";

describe("QuestBeatComposer", () => {
  it("keeps an untitled beat local and cancelable", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source" } });
    await wrapper.get("input").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get("form").trigger("focusout");
    expect(wrapper.emitted("cancel")?.length).toBeGreaterThanOrEqual(2);
  });

  it("submits trimmed title and kind — a beat is title and kind only, no route text", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source" } });
    await wrapper.get("input").setValue("  The bargain  ");
    await wrapper.get("select").setValue("social");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toEqual({ title: "The bargain", kind: "social" });
  });

  it("asks for a thread label in parallel mode and refuses to submit without one", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source", parallel: true } });
    expect(wrapper.text()).toContain("Add parallel route");
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("Rumour: the Drowned Vault");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();

    await inputs[1]!.setValue("The Drowned Vault");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toEqual({ title: "Rumour: the Drowned Vault", kind: "neutral", threadLabel: "The Drowned Vault" });
  });
});
