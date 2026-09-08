import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunObjectivesLedger from "./QuestRunObjectivesLedger.vue";

const mocks = vi.hoisted(() => ({
  objectives: { value: [] as Array<Record<string, unknown>> },
  assertStatus: vi.fn(),
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: mocks.objectives }),
  useAssertQuestObjectiveStatus: () => ({ mutateAsync: mocks.assertStatus }),
}));

describe("QuestRunObjectivesLedger", () => {
  beforeEach(() => {
    mocks.objectives.value = [];
    mocks.assertStatus.mockReset();
  });

  it("says nothing is raised yet rather than hiding the section", () => {
    const wrapper = mount(QuestRunObjectivesLedger, { props: { questId: "q1" } });
    expect(wrapper.text()).toContain("No objectives raised yet.");
  });

  it("shows the tally alongside the ledger", () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Save the princess", status: "complete", is_player_visible: true },
      { id: "o2", quest_id: "q1", description: "Find the tunnel", status: "pending", is_player_visible: false },
    ];
    const wrapper = mount(QuestRunObjectivesLedger, { props: { questId: "q1" } });
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).toContain("Save the princess");
    expect(wrapper.text()).toContain("Find the tunnel");
  });

  it("cycles a status through the sole writer, not a second editor", async () => {
    mocks.objectives.value = [
      { id: "o1", quest_id: "q1", description: "Save the princess", status: "pending", is_player_visible: false },
    ];
    const wrapper = mount(QuestRunObjectivesLedger, { props: { questId: "q1" } });
    await wrapper.find("button").trigger("click");
    expect(mocks.assertStatus).toHaveBeenCalledWith({ objectiveId: "o1", questId: "q1", status: "complete" });
  });
});
