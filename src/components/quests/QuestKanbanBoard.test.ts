import { describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import type { QuestBoardSummary } from "@/lib/quests/board";
import type { Quest } from "@/types/quest.types";
import QuestBoardCard from "./QuestBoardCard.vue";
import QuestFeaturedCard from "./QuestFeaturedCard.vue";
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
    tags: [],
    player_visible_to: [],
    started_at: null,
    resolved_at: null,
    entry_beat_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
  };
}

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("QuestKanbanBoard", () => {
  it("groups the five persisted statuses into three visual groups", () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active"), quest("2", "failed"), quest("3", "rumor")] },
      global,
    });

    const headings = wrapper.findAll("h2").map((heading) => heading.text());
    expect(headings).toEqual(["Active", "Undiscovered — waiting to be unlocked", "Settled"]);
    // active + rumor both land in the Active group.
    expect(wrapper.findAllComponents(QuestBoardCard)).toHaveLength(3);
    expect(wrapper.find('[aria-label="2 quests in active"]').text()).toBe("2 quests");
    expect(wrapper.find('[aria-label="1 quests in settled"]').text()).toBe("1 quest");
    expect(wrapper.find('[aria-label="0 quests in undiscovered"]').text()).toBe("0 quests");
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

  it("distinguishes an empty group from quests hidden by filters", () => {
    const allQuests = [quest("1", "completed"), quest("2", "failed")];
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [], allQuests },
      global,
    });
    expect(wrapper.text()).toContain("2 settled quests filtered out.");
    expect(wrapper.text()).toContain("No undiscovered quests.");
  });

  it("features every quest with a live thread above the groups", () => {
    const summaries: Record<string, QuestBoardSummary> = {
      "1": {
        isLive: true,
        runtimeStatus: "running",
        currentBeatTitle: "Confront Ser Vallis",
        beatSegments: ["done", "here"],
        prepGapCount: 0,
        undispatchedLootCount: 0,
        unclaimedLootCount: 0,
        threads: [{ id: "t-a", label: "Main", status: "live", currentBeatTitle: "Confront Ser Vallis", beatSegments: ["done", "here"], created_at: "2026-08-01T00:00:00Z" }],
        liveThreadCount: 1,
        primaryThreadId: "t-a",
        prepGaps: [],
        hasPayoffPrepared: false,
        convergesInto: [],
        unlockedBy: null,
        entersAt: null,
        heldPayoffCount: 0,
        settledCaption: null,
        objectivesDone: 0,
        objectivesTotal: 0,
      },
    };
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active"), quest("2", "active")], summaries },
      global,
    });

    expect(wrapper.findAllComponents(QuestFeaturedCard)).toHaveLength(1);
    expect(wrapper.getComponent(QuestFeaturedCard).props("quest").id).toBe("1");
  });

  // The rumour is a stage of the lifecycle (undiscovered → rumoured → active →
  // settled). It folds into Active because the party already lives with it,
  // but it is named there, and the card can confirm it.
  it("lists rumoured quests under their own heading inside Active, with a Confirm action", async () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "active"), quest("2", "rumor")] },
      global,
    });
    const active = wrapper.findAll("section")[0]!;
    expect(active.text()).toContain("Rumoured");
    expect(active.text()).toContain("heard of, not yet begun");
    const rumourCard = wrapper.findAllComponents(QuestBoardCard).find((card) => card.props("quest").id === "2")!;
    await rumourCard.findAll("button").find((button) => button.text() === "Confirm")!.trigger("click");
    expect(wrapper.emitted("move")).toEqual([[{ id: "2", status: "active" }]]);
  });

  it("shows no Rumoured heading when nothing is rumoured", () => {
    const wrapper = mount(QuestKanbanBoard, { props: { quests: [quest("1", "active")] }, global });
    expect(wrapper.findAll("section")[0]!.text()).not.toContain("Rumoured");
  });

  it("promotes a dropped quest to the target group's primary status", async () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "rumor")] },
      global,
    });

    wrapper.getComponent(QuestBoardCard).vm.$emit("dragstart", "1");
    const settledSection = wrapper.findAll("section")[2]!;
    await settledSection.trigger("drop");
    expect(wrapper.emitted("move")).toEqual([[{ id: "1", status: "completed" }]]);
  });

  it("does not reassign a quest dropped back onto the group it already belongs to", async () => {
    const wrapper = mount(QuestKanbanBoard, {
      props: { quests: [quest("1", "rumor")] },
      global,
    });

    wrapper.getComponent(QuestBoardCard).vm.$emit("dragstart", "1");
    const activeSection = wrapper.findAll("section")[0]!;
    await activeSection.trigger("drop");
    expect(wrapper.emitted("move")).toBeUndefined();
  });
});
