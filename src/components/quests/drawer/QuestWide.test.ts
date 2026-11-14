import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import QuestWide from "./QuestWide.vue";
import type { Quest } from "@/types/quest.types";

vi.mock("@/composables/quests/useQuestFlow", () => ({ useQuestBeats: () => ({ data: ref([]) }), useQuestBeatEdges: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestThreads", () => ({ useQuestThreads: () => ({ data: ref([{ id: "t1" }]) }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: ref([
    { id: "sub-1", title: "Free the boy", status: "active", parent_quest_id: "quest-1" },
    { id: "other", title: "Elsewhere", status: "active", parent_quest_id: "quest-9" },
  ]) }),
}));
vi.mock("@/composables/notes/useEntityNotes", () => ({
  useEntityNotes: () => ({ data: ref([
    { id: "n-shared", content: "Shared", updated_at: "2026-11-14", is_private: false },
    { id: "n-private", content: "Mine", updated_at: "2026-11-14", is_private: true },
  ]) }),
}));

const quest = { id: "quest-1", campaign_id: "campaign-1" } as Quest;
const stubs = {
  QuestDetailsSection: true, QuestPlayersSection: true, QuestClocksPanel: true, QuestRulesPanel: true,
  DmNoteBox: true, QuestSidebarPanels: true, AccordionSection: true, EntityCalendarSection: true,
};

describe("QuestWide", () => {
  // Fails if the thread list's focus action stops reaching the page, which moves the flow to that thread.
  it("passes a thread's focus up", () => {
    const wrapper = mount(QuestWide, { props: { quest }, global: { stubs: { ...stubs, QuestThreadsPanel: true } } });
    wrapper.getComponent({ name: "QuestThreadsPanel" }).vm.$emit("focus", "t1");
    expect(wrapper.emitted("focus-thread")).toEqual([["t1"]]);
  });

  // Fails if the wide part loses the quest's sub-quests or hands players' eyes a private note:
  // only this quest's children, and only notes that are not private, reach the sidebar panels.
  it("gives the sidebar panels this quest's sub-quests and only its shared notes", () => {
    const wrapper = mount(QuestWide, { props: { quest }, global: { stubs: { ...stubs, QuestThreadsPanel: true } } });
    const panels = wrapper.getComponent({ name: "QuestSidebarPanels" });
    expect(panels.props("subQuests")).toEqual([expect.objectContaining({ id: "sub-1" })]);
    expect(panels.props("sharedNotes")).toEqual([expect.objectContaining({ id: "n-shared" })]);
  });
});
