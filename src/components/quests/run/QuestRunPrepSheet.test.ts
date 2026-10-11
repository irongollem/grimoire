import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunPrepSheet from "./QuestRunPrepSheet.vue";
import QuestRunObjectivesLedger from "./QuestRunObjectivesLedger.vue";
import QuestRunStorySoFar from "./QuestRunStorySoFar.vue";
import QuestRunOpenChains from "./QuestRunOpenChains.vue";

function mountSheet() {
  // MobileSheet is unstubbed: its own `v-if="open"` gates the body, so a
  // shallow stub (which never renders slot content at all, real or absent)
  // would hide the tab panels regardless of which tab is selected.
  return shallowMount(QuestRunPrepSheet, {
    props: {
      open: true,
      questId: "q1",
      threadId: "t1",
      outgoing: [],
      threads: [],
      beats: [],
      pathSoFar: [],
      currentBeatId: null,
      consequences: [],
      objectives: [],
      chains: [{ quest_id: "q2" } as never],
      nextCount: 2,
    },
    global: { stubs: { MobileSheet: false, Teleport: false } },
  });
}

describe("QuestRunPrepSheet", () => {
  it("defaults to the Ledger tab", () => {
    const wrapper = mountSheet();
    expect(wrapper.findComponent(QuestRunObjectivesLedger).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunStorySoFar).exists()).toBe(false);
    expect(wrapper.findComponent(QuestRunOpenChains).exists()).toBe(false);
  });

  it("names the chains count on its own tab, and switches to it", async () => {
    const wrapper = mountSheet();
    const segmented = wrapper.findComponent({ name: "SegmentedControl" });
    const chainsOption = segmented.props("options").find((option: { value: string }) => option.value === "chains");
    expect(chainsOption.label).toBe("Chains · 1");

    await segmented.vm.$emit("update:modelValue", "chains");
    expect(wrapper.findComponent(QuestRunOpenChains).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunObjectivesLedger).exists()).toBe(false);
  });

  it("switches to Story so far, mounted headless since its tab already names it (#872 review fix 3)", async () => {
    const wrapper = mountSheet();
    await wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "story");
    expect(wrapper.findComponent(QuestRunStorySoFar).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunStorySoFar).props("headless")).toBe(true);
  });

  it("forwards a thread switch from the Chains tab", async () => {
    const wrapper = mountSheet();
    await wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "chains");
    wrapper.findComponent(QuestRunOpenChains).vm.$emit("switch-thread", "thread-2");
    expect(wrapper.emitted("switch-thread")).toEqual([["thread-2"]]);
  });

  it("names the What-happens-next count in its footer, and hands off on click", async () => {
    const wrapper = mountSheet();
    const footerButton = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "What happens next · 2")!;
    expect(footerButton).toBeTruthy();
    await footerButton.trigger("click");
    expect(wrapper.emitted("open-next")).toHaveLength(1);
  });
});
