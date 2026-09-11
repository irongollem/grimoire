import { DOMWrapper, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  // #872 frame 5: below `sm`, the picker lives behind a trailing counter pill.
  describe("the mobile thread picker (frame 5)", () => {
    // MobileSheet teleports to document.body, outside the mounted wrapper's own
    // element and outside anything unmount() would otherwise clean up on its
    // own, so every test that opens it must unmount explicitly or the next
    // test's DOMWrapper(document.body) query can match a stale sheet instead.
    let wrapper: VueWrapper | undefined;
    afterEach(() => wrapper?.unmount());

    function bodyWrapper(): DOMWrapper<HTMLElement> {
      return new DOMWrapper(document.body);
    }

    it("shows a counter pill with the total including closed threads", () => {
      wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
      const counter = wrapper.findAll("button").find((button) => button.text() === "3 ›");
      expect(counter).toBeDefined();
    });

    it("opens the sheet from the counter and lists every thread, closed ones dimmed and disabled", async () => {
      wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
      await wrapper.findAll("button").find((button) => button.text() === "3 ›")!.trigger("click");

      const dialog = bodyWrapper().get("[role=dialog]");
      expect(dialog.text()).toContain("A · The petition");
      expect(dialog.text()).toContain("B · The Drowned Vault");
      expect(dialog.text()).toContain("An old lead");

      const closedRow = dialog.findAll("button").find((button) => button.text().includes("An old lead"));
      expect(closedRow?.attributes("disabled")).toBeDefined();
    });

    it("selecting a live thread in the sheet emits switch, same as its pill, and closes the sheet", async () => {
      wrapper = mount(QuestThreadBar, { props: { questId: "q1", campaignId: "c1", threadId: "t1" } });
      await wrapper.findAll("button").find((button) => button.text() === "3 ›")!.trigger("click");

      const dialog = bodyWrapper().get("[role=dialog]");
      const drowned = dialog.findAll("button").find((button) => button.text().includes("The Drowned Vault"));
      await drowned!.trigger("click");

      expect(wrapper.emitted("switch")).toEqual([["t2"]]);
      expect(bodyWrapper().find("[role=dialog]").exists()).toBe(false);
    });

    it("opens a thread from the sheet's own form through the same mutation", async () => {
      mocks.openThread.mockResolvedValue({ thread: { id: "t4" } });
      wrapper = mount(QuestThreadBar, {
        props: { questId: "q1", campaignId: "c1", threadId: "t1" },
        global: { stubs: { EntityCombobox: true } },
      });
      await wrapper.findAll("button").find((button) => button.text() === "3 ›")!.trigger("click");

      const dialog = bodyWrapper().get("[role=dialog]");
      await dialog.findAll("button").find((button) => button.text() === "Open a thread")!.trigger("click");
      dialog.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "b1");
      await dialog.find("input[placeholder='What is this thread?']").setValue("The sealed crypt");
      await dialog.findAll("button").find((button) => button.text() === "Open thread")!.trigger("click");

      expect(mocks.openThread).toHaveBeenCalledWith({
        campaignId: "c1", questId: "q1", beatId: "b1", label: "The sealed crypt", reason: undefined,
      });
      expect(wrapper.emitted("switch")).toEqual([["t4"]]);
    });
  });
});
