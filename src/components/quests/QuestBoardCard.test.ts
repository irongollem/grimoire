import { describe, expect, it } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import type { QuestBoardSummary } from "@/lib/quests/board";
import type { PartyMember } from "@/types/party.types";
import type { Quest } from "@/types/quest.types";
import QuestBoardCard from "./QuestBoardCard.vue";

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    user_id: "dm-1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: "The Salt-Drowned Bell",
    summary: "Something beneath the harbour rings on the wrong tide.",
    status: "active",
    giver_npc_id: null,
    location_id: null,
    tags: ["harbour", "mystery"],
    player_visible_to: [],
    started_at: null,
    resolved_at: null,
    entry_beat_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function partyMember(id: string, name: string): PartyMember {
  return { id, name, portrait_url: null } as PartyMember;
}

const summary: QuestBoardSummary = {
  isLive: true,
  runtimeStatus: "running",
  currentBeatTitle: "Bell-wardens rise from the silt",
  beatSegments: ["done", "here", "gap", "upcoming"],
  prepGapCount: 1,
  undispatchedLootCount: 3,
  unclaimedLootCount: 0,
  threads: [],
  liveThreadCount: 1,
  primaryThreadId: null,
  prepGaps: [],
  hasPayoffPrepared: false,
  convergesInto: [],
  unlockedBy: null,
  entersAt: null,
  heldPayoffCount: 0,
  settledCaption: null,
  objectivesDone: 0,
  objectivesTotal: 0,
};

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("QuestBoardCard", () => {
  it("is a useful legacy card before beat summaries exist", () => {
    const wrapper = mount(QuestBoardCard, { props: { quest: quest() }, global });

    expect(wrapper.text()).toContain("The Salt-Drowned Bell");
    expect(wrapper.text()).toContain("Something beneath the harbour");
    expect(wrapper.text()).toContain("harbour");
    expect(wrapper.text()).toContain("mystery");
    expect(wrapper.text()).not.toContain("Live");
    expect(wrapper.find('[aria-label$="prepared story beats"]').exists()).toBe(false);
  });

  it("renders the optional beat seam without inventing it before graph data loads", () => {
    const wrapper = mount(QuestBoardCard, {
      props: { quest: quest(), summary },
      global,
    });

    expect(wrapper.text()).toContain("Party is here");
    expect(wrapper.text()).toContain("Bell-wardens rise from the silt");
    expect(wrapper.text()).toContain("1 prep gap");
    expect(wrapper.text()).toContain("3 loot to drop");
    expect(wrapper.findAll('[aria-label="4 prepared story beats"] > span')).toHaveLength(4);
  });

  it("shows only party members the quest is shared with", () => {
    const party = [partyMember("pc-1", "Kestrel Vale"), partyMember("pc-2", "Bryn")];
    const wrapper = mount(QuestBoardCard, {
      props: {
        quest: quest({ player_visible_to: ["pc-1"] }),
        party,
      },
      global,
    });

    expect(wrapper.find('[aria-label="Shared with Kestrel Vale"]').exists()).toBe(true);
    expect(wrapper.find('[title="Kestrel Vale"]').exists()).toBe(true);
    expect(wrapper.find('[title="Bryn"]').exists()).toBe(false);
  });

  it("labels party overflow instead of showing an unexplained number", () => {
    const party = ["1", "2", "3", "4", "5"].map((id) => partyMember(`pc-${id}`, `Player ${id}`));
    const wrapper = mount(QuestBoardCard, {
      props: { quest: quest({ player_visible_to: party.map((member) => member.id) }), party },
      global,
    });

    expect(wrapper.text()).toContain("+1 player");
    expect(wrapper.find('[title="1 more player"]').exists()).toBe(true);
  });

  it("offers compact keyboard-native moves to adjacent lanes", async () => {
    const wrapper = mount(QuestBoardCard, { props: { quest: quest() }, global });

    expect(wrapper.find("select").exists()).toBe(false);
    await wrapper.get('[aria-label="Move The Salt-Drowned Bell to Completed"]').trigger("click");
    expect(wrapper.emitted("move")).toEqual([["completed"]]);
  });

  it("drops the Open action from terminal statuses", () => {
    const wrapper = mount(QuestBoardCard, {
      props: { quest: quest({ status: "failed" }) },
      global,
    });
    expect(wrapper.text()).not.toContain("Open");
    expect(wrapper.get('[aria-label="Move The Salt-Drowned Bell to Completed"]').attributes("aria-label")).toContain("Completed");
    expect(wrapper.find('[aria-label="Move The Salt-Drowned Bell to another status"]').exists()).toBe(false);
  });

  it("draws one spine row per live thread instead of the single-thread seam", () => {
    const withThreads: QuestBoardSummary = {
      ...summary,
      threads: [
        { id: "t-a", label: "Main", status: "live", currentBeatTitle: "Confront Ser Vallis", beatSegments: ["done", "here", "upcoming"], created_at: "2026-08-01T00:00:00Z" },
        { id: "t-b", label: "Vault", status: "live", currentBeatTitle: "Room 2", beatSegments: ["here", "upcoming", "upcoming"], created_at: "2026-08-05T00:00:00Z" },
      ],
    };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest(), summary: withThreads }, global });

    expect(wrapper.find('[aria-label="4 prepared story beats"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("A");
    expect(wrapper.text()).toContain("B");
  });

  it("names what an undiscovered quest is waiting on", () => {
    const noBeats: QuestBoardSummary = { ...summary, isLive: false, beatSegments: [], unlockedBy: "The Vault's Keeper" };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest({ status: "undiscovered" }), summary: noBeats }, global });

    expect(wrapper.text()).toContain("Unlocked by The Vault's Keeper");
    expect(wrapper.text()).toContain("no beats yet");
    const draftBeats = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Draft beats");
    expect(draftBeats?.props("to")).toMatchObject({ path: "/quests/quest-1", query: { view: "work" } });
  });

  it("names where a bridge lands alongside what unlocked it", () => {
    const withEntry: QuestBoardSummary = {
      ...summary,
      isLive: false,
      beatSegments: [],
      unlockedBy: "The Vault's Keeper",
      entersAt: "The sealed antechamber",
    };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest({ status: "undiscovered" }), summary: withEntry }, global });

    expect(wrapper.text()).toContain("Unlocked by The Vault's Keeper · enters at The sealed antechamber · no beats yet");
  });

  it("reads a held, unnamed unlock rule as a caption of its own", () => {
    const held: QuestBoardSummary = { ...summary, isLive: false, heldPayoffCount: 1 };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest({ status: "undiscovered" }), summary: held }, global });
    expect(wrapper.text()).toContain("Held payoff — not yet fired");
    expect(wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Draft beats")).toBeUndefined();
  });

  it("dims a settled quest and states how the run actually ended", () => {
    const settled: QuestBoardSummary = { ...summary, isLive: false, settledCaption: "Session 19 · ledger settled" };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest({ status: "completed" }), summary: settled }, global });

    expect(wrapper.text()).toContain("Session 19 · ledger settled");
    expect(wrapper.get("article").classes()).toContain("opacity-[0.72]");
  });

  it("names the quest a route out of this one actually landed on", () => {
    const converging: QuestBoardSummary = { ...summary, convergesInto: ["The Tithe of Ashmouth"] };
    const wrapper = mount(QuestBoardCard, { props: { quest: quest(), summary: converging }, global });

    expect(wrapper.text()).toContain("Converges into");
    expect(wrapper.text()).toContain("The Tithe of Ashmouth");
    expect(wrapper.text()).toContain("links out");
  });
});
