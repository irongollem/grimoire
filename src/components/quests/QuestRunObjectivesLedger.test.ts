import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunObjectivesLedger from "./QuestRunObjectivesLedger.vue";
import type { QuestRuntimeChoice, QuestThreadCursor } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  objectives: { value: [] as Array<Record<string, unknown>> },
  assertStatus: vi.fn(),
  consequences: { value: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: mocks.objectives }),
  useAssertQuestObjectiveStatus: () => ({ mutateAsync: mocks.assertStatus }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestConsequences: () => ({ data: mocks.consequences }),
}));

function mountLedger(props: Partial<{ outgoing: QuestRuntimeChoice[]; threads: QuestThreadCursor[]; threadId: string }> = {}) {
  return mount(QuestRunObjectivesLedger, {
    props: { questId: "q1", threadId: "t1", outgoing: [], threads: [], ...props },
  });
}

describe("QuestRunObjectivesLedger", () => {
  beforeEach(() => {
    mocks.objectives.value = [];
    mocks.assertStatus.mockReset();
    mocks.consequences.value = [];
  });

  it("says nothing is raised yet rather than hiding the section", () => {
    const wrapper = mountLedger();
    expect(wrapper.text()).toContain("No objectives raised yet.");
  });

  it("shows the tally alongside the ledger", () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Save the princess", status: "complete", is_player_visible: true },
      { id: "o2", quest_id: "q1", description: "Find the tunnel", status: "pending", is_player_visible: false },
    ];
    const wrapper = mountLedger();
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).toContain("Save the princess");
    expect(wrapper.text()).toContain("Find the tunnel");
  });

  it("cycles a status through the sole writer, not a second editor", async () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Save the princess", status: "pending", is_player_visible: false },
    ];
    const wrapper = mountLedger();
    await wrapper.find("button").trigger("click");
    expect(mocks.assertStatus).toHaveBeenCalledWith({ objectiveId: "o1", questId: "q1", status: "complete" });
  });

  it("names the route an objective gates", () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Name the true collector", status: "pending", is_player_visible: false },
    ];
    const wrapper = mountLedger({
      outgoing: [{ edge_id: "e1", beat_id: "b1", beat_title: "The finale", gate: { objective_id: "o1", objective: "x", required_status: "complete", current_status: "pending", is_open: false } }] as QuestRuntimeChoice[],
    });
    expect(wrapper.text()).toContain("pending · gates The finale");
  });

  it("names the sibling thread that raised an objective", () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Recover the seal", status: "pending", is_player_visible: false },
    ];
    mocks.consequences.value = [
      { id: "c1", quest_id: "q1", on_beat_id: "beat-b", on_edge_id: null, on_objective_id: null, on_objective_status: null, on_quest_settled: false, after_days: 0, action: "raise", target_objective_id: "o1", target_npc_id: null, target_quest_id: null, action_payload: {}, created_at: "now" },
    ];
    const wrapper = mountLedger({
      threads: [
        { id: "t1", campaign_id: "c1", quest_id: "q1", label: "A", status: "live", opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null, created_by: null, created_at: "2026-01-01T00:00:00Z", closed_at: null, updated_at: "now", current_beat_id: "beat-a", current_beat_title: "A", runtime_status: "running", version: 1 },
        { id: "t2", campaign_id: "c1", quest_id: "q1", label: "B", status: "live", opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null, created_by: null, created_at: "2026-01-02T00:00:00Z", closed_at: null, updated_at: "now", current_beat_id: "beat-b", current_beat_title: "B", runtime_status: "paused", version: 1 },
      ] as QuestThreadCursor[],
    });
    expect(wrapper.text()).toContain("pending · Thread B");
  });
});
