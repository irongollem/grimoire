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

  it("submits trimmed title, kind, and DM-only route label", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source" } });
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("  The bargain  ");
    await wrapper.get("select").setValue("social");
    await inputs[1]!.setValue("  if they agree  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toEqual({ title: "The bargain", kind: "social", edgeLabel: "if they agree" });
  });
});
