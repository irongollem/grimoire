import { describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import type { Quest } from "@/types/quest.types";
import type { QuestBoardSummary } from "@/lib/quests/board";
import QuestFeaturedCard from "./QuestFeaturedCard.vue";

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-a",
    user_id: "dm-1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: "The Tithe of Ashmouth",
    summary: "A widow's petition against the Guild uncovers a debt older than the city.",
    status: "active",
    giver_npc_id: null,
    location_id: null,
    tags: [],
    player_visible_to: [],
    started_at: null,
    resolved_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<QuestBoardSummary> = {}): QuestBoardSummary {
  return {
    isLive: true,
    runtimeStatus: "running",
    currentBeatTitle: "Confront Ser Vallis",
    beatSegments: ["done", "done", "here", "upcoming", "upcoming"],
    prepGapCount: 2,
    undispatchedLootCount: 0,
    unclaimedLootCount: 0,
    threads: [
      {
        id: "thread-a",
        label: "Main",
        status: "live",
        currentBeatTitle: "Confront Ser Vallis",
        beatSegments: ["done", "done", "here", "upcoming", "upcoming"],
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "thread-b",
        label: "Drowned Vault",
        status: "live",
        currentBeatTitle: "Room 2",
        beatSegments: ["here", "upcoming", "upcoming", "upcoming", "upcoming"],
        created_at: "2026-08-05T00:00:00Z",
      },
    ],
    liveThreadCount: 2,
    primaryThreadId: "thread-a",
    prepGaps: ["Vallis has no stat block", "Vault rooms 4–6 empty"],
    hasPayoffPrepared: true,
    convergesInto: [],
    unlockedBy: null,
    heldPayoffCount: 0,
    settledCaption: null,
    objectivesDone: 1,
    objectivesTotal: 3,
    ...overrides,
  };
}

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("QuestFeaturedCard", () => {
  it("names the quest, shows it is in session, and states the beat and thread tallies", () => {
    const wrapper = mount(QuestFeaturedCard, { props: { quest: quest(), summary: summary() }, global });

    expect(wrapper.text()).toContain("The Tithe of Ashmouth");
    expect(wrapper.text()).toContain("In session");
    expect(wrapper.text()).toContain("A widow's petition");
    expect(wrapper.text()).toContain("3 / 5");
    expect(wrapper.text()).toContain("2 live");
  });

  // Each thread's spine reads only its own visits, so the quest-wide tally is
  // the union: a beat only the side thread reached still counts once.
  it("counts a beat visited by any thread, once", () => {
    const wrapper = mount(QuestFeaturedCard, {
      props: {
        quest: quest(),
        summary: summary({
          beatSegments: ["done", "here", "upcoming", "upcoming", "upcoming"],
          threads: [
            { ...summary().threads[0]!, beatSegments: ["done", "here", "upcoming", "upcoming", "upcoming"] },
            { ...summary().threads[1]!, beatSegments: ["upcoming", "upcoming", "upcoming", "done", "here"] },
          ],
        }),
      },
      global,
    });
    expect(wrapper.text()).toContain("4 / 5");
  });

  it("states the objectives tally, and hides it entirely for a quest with none", () => {
    const wrapper = mount(QuestFeaturedCard, { props: { quest: quest(), summary: summary() }, global });
    expect(wrapper.text()).toContain("Objectives");
    expect(wrapper.text()).toContain("1 / 3");

    const withoutObjectives = mount(QuestFeaturedCard, {
      props: { quest: quest(), summary: summary({ objectivesDone: 0, objectivesTotal: 0 }) },
      global,
    });
    expect(withoutObjectives.text()).not.toContain("Objectives");
  });

  it("draws one spine row per live thread, each naming its own current beat", () => {
    const wrapper = mount(QuestFeaturedCard, { props: { quest: quest(), summary: summary() }, global });

    expect(wrapper.text()).toContain("Thread A");
    expect(wrapper.text()).toContain("Thread B");
    expect(wrapper.text()).toContain("Confront Ser Vallis");
    expect(wrapper.text()).toContain("Room 2");
  });

  it("names every prep gap and flags a prepared payoff", () => {
    const wrapper = mount(QuestFeaturedCard, { props: { quest: quest(), summary: summary() }, global });

    expect(wrapper.text()).toContain("Vallis has no stat block");
    expect(wrapper.text()).toContain("Vault rooms 4–6 empty");
    expect(wrapper.text()).toContain("Payoff prepared");
  });

  it("resumes onto the primary running thread and offers the story flow", () => {
    const wrapper = mount(QuestFeaturedCard, { props: { quest: quest(), summary: summary() }, global });

    const resume = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Resume run");
    const storyFlow = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Story flow");
    expect(resume?.props("to")).toMatchObject({ path: "/quests/quest-a", query: { view: "run", thread: "thread-a" } });
    expect(storyFlow?.props("to")).toMatchObject({ path: "/quests/quest-a", query: { view: "work" } });
  });
});
