import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DashboardInProgressQuests from "./DashboardInProgressQuests.vue";
import QuestChainRow from "@/components/quests/QuestChainRow.vue";
import type { CampaignLiveQuest } from "@/types/quest.types";

const chain = (
  quest_id: string,
  runtime_status: CampaignLiveQuest["runtime_status"],
  quest_title = quest_id,
): CampaignLiveQuest => ({
  quest_id, quest_title, quest_status: "active", beat_id: `${quest_id}-beat`,
  beat_title: "Who is the killer", beat_kind: "social", runtime_status,
  version: 1, updated_at: "2026-08-22T00:00:00Z",
});

const global = { stubs: { RouterLink: RouterLinkStub } };

describe("DashboardInProgressQuests", () => {
  it("separates the chain being played from ones merely left open", () => {
    const wrapper = mount(DashboardInProgressQuests, {
      global,
      props: { chains: [chain("q1", "running", "Cave of the relic"), chain("q2", "paused", "Murder mystery")] },
    });
    const text = wrapper.text();
    expect(text).toContain("Party is here");
    expect(text).toContain("Open, not being played");
    expect(wrapper.findAllComponents(QuestChainRow)).toHaveLength(2);
  });

  // After a session ends, end_campaign_quest_session pauses every chain at its
  // beat. A panel that called all of it live would claim the party is mid-scene
  // in several quests on a Sunday afternoon.
  it("never claims the party is present when every chain is only paused", () => {
    const wrapper = mount(DashboardInProgressQuests, {
      global,
      props: { chains: [chain("q1", "paused"), chain("q2", "paused")] },
    });
    expect(wrapper.text()).not.toContain("Party is here");
    expect(wrapper.text()).toContain("Open, not being played");
  });

  it("omits the paused heading when the party is in every open chain", () => {
    const wrapper = mount(DashboardInProgressQuests, {
      global,
      props: { chains: [chain("q1", "running")] },
    });
    expect(wrapper.text()).toContain("Party is here");
    expect(wrapper.text()).not.toContain("Open, not being played");
  });

  it("says nothing is open rather than rendering an empty frame", () => {
    const wrapper = mount(DashboardInProgressQuests, { global, props: { chains: [] } });
    expect(wrapper.text()).toContain("No chains are open.");
    expect(wrapper.findAllComponents(QuestChainRow)).toHaveLength(0);
  });

  it("links a chain straight into its run rather than its editor", () => {
    const wrapper = mount(DashboardInProgressQuests, {
      global,
      props: { chains: [chain("q1", "running")] },
    });
    // Scoped to the row: the card header's "Quest log →" is a RouterLink too.
    const row = wrapper.findComponent(QuestChainRow);
    expect(row.findComponent(RouterLinkStub).props("to")).toEqual({
      path: "/quests/q1",
      query: { mode: "run" },
    });
  });
});
