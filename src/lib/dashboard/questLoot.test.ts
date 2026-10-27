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
  tags: [],
  player_visible_to: [],
  started_at: null,
  resolved_at: null,
  entry_beat_id: null,
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
  threads: [],
  liveThreadCount: 0,
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
});

describe("deriveQuestLootRows", () => {
  it("returns nothing for no summaries", () => {
    expect(deriveQuestLootRows({}, [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  it("returns nothing when every summary has zero pending loot", () => {
    const summaries = { q1: summary(0, 0) };
    expect(deriveQuestLootRows(summaries, [quest("q1", "The Sunken Keep")])).toEqual([]);
  });

  // The two counts stay distinct (never a merged "5 pending"), and either one alone is enough to row.
  it.each([
    [3, 0],
    [0, 2],
    [1, 4],
  ])("rows a quest with %i undispatched and %i unclaimed, keeping the counts apart", (undispatched, unclaimed) => {
    const rows = deriveQuestLootRows({ q1: summary(undispatched, unclaimed) }, [quest("q1", "The Sunken Keep")]);
    expect(rows).toEqual([
      { questId: "q1", questTitle: "The Sunken Keep", undispatchedCount: undispatched, unclaimedCount: unclaimed },
    ]);
  });

  it("names an untitled quest rather than rendering a blank row", () => {
    const rows = deriveQuestLootRows({ q1: summary(1, 0) }, [quest("q1", "")]);
    expect(rows[0].questTitle).toBe("Untitled Quest");
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
    // "a" has the alphabetically first title but the fewest unclaimed, so it
    // must still come last; b and c tie on both counts and fall to the title.
    const rows = deriveQuestLootRows(summaries, [
      quest("a", "Alpha Quest"),
      quest("b", "Zebra Quest"),
      quest("c", "Bravo Quest"),
    ]);
    expect(rows.map((row) => row.questId)).toEqual(["c", "b", "a"]);
  });
});
