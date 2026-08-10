import { describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import type { Quest } from "@/types/quest.types";
import QuestBoardCard from "./QuestBoardCard.vue";
import QuestKanbanBoard from "./QuestKanbanBoard.vue";

function quest(id: string, status: Quest["status"]): Quest {
  return {
    id,
    user_id: "dm-1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: `Quest ${id}`,
    summary: null,
    status,
    giver_npc_id: null,
    location_id: null,
    rewards: null,
    reward_pp: 0,
    reward_gp: 0,
    reward_ep: 0,
    reward_sp: 0,
    reward_cp: 0,
    tags: [],
    description: null,
    notes: null,
    player_visible_to: [],
    reward_item_ids: [],
    reward_currency_pools: [],
    started_at: null,
    resolved_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
  };
}

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("QuestKanbanBoard", () => {
  it("preserves all five persisted quest statuses", () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active"), quest("2", "failed")] },
      global,
    });

    const headings = wrapper.findAll("h2").map((heading) => heading.text());
    expect(headings).toEqual(["Undiscovered", "Rumor", "Active", "Completed", "Failed"]);
    expect(wrapper.findAllComponents(QuestBoardCard)).toHaveLength(2);
    expect(wrapper.find('[aria-label="1 quests in Active"]').text()).toBe("1 quest");
    expect(wrapper.find('[aria-label="0 quests in Rumor"]').text()).toBe("0 quests");
  });

  it("forwards the card's keyboard status move as a board mutation", () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active")] },
      global,
    });

    wrapper.getComponent(QuestBoardCard).vm.$emit("move", "completed");
    expect(wrapper.emitted("move")).toEqual([[{ id: "1", status: "completed" }]]);
  });

  it("does not emit a no-op move", () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active")] },
      global,
    });

    wrapper.getComponent(QuestBoardCard).vm.$emit("move", "active");
    expect(wrapper.emitted("move")).toBeUndefined();
  });

  it("distinguishes an empty lane from quests hidden by filters", () => {
    const allQuests = [quest("1", "active"), quest("2", "active")];
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [], allQuests },
      global,
    });
    expect(wrapper.text()).toContain("2 active quests filtered out.");
    expect(wrapper.text()).toContain("No failed quests.");
  });
});
