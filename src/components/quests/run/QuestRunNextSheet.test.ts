import { shallowMount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { threadBadges } from "@/lib/quests/threads";
import QuestRunNextSheet from "./QuestRunNextSheet.vue";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";

const threadBadge = threadBadges([{ id: "t1", label: "Main", status: "live" as const, created_at: "2026-01-01T00:00:00Z" }])[0]!;

function mountSheet() {
  // MobileSheet's own `v-if="open"` gates the body, and its `Teleport` would
  // otherwise be auto-stubbed too, hiding everything inside it — both need
  // unstubbing for the sheet to actually render.
  return shallowMount(QuestRunNextSheet, {
    props: { open: true, status: "running", outgoing: [], disabled: false, threadBadge },
    global: { stubs: { MobileSheet: false, Teleport: false } },
  });
}

describe("QuestRunNextSheet", () => {
  // MobileSheet teleports its body to `document.body`, outside anything
  // unmount() would otherwise clean up on its own — same convention as
  // QuestThreadBar.test.ts's mobile-sheet suite.
  let wrapper: VueWrapper | undefined;
  afterEach(() => wrapper?.unmount());

  it("names the thread on a chip, and mounts the outcome strip headless (#872 review fix 3)", () => {
    wrapper = mountSheet();
    expect(document.body.textContent).toContain("Thread A");
    expect(wrapper.findComponent(QuestRunOutcomeStrip).props("status")).toBe("running");
    expect(wrapper.findComponent(QuestRunOutcomeStrip).props("headless")).toBe(true);
  });

  it("closes itself and forwards the route when a choice is made", async () => {
    wrapper = mountSheet();
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("choose", "e1");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("choose")).toEqual([["e1"]]);
    expect(wrapper.emitted("update:open")!.at(-1)).toEqual([false]);
  });

  it("closes itself and forwards 'something else'", async () => {
    wrapper = mountSheet();
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("something-else");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("something-else")).toHaveLength(1);
    expect(wrapper.emitted("update:open")!.at(-1)).toEqual([false]);
  });

  it("forwards reveal and preview without closing", async () => {
    wrapper = mountSheet();
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("reveal", "beat-1");
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("preview", "beat-2");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("reveal")).toEqual([["beat-1"]]);
    expect(wrapper.emitted("preview")).toEqual([["beat-2"]]);
    expect(wrapper.emitted("update:open")).toBeUndefined();
  });
});
