import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestThreadBar from "./QuestThreadBar.vue";

const mocks = vi.hoisted(() => ({
  threads: { value: [] as Array<Record<string, unknown>> },
  beats: { value: [] as Array<Record<string, unknown>> },
  openThread: vi.fn(),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: mocks.beats }),
}));

vi.mock("@/composables/quests/useQuestThreads", () => ({
  useQuestThreads: () => ({ data: mocks.threads }),
  useOpenQuestThread: () => ({ mutateAsync: mocks.openThread, isPending: { value: false } }),
}));

describe("QuestThreadBar", () => {
  beforeEach(() => {
    mocks.threads.value = [
      { id: "t1", label: "The petition", status: "live", created_at: "2026-01-01T00:00:00Z" },
      { id: "t2", label: "The Drowned Vault", status: "live", created_at: "2026-01-02T00:00:00Z" },
      { id: "t3", label: "An old lead", status: "closed", created_at: "2026-01-03T00:00:00Z" },
    ];
    mocks.beats.value = [{ id: "b1", quest_id: "q1", title: "Confront Ser Vallis" }];
    mocks.openThread.mockReset();
  });

  it("labels every thread by its letter and title", () => {
    const wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
    expect(wrapper.text()).toContain("A · The petition");
    expect(wrapper.text()).toContain("B · The Drowned Vault");
  });

  it("shows a closed thread dimmed and not selectable", () => {
    const wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
    const closed = wrapper.findAll("button").find((button) => button.text().includes("An old lead"));
    expect(closed?.text()).toContain("(closed)");
    expect(closed?.attributes("disabled")).toBeDefined();
  });

  it("emits switch when a live thread's pill is clicked", async () => {
    const wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
    const sibling = wrapper.findAll("button").find((button) => button.text().includes("The Drowned Vault"));
    await sibling!.trigger("click");
    expect(wrapper.emitted("switch")).toEqual([["t2"]]);
  });

  it("opens a thread from the inline form and switches to it", async () => {
    mocks.openThread.mockResolvedValue({ thread: { id: "t4" } });
    const wrapper = mount(QuestThreadBar, {
      props: { questId: "q1", campaignId: "c1", threadId: "t1" },
      global: { stubs: { EntityCombobox: true } },
    });
    const dashed = wrapper.findAll("button").find((button) => button.text() === "Open a thread");
    await dashed!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "b1");
    await wrapper.find("input[placeholder='What is this thread?']").setValue("The sealed crypt");
    const openButton = wrapper.findAll("button").find((button) => button.text() === "Open thread");
    await openButton!.trigger("click");
    expect(mocks.openThread).toHaveBeenCalledWith({
      campaignId: "c1", questId: "q1", beatId: "b1", label: "The sealed crypt", reason: undefined,
    });
    expect(wrapper.emitted("switch")).toEqual([["t4"]]);
  });
});
