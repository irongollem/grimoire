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
    rewards: null,
    reward_pp: 0,
    reward_gp: 0,
    reward_ep: 0,
    reward_sp: 0,
    reward_cp: 0,
    tags: ["harbour", "mystery"],
    description: null,
    notes: null,
    player_visible_to: [],
    reward_item_ids: [],
    reward_currency_pools: [],
    started_at: null,
    resolved_at: null,
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
  currentBeatTitle: "Bell-wardens rise from the silt",
  beatSegments: ["done", "live", "gap", "upcoming"],
  prepGapCount: 1,
  undispatchedLootCount: 3,
  unclaimedLootCount: 0,
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

    expect(wrapper.text()).toContain("Live");
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

  it("drops the Prep action from terminal statuses", () => {
    const wrapper = mount(QuestBoardCard, {
      props: { quest: quest({ status: "failed" }) },
      global,
    });
    expect(wrapper.text()).not.toContain("Prep");
    expect(wrapper.get('[aria-label="Move The Salt-Drowned Bell to Completed"]').attributes("aria-label")).toContain("Completed");
    expect(wrapper.find('[aria-label="Move The Salt-Drowned Bell to another status"]').exists()).toBe(false);
  });
});
