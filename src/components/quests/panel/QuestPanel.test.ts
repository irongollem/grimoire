import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import QuestPanel from "./QuestPanel.vue";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ threads: [] as Array<{ id: string }> }));

vi.mock("@/composables/quests/useQuestFlow", () => ({ useQuestBeats: () => ({ data: ref([]) }), useQuestBeatEdges: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestThreads", () => ({ useQuestThreads: () => ({ data: ref(mocks.threads) }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([{ id: "sub", parent_quest_id: "quest-1" }, { id: "x", parent_quest_id: null }]) }) }));
vi.mock("@/composables/notes/useEntityNotes", () => ({ useEntityNotes: () => ({ data: ref([{ id: "n1", is_private: false }, { id: "n2", is_private: true }]) }) }));

const stubNames = ["QuestPlayersView", "QuestDetailsSection", "QuestPlayersSection", "QuestThreadsPanel", "QuestObjectivesSection", "QuestClocksPanel", "QuestRulesPanel", "DmNoteBox", "QuestSidebarPanels", "AccordionSection", "EntityCalendarSection"];
const quest = { id: "quest-1", title: "The Unseen", campaign_id: "campaign-1" } as Quest;
const mountPanel = (q: Quest = quest) => mount(QuestPanel, { props: { quest: q }, global: { stubs: Object.fromEntries(stubNames.map((name) => [name, true])) } });

describe("QuestPanel", () => {
  // Fails on a section dropped or reordered: the drawer with nothing selected is the only home of each.
  it("lays the sections out in the DM's order, with Threads only when the quest has some", () => {
    const order = [...mountPanel().html().matchAll(/<([a-z-]+-stub)/g)].map((match) => match[1]);
    expect(order).toEqual([
      "quest-details-section-stub", "quest-players-section-stub", "quest-objectives-section-stub", "quest-clocks-panel-stub",
      "quest-rules-panel-stub", "dm-note-box-stub", "quest-sidebar-panels-stub", "accordion-section-stub",
    ]);
    mocks.threads = [{ id: "t1" }];
    expect(mountPanel().findComponent({ name: "QuestThreadsPanel" }).exists()).toBe(true);
    mocks.threads = [];
  });

  // Fails if Players' view loses the objectives (each row's visibility toggle) or shows them twice.
  it("in the Players' view puts the objectives straight after the players view, once", () => {
    const wrapper = mount(QuestPanel, { props: { quest, playersFirst: true }, global: { stubs: Object.fromEntries(stubNames.map((name) => [name, true])) } });
    const order = [...wrapper.html().matchAll(/<([a-z-]+-stub)/g)].map((match) => match[1]);
    expect(order.slice(0, 3)).toEqual(["quest-players-view-stub", "quest-objectives-section-stub", "quest-details-section-stub"]);
    expect(order.filter((name) => name === "quest-objectives-section-stub")).toHaveLength(1);
  });

  it("hands only this quest's sub-quests and the shared notes to the sidebar", () => {
    const sidebar = mountPanel().findComponent({ name: "QuestSidebarPanels" });
    expect(sidebar.props("subQuests")).toEqual([{ id: "sub", parent_quest_id: "quest-1" }]);
    expect(sidebar.props("sharedNotes")).toEqual([{ id: "n1", is_private: false }]);
  });
});
