import { describe, it, expect } from "vitest";
import type { Quest } from "@/types/quest.types";
import type { QuestBoardSummary } from "@/lib/quests/board";
import { deriveQuestLootRows } from "./questLoot";

const quest = (id: string, title: string): Quest => ({
  id,
  user_id: "user-1",
  campaign_id: "campaign-1",
  parent_quest_id: null,
  title,
  summary: null,
  status: "active",
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const summary = (undispatched: number, unclaimed: number): QuestBoardSummary => ({
  isLive: false,
  runtimeStatus: null,
  currentBeatTitle: null,
  beatSegments: [],
  prepGapCount: 0,
  undispatchedLootCount: undispatched,
  unclaimedLootCount: unclaimed,
});

describe("deriveQuestLootRows", () => {
  it("returns nothing for no summaries", () => {
    expect(deriveQuestLootRows({}, [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  it("returns nothing when every summary has zero pending loot", () => {
    const summaries = { q1: summary(0, 0) };
    expect(deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  it("rows a quest with only undispatched loot, leaving unclaimed at zero", () => {
    const summaries = { q1: summary(3, 0) };
    expect(deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")])).toEqual([
      { questId: "q1", questTitle: "The Sunken Keep", undispatchedCount: 3, unclaimedCount: 0 },
    ]);
  });

  it("rows a quest with only unclaimed loot, leaving undispatched at zero", () => {
    const summaries = { q1: summary(0, 2) };
    expect(deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")])).toEqual([
      { questId: "q1", questTitle: "The Sunken Keep", undispatchedCount: 0, unclaimedCount: 2 },
    ]);
  });

  it("rows a quest with both, keeping the two counts distinct rather than summed", () => {
    const summaries = { q1: summary(1, 4) };
    const rows = deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")]);
    // One row, two separate counts — never a single merged "5 pending".
    expect(rows).toEqual([
      { questId: "q1", questTitle: "The Sunken Keep", undispatchedCount: 1, unclaimedCount: 4 },
    ]);
  });

  it("drops a summary whose quest id has no matching quest, without crashing", () => {
    const summaries = { "deleted-quest": summary(2, 1) };
    expect(deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  it("sorts undispatched-first, since that is the DM's own action item", () => {
    const summaries = {
      q1: summary(0, 5), // unclaimed only
      q2: summary(1, 0), // undispatched only, smaller count
    };
    const rows = deriveQuestLootRows(summaries, [
      quest("q1", "Awaiting Claim"),
      quest("q2", "Needs a Drop"),
    ]);
    expect(rows.map((row) => row.questId)).toEqual(["q2", "q1"]);
  });

  it("breaks undispatched ties by the larger unclaimed count, then by title", () => {
    const summaries = {
      a: summary(1, 1),
      b: summary(1, 3),
      c: summary(1, 3),
    };
    const rows = deriveQuestLootRows(summaries, [
      quest("a", "Zebra Quest"),
      quest("b", "Bravo Quest"),
      quest("c", "Alpha Quest"),
    ]);
    expect(rows.map((row) => row.questId)).toEqual(["c", "b", "a"]);
  });
});
